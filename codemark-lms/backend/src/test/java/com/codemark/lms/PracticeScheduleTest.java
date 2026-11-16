package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.mock.web.MockHttpServletRequest;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:practice;DB_CLOSE_DELAY=-1", "codemark.token-key=a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s="})
@Transactional
class PracticeScheduleTest {
  @Autowired Store store;
  Course course(String cadence) {
    Course c=new Course(); c.code=UUID.randomUUID().toString(); c.practiceCadence=cadence;
    return store.save(c);
  }
  Assessment practice(Course c,String time,boolean published,String kind) {
    Assessment a=new Assessment(); a.course=c; a.title="Practice"; a.kind=kind;
    a.opensAt=Instant.parse(time); a.closesAt=a.opensAt.plusSeconds(3600); a.published=published;
    store.save(a); store.flush(); return a;
  }
  void validate(Course c,String time) {
    PracticeSchedule.validate(store,c,"quiz",true,Instant.parse(time),null,null);
  }
  @Test void vietnamDayAndMondayWeekBoundaries() {
    assertEquals(LocalDate.parse("2026-11-09"),PracticeSchedule.slot(Instant.parse("2026-11-08T17:00:00Z"),"daily"));
    assertEquals(LocalDate.parse("2026-11-02"),PracticeSchedule.slot(Instant.parse("2026-11-08T16:59:59Z"),"weekly"));
    assertEquals(LocalDate.parse("2026-11-09"),PracticeSchedule.slot(Instant.parse("2026-11-08T17:00:00Z"),"weekly"));
  }
  @Test void dailyWeeklyDuplicateAndIndependentCourse() {
    Course daily=course("daily"), weekly=course("weekly"), other=course("weekly");
    practice(daily,"2030-11-04T00:00:00Z",true,"quiz");
    practice(weekly,"2030-11-04T00:00:00Z",true,"code");
    assertThrows(Api.Failure.class,()->validate(daily,"2030-11-04T16:59:59Z"));
    assertDoesNotThrow(()->validate(daily,"2030-11-04T17:00:00Z"));
    assertThrows(Api.Failure.class,()->validate(weekly,"2030-11-10T16:59:59Z"));
    assertDoesNotThrow(()->validate(weekly,"2030-11-10T17:00:00Z"));
    assertDoesNotThrow(()->validate(other,"2030-11-04T00:00:00Z"));
  }
  @Test void draftsExamsAndExternalQuizzesShareOnlyPracticeSlots() {
    Course c=course("weekly"); String time="2030-11-04T00:00:00Z";
    practice(c,time,false,"quiz"); practice(c,time,true,"exam");
    assertDoesNotThrow(()->validate(c,time));
    QuizLink q=new QuizLink(); q.course=c; q.opensAt=Instant.parse(time); store.save(q);
    assertThrows(Api.Failure.class,()->validate(c,time));
    assertDoesNotThrow(()->PracticeSchedule.validate(store,c,"exam",true,q.opensAt,null,null));
    assertDoesNotThrow(()->PracticeSchedule.validate(store,c,"quiz",false,q.opensAt,null,null));
  }
  @Test void cadenceChangeRejectsFutureCollisionsButPreservesHistory() {
    Course c=course("daily");
    practice(c,"2000-11-06T00:00:00Z",true,"quiz"); practice(c,"2000-11-07T00:00:00Z",true,"quiz");
    assertDoesNotThrow(()->PracticeSchedule.validateCadenceChange(store,c,"weekly"));
    practice(c,"2030-11-04T00:00:00Z",true,"quiz"); practice(c,"2030-11-05T00:00:00Z",true,"quiz");
    assertThrows(Api.Failure.class,()->PracticeSchedule.validateCadenceChange(store,c,"weekly"));
  }
  @Test void futureStudentAccessIsDeniedAndLegacyHarmlessEditsAllowed() {
    Course c=course("weekly");
    Assessment a=practice(c,"2030-11-04T00:00:00Z",true,"quiz");
    practice(c,"2030-11-05T00:00:00Z",true,"quiz");
    Access access=mock(Access.class); User u=new User();
    var request=new MockHttpServletRequest();
    when(access.current(request)).thenReturn(u); when(access.role(u,c)).thenReturn("student");
    AssessmentController controller=new AssessmentController(store,access,mock(Views.class),mock(GradingService.class),mock(ContainerRunner.class),mock(RealtimeHub.class));
    assertThrows(Api.Failure.class,()->controller.allowed(u,a.id,false));
    assertDoesNotThrow(()->controller.allowed(u,a.id,true));
    assertDoesNotThrow(()->controller.edit(request,a.id,Map.of("title","Edited legacy title")));
    assertEquals("Edited legacy title",a.title);
    practice(c,"2030-11-11T00:00:00Z",true,"quiz");
    assertThrows(Api.Failure.class,()->controller.edit(request,a.id,Map.of("opensAt","2030-11-11T01:00:00Z","closesAt","2030-11-11T02:00:00Z")));
  }
}
