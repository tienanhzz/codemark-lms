package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:positions;DB_CLOSE_DELAY=-1"})
@Transactional
class RankPositionTest {
  @Autowired RankDemoSeed demo;
  @Autowired RankService rank;
  @Autowired Store store;
  @Autowired AnnouncementCleanup cleanup;

  @Test void cleanupDeletesLowRankOnlyNoticesAndRewritesMixedNoticesOnce() {
    HomeAnnouncement manual=new HomeAnnouncement(); manual.authorId=1L; manual.authorRole="teacher";
    manual.title="Thông báo giảng viên"; manual.body="Silver → Bronze"; store.save(manual);
    HomeAnnouncement low=new HomeAnnouncement(); low.authorId=1L; low.authorRole="system";
    low.title="Cập nhật rank"; low.body="Bảo: Gold → Silver (#6).\nLinh: Silver → Bronze (#11)."; store.save(low);
    HomeAnnouncement mixed=new HomeAnnouncement(); mixed.authorId=1L; mixed.authorRole="system";
    mixed.title="Cập nhật rank · JAVA01 · Java";
    mixed.body="Anh: Silver → Gold (#5).\nBảo: Gold → Silver (#6)."; store.save(mixed);
    var createdAt=mixed.createdAt;
    cleanup.run(null); store.flush();
    assertTrue(store.list(HomeAnnouncement.class,"where e.id=?1",low.id).isEmpty());
    assertEquals("Silver → Bronze",manual.body);
    assertEquals("Biên niên chiến hạng · JAVA01 · Java",mixed.title);
    assertTrue(mixed.body.contains("Xin chúc mừng chiến binh **Anh**"));
    assertFalse(mixed.body.contains("Silver"));
    assertEquals(createdAt,mixed.createdAt);
    String body=mixed.body; int count=store.all(HomeAnnouncement.class).size();
    cleanup.run(null); store.flush();
    assertEquals(body,mixed.body); assertEquals(count,store.all(HomeAnnouncement.class).size());
  }

  @Test void bronzeAndSilverChangesStaySilentAndGoldPromotionIsCelebrated() {
    demo.seed();
    User actor=store.list(User.class,"where e.role='admin'").get(0);
    Course course=store.all(Course.class).get(0);
    var board=rank.board(actor,course.id);
    User last=store.get(User.class,((Number)board.get(24).get("userId")).longValue());
    int count=store.all(HomeAnnouncement.class).size();
    rank.append(last,rank.active(),course,"manual",0,1,"Small change",actor);
    assertEquals(count,store.all(HomeAnnouncement.class).size());
    double original=((Number)board.get(24).get("points")).doubleValue();
    double silver=((Number)board.get(8).get("points")).doubleValue()+0.5;
    rank.append(last,rank.active(),course,"manual",0,silver-original-1,"Silver promotion",actor);
    assertEquals(count,store.all(HomeAnnouncement.class).size());
    double gold=((Number)board.get(4).get("points")).doubleValue()+0.5;
    rank.append(last,rank.active(),course,"manual",0,gold-silver,"Gold promotion",actor);
    var notices=store.all(HomeAnnouncement.class);
    assertTrue(notices.size()>count);
    String body=notices.get(notices.size()-1).body;
    assertTrue(body.contains("**"+last.name+"**"));
    assertTrue(body.contains("**Gold**"));
    assertTrue(body.contains("EXP**"));
    assertFalse(body.contains("**Bronze**"));
    assertFalse(body.contains("**Silver**"));
    HomeAnnouncement legacy=new HomeAnnouncement(); legacy.authorRole="system";
    legacy.body="Low: Silver → Bronze (#11).\nHigh: Bronze → Silver (#10).";
    assertEquals("",HomeController.displayBody(legacy));
    legacy.authorRole="teacher";
    assertEquals(legacy.body,HomeController.displayBody(legacy));
  }

  @Test void rewardsAreIndependentPerCourseAndWeeklyBonusHasNoExpCap() {
    demo.seed();
    User actor=store.list(User.class,"where e.role='admin'").get(0);
    Course first=store.all(Course.class).get(0);
    User student=store.list(Enrollment.class,"where e.course=?1",first).get(0).user;
    Course second=new Course(); second.code="SECOND"; second.title="Second"; second.owner=actor; second.published=true; store.save(second);
    Enrollment member=new Enrollment(); member.course=second; member.user=student; member.courseRole="student"; store.save(member);
    Season season=rank.active();
    java.time.Instant start=java.time.Instant.parse("2026-11-02T03:00:00Z");
    season.startsAt=start.minusSeconds(1); season.endsAt=start.plusSeconds(90L*86400);
    rank.complete(student,second,"assignment",1,"expert",49,actor,start);
    assertEquals(0.0,((Number)rank.board(actor,second.id).get(0).get("points")).doubleValue());
    rank.complete(student,second,"assignment",1,"expert",50,actor,start);
    rank.complete(student,second,"assignment",1,"expert",100,actor,start);
    rank.complete(student,second,"assignment",2,"medium",50,actor,start.plusSeconds(7L*86400));
    rank.complete(student,second,"assignment",3,"hard",50,actor,start.plusSeconds(7L*86400));
    assertEquals(14.0,((Number)rank.board(actor,second.id).get(0).get("points")).doubleValue());
    rank.append(student,season,second,"manual",0,150,"Adjustment",actor);
    assertEquals(164.0,((Number)rank.board(actor,second.id).get(0).get("points")).doubleValue());
    assertTrue(rank.board(actor,first.id).stream().filter(r->r.get("userId").equals(student.id)).allMatch(r->((Number)r.get("points")).doubleValue()<=150));
  }

  @Test void initialRosterAnnouncementsFitStorageLimit() {
    demo.seed();
    User actor=store.list(User.class,"where e.role='admin'").get(0);
    Course course=store.all(Course.class).get(0);
    for(int i=0;i<120;i++) {
      User u=new User(); u.name="Student "+i+" "+"x".repeat(170); u.role="student";
      u.studentId=String.valueOf(2026800000L+i); store.save(u);
      Enrollment en=new Enrollment(); en.course=course; en.user=u; store.save(en);
    }
    int before=store.all(HomeAnnouncement.class).size();
    rank.announceChanges(List.of(),actor);
    var notices=store.all(HomeAnnouncement.class).subList(before,store.all(HomeAnnouncement.class).size());
    assertFalse(notices.isEmpty());
    assertTrue(notices.stream().noneMatch(n->n.body.contains("**Bronze**")));
    assertTrue(notices.stream().anyMatch(n->n.body.contains("Xin chúc mừng chiến binh **")));
    assertTrue(notices.stream().allMatch(n->n.body.length()<=10000));
  }

  @Test void seedIsRepeatableAndRanksFollowPositionsWithDisplacementAnnouncements() {
    demo.seed();
    User actor=store.list(User.class,"where e.role='admin'").get(0);
    var rows=rank.board(actor,null);
    assertEquals(25,rows.size());
    String[] expected={"Master","Ruby","Diamond","Gold","Gold","Silver","Silver","Silver","Silver","Silver","Bronze"};
    for(int i=0;i<expected.length;i++) assertEquals(expected[i],rows.get(i).get("tier"));
    assertTrue(rows.stream().allMatch(r->((Number)r.get("points")).doubleValue()>=0));
    int entries=store.all(PointEntry.class).size();
    int announcements=store.all(HomeAnnouncement.class).size();
    demo.seed();
    assertEquals(25,rank.board(actor,null).size());
    assertEquals(entries,store.all(PointEntry.class).size());
    assertEquals(announcements,store.all(HomeAnnouncement.class).size());
    User last=store.get(User.class,((Number)rows.get(24).get("userId")).longValue());
    rank.append(last,rank.active(),store.all(Course.class).get(0),"manual",0,10000,"Rank test",actor);
    var after=rank.board(actor,null);
    assertEquals(last.id,after.get(0).get("userId"));
    var news=store.all(HomeAnnouncement.class);
    assertEquals(announcements+1,news.size());
    String body=news.get(news.size()-1).body;
    assertTrue(body.contains(last.name));
    assertTrue(body.contains("Master"));
    assertTrue(body.contains((String)rows.get(0).get("name")));
    assertTrue(body.contains("Ruby"));
    rank.complete(last,store.all(Course.class).get(0),"assignment",987654,"easy",90,actor,java.time.Instant.now());
    int awarded=store.all(PointEntry.class).size();
    int notices=store.all(HomeAnnouncement.class).size();
    rank.complete(last,store.all(Course.class).get(0),"assignment",987654,"easy",90,actor,java.time.Instant.now());
    rank.complete(last,store.all(Course.class).get(0),"assignment",987654,"easy",70,actor,java.time.Instant.now());
    assertEquals(awarded,store.all(PointEntry.class).size());
    assertEquals(notices,store.all(HomeAnnouncement.class).size());
  }
}
