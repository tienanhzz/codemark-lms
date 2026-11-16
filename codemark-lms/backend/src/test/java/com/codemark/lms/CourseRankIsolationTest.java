package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:courseRankIsolation;DB_CLOSE_DELAY=-1"})
@Transactional
class CourseRankIsolationTest {
  @Autowired Store store;
  @Autowired RankService rank;
  @Autowired RankDemoSeed demo;

  private Course course(String code,User owner) {
    Course c=new Course(); c.code=code; c.title=code; c.owner=owner; c.published=true;
    return store.save(c);
  }
  private Map<Long,Double> points(User actor,Course course) {
    var result=new HashMap<Long,Double>();
    rank.board(actor,course.id).forEach(row->result.put(((Number)row.get("userId")).longValue(),((Number)row.get("points")).doubleValue()));
    return result;
  }

  @Test void sampleScoresDifferByCourseAndRerunPreservesEarnedPoints() {
    User actor=store.list(User.class,"where e.role='admin'").get(0);
    Course first=course("CLASS-A",actor), second=course("CLASS-B",actor);
    // Simulate an old cloned sample balance in the second course.
    User existing=new User(); existing.name="Existing sample"; existing.studentId="2026900001"; existing.role="student"; store.save(existing);
    PointEntry old=new PointEntry(); old.studentId=existing.id; old.studentCode=existing.studentId; old.seasonId=season().id;
    old.courseId=second.id; old.sourceType="demo_rebalance"; old.sourceId=0L; old.points=150; old.reason="Old duplicated sample"; old.createdBy=actor.id; store.save(old);
    demo.seed();
    var a=points(actor,first); var b=points(actor,second);
    assertEquals(25,a.size()); assertEquals(a.keySet(),b.keySet());
    assertNotEquals(a,b,"Each course must have its own sample balances");
    assertNotEquals(new HashSet<>(a.values()),new HashSet<>(b.values()),"The sorted score distribution must also vary by course");
    assertEquals(25,new HashSet<>(a.values()).size());
    assertEquals(25,new HashSet<>(b.values()).size());
    assertTrue(a.values().stream().allMatch(p->p>=0 && p<=150));
    assertTrue(b.values().stream().allMatch(p->p>=0 && p<=150));
    User student=store.get(User.class,a.keySet().iterator().next());
    rank.complete(student,first,"assignment",891,"easy",75,actor,java.time.Instant.now());
    rank.append(student,rank.active(),first,"manual",0,7,"Confirmed manual credit",actor);
    assertEquals(a.get(student.id)+9,points(actor,first).get(student.id));
    var earned=points(actor,first); int entries=store.all(PointEntry.class).size(); int notices=store.all(HomeAnnouncement.class).size();
    demo.seed(); demo.seed();
    assertEquals(earned,points(actor,first)); assertEquals(b,points(actor,second));
    assertEquals(entries,store.all(PointEntry.class).size()); assertEquals(notices,store.all(HomeAnnouncement.class).size());
  }

  private Season season() {
    Season s=new Season(); s.name="Test"; s.active=true;
    s.startsAt=java.time.Instant.now().minusSeconds(60); s.endsAt=java.time.Instant.now().plusSeconds(86400);
    return store.save(s);
  }

  @Test void awardOnlyChangesTheMatchingStudentInTheMatchingCourse() {
    User actor=store.list(User.class,"where e.role='admin'").get(0);
    Course first=course("SCOPE-A",actor), second=course("SCOPE-B",actor);
    demo.seed();
    var beforeA=points(actor,first); var beforeB=points(actor,second);
    User recipient=store.get(User.class,beforeA.keySet().iterator().next());
    rank.complete(recipient,first,"assignment",987,"expert",60,actor,java.time.Instant.now());
    var expected=new HashMap<>(beforeA); expected.merge(recipient.id,5.0,Double::sum);
    assertEquals(expected,points(actor,first)); assertEquals(beforeB,points(actor,second));
  }
}
