package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:progresscore;DB_CLOSE_DELAY=-1"})
@Transactional
class ProgressCoreTest {
  @Autowired Store store;
  @Autowired RankService rank;
  @Autowired RankDemoSeed seed;

  User user(String code,String role) { User u=new User();u.studentId=code;u.name=role+code;u.role=role;return store.save(u); }
  Course course(User teacher,User student) {
    Course c=new Course();c.code="C"+UUID.randomUUID();c.title="Course";c.owner=teacher;c.published=true;store.save(c);
    for(User u:List.of(teacher,student)){Enrollment e=new Enrollment();e.course=c;e.user=u;e.courseRole=u.role;store.save(e);}return c;
  }
  void season(){Season s=new Season();s.name="Season";s.active=true;s.startsAt=Instant.now().minusSeconds(86400*7);s.endsAt=Instant.now().plusSeconds(86400*7);store.save(s);}

  @Test void roleScopedActionsDeduplicateAndMaterialUpgradeTotalsSix() {
    season();User teacher=user("1006100001","teacher"),student=user("2026100001","student");Course c=course(teacher,student);Instant now=Instant.now();
    rank.awardAction(student,c,"material_download",1,student,now);rank.awardAction(student,c,"material_download",1,student,now);
    rank.awardAction(teacher,c,"teacher_material",1,teacher,now);rank.awardAction(teacher,c,"teacher_advanced_material",1,teacher,now);
    rank.awardAction(teacher,c,"teacher_advanced_material",1,teacher,now);
    assertEquals(3.0,rank.board(student,c.id).get(0).get("points"));
    assertEquals(6.0,rank.teacherBoard(teacher,c.id).get(0).get("points"));
    rank.awardAction(student,null,"daily_login",123,student,now);rank.awardAction(student,null,"daily_login",999,student,now);
    assertEquals(6.0,rank.profile(student).get("totalPoints"));
    assertEquals(3.0,rank.profile(student).get("globalPoints"));
    assertThrows(Api.Failure.class,()->rank.awardAction(student,c,"teacher_material",3,student,now));
  }

  @Test void submissionUsesHighestRewardAndNeverStacksAttempts() {
    season();User teacher=user("1006100002","teacher"),student=user("2026100002","student");Course c=course(teacher,student);Instant now=Instant.now();
    Assessment a=new Assessment();a.course=c;a.kind="code";a.closesAt=now.plusSeconds(90000);store.save(a);
    Attempt t=new Attempt();t.assessment=a;t.student=student;t.submittedAt=now;t.maxScore=10;t.score=5.0;store.save(t);
    rank.awardSubmission(t,student,now);rank.awardSubmission(t,student,now);
    assertEquals(5.0,rank.board(student,c.id).get(0).get("points"));
    t.score=10.0;rank.awardSubmission(t,teacher,now);rank.awardSubmission(t,teacher,now);
    assertEquals(7.0,rank.board(student,c.id).get(0).get("points"));
    assertEquals(0.0,rank.teacherBoard(teacher,c.id).get(0).get("points"));
  }

  @Test void teacherSamplesAreDistinctAndRepeatable() {
    seed.seed();User admin=store.list(User.class,"where e.role='admin'").get(0);
    var courses=store.list(Course.class,"where e.published=true order by e.id");
    var teachers=store.list(User.class,"where e.studentId like '10069000%'");assertEquals(4*courses.size(),teachers.size());
    var board=rank.teacherBoard(admin,null);assertEquals(4*courses.size(),board.size());
    for(Course course:courses) {
      var rows=rank.teacherBoard(admin,course.id);assertEquals(4,rows.size());
      assertEquals(4,rows.stream().map(r->r.get("points")).distinct().count());
      assertTrue(rows.stream().allMatch(r->{double p=((Number)r.get("points")).doubleValue();return p>=0&&p<=130;}));
    }
    int entries=store.all(PointEntry.class).size();seed.seed();
    assertEquals(entries,store.all(PointEntry.class).size());assertEquals(board,rank.teacherBoard(admin,null));
  }

  @Test void dailyRewardsUseVietnamCalendarAndClassGradingCannotBeClaimedTwice() {
    season();User teacher=user("1006100011","teacher"),other=user("1006100012","teacher"),student=user("2026100011","student");Course c=course(teacher,student);
    Enrollment e=new Enrollment();e.course=c;e.user=other;e.courseRole="teacher";store.save(e);
    Instant before=Instant.parse("2026-11-09T16:59:59Z"),after=before.plusSeconds(1);
    Season active=rank.active();active.startsAt=before.minusSeconds(86400);active.endsAt=after.plusSeconds(86400);
    rank.awardAction(student,null,"daily_login",1,student,before);rank.awardAction(student,null,"daily_login",2,student,before);
    rank.awardAction(student,null,"daily_login",3,student,after);
    assertEquals(6.0,rank.profile(student).get("globalPoints"));
    rank.awardAction(teacher,c,"teacher_grading",77,teacher,before);rank.awardAction(other,c,"teacher_grading",77,other,before);
    assertEquals(5.0,rank.teacherBoard(teacher,c.id).stream().mapToDouble(r->((Number)r.get("points")).doubleValue()).sum());
  }
}
