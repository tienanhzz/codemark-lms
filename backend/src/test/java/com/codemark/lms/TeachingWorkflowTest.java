package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:teachingWorkflow;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc @Transactional
class TeachingWorkflowTest {
  @Autowired Store store; @Autowired Access access; @Autowired RankService rank;
  @Autowired MockMvc mvc; @Autowired ObjectMapper json;
  User teacher,student; Course course; Assessment assessment; Question question; Attempt attempt;

  @BeforeEach void setup() {
    teacher=user("9410000001","teacher"); student=user("9410000002","student");
    course=new Course(); course.code="WF101"; course.title="Teaching workflow"; course.owner=teacher; course.published=true; store.save(course);
    for(User user:List.of(teacher,student)) { Enrollment e=new Enrollment(); e.course=course; e.user=user; e.courseRole=user.role; store.save(e); }
    Season season=new Season(); season.active=true; season.name="Workflow"; season.startsAt=Instant.now().minusSeconds(86400); season.endsAt=Instant.now().plusSeconds(86400); store.save(season);
    assessment=new Assessment(); assessment.course=course; assessment.createdBy=teacher; assessment.title="Project"; assessment.kind="code"; assessment.published=true;
    assessment.opensAt=Instant.now().minusSeconds(86400); assessment.closesAt=Instant.now().plusSeconds(90000); assessment.gradingDueAt=assessment.closesAt.plusSeconds(86400); store.save(assessment);
    question=new Question(); question.assessment=assessment; question.kind="short"; question.prompt="Explain the invariant"; question.answer="Invariant"; question.points=10; store.save(question);
    attempt=new Attempt(); attempt.assessment=assessment; attempt.student=student; attempt.status="submitted"; attempt.submittedAt=Instant.now(); attempt.deadline=assessment.closesAt;
    attempt.score=5.0; attempt.maxScore=10; attempt.answers.put(question.id.toString(),"My explanation"); store.save(attempt);
  }
  User user(String code,String role) { User u=new User();u.studentId=code;u.name=role;u.role=role;u.passwordHash=access.hash("CodeMark@2026!");return store.save(u); }
  MockHttpSession login(User user) throws Exception {
    return (MockHttpSession)mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsBytes(Api.map("studentId",user.studentId,"password","CodeMark@2026!"))))
      .andExpect(status().isOk()).andReturn().getRequest().getSession();
  }

  @Test void dailyLoginIsGlobalOncePerDayAndDoesNotInflateCourseScores() throws Exception {
    login(student); login(student);
    var entries=store.list(PointEntry.class,"where e.studentId=?1 and e.sourceType='daily_login'",student.id);
    assertEquals(1,entries.size()); assertEquals(3,entries.get(0).points); assertNull(entries.get(0).courseId);
    assertEquals(0.0,rank.board(student,course.id).get(0).get("points"));
  }

  @Test void detailedGradingEarnsReputationOnceAndStudentCannotGrade() throws Exception {
    var staff=login(teacher); var learner=login(student);
    var body=Api.map("score",10,"feedback","Giải thích nguyên nhân và cách sửa cụ thể. ".repeat(8),"inlineFeedback",Map.of(question.id.toString(),"Hãy giữ đúng bất biến và bổ sung kiểm tra điều kiện biên trong đoạn trả lời này."));
    mvc.perform(patch("/api/attempts/"+attempt.id+"/grade").session(learner).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().isForbidden());
    for(int i=0;i<2;i++) mvc.perform(patch("/api/attempts/"+attempt.id+"/grade").session(staff).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().isOk());
    assertEquals(12.0,rank.teacherBoard(teacher,course.id).get(0).get("points"));
    assertEquals(7.0,rank.board(student,course.id).get(0).get("points"));
    assertEquals(teacher.id,attempt.gradedBy);
    mvc.perform(get("/api/attempts/"+attempt.id).session(learner)).andExpect(status().isOk()).andExpect(jsonPath("$.inlineFeedback['"+question.id+"']").exists());
  }

  @Test void incompleteGradingOrInsufficientFeedbackEarnsNoTeacherPoints() throws Exception {
    User peer=user("9410000003","student"); Enrollment e=new Enrollment();e.course=course;e.user=peer;e.courseRole="student";store.save(e);
    var staff=login(teacher);
    mvc.perform(patch("/api/attempts/"+attempt.id+"/grade").session(staff).contentType("application/json").content(json.writeValueAsBytes(Api.map("score",8,"feedback","Chưa đủ chi tiết","inlineFeedback",Map.of())))).andExpect(status().isOk());
    assertEquals(0.0,rank.teacherBoard(teacher,course.id).get(0).get("points"));
    mvc.perform(patch("/api/attempts/"+attempt.id+"/grade").session(staff).contentType("application/json").content(json.writeValueAsBytes(Api.map("score",8,"feedback","x".repeat(250),"inlineFeedback",Map.of("999999","Nhận xét không thuộc bài kiểm tra này"))))).andExpect(status().isBadRequest());
  }
}
