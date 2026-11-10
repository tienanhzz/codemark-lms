package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.fasterxml.jackson.databind.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:engagement;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc @Transactional
class CourseEngagementTest {
  @Autowired Store store; @Autowired Access access; @Autowired MockMvc mvc; @Autowired ObjectMapper json;
  record Fixture(User teacher,User student,User peer,Course course,MockHttpSession teacherSession,MockHttpSession studentSession,MockHttpSession peerSession) {}
  User user(String code,String role) {
    User u=new User(); u.studentId=code; u.name=role+code; u.role=role; u.passwordHash=access.hash("Engagement@2026!"); return store.save(u);
  }
  MockHttpSession login(User u) throws Exception {
    return (MockHttpSession)mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsBytes(Api.map("studentId",u.studentId,"password","Engagement@2026!"))))
        .andExpect(status().isOk()).andReturn().getRequest().getSession();
  }
  Fixture setup() throws Exception {
    User t=user("1006800001","teacher"), s=user("2026800001","student"), p=user("2026800002","student");
    Course c=new Course(); c.owner=t; c.code="ENG"; c.title="Engagement"; c.published=true; store.save(c);
    for(User u:java.util.List.of(s,p)) { Enrollment e=new Enrollment(); e.course=c; e.user=u; e.courseRole="student"; store.save(e); }
    Season season=new Season(); season.name="Engagement"; season.active=true; season.startsAt=Instant.now().minusSeconds(3600); season.endsAt=Instant.now().plusSeconds(86400); store.save(season);
    return new Fixture(t,s,p,c,login(t),login(s),login(p));
  }
  JsonNode create(String path,Object body,MockHttpSession session) throws Exception {
    return json.readTree(mvc.perform(post(path).session(session).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString());
  }
  double points(User u) { return store.list(PointEntry.class,"where e.studentId=?1 and e.courseId is not null",u.id).stream().mapToDouble(e->e.points).sum(); }

  @Test void downloadingPublishedMaterialAndPublishingAdvancedContentCannotFarmPoints() throws Exception {
    Fixture f=setup();
    long lesson=create("/api/courses/"+f.course.id+"/lessons",Api.map("title","Lesson","content","Lesson notes","published",true),f.teacherSession).get("id").asLong();
    assertEquals(3,points(f.teacher));
    mvc.perform(get("/api/courses/"+f.course.id+"/lessons").session(f.studentSession)).andExpect(status().isOk());
    assertEquals(0,points(f.student));
    for(int i=0;i<2;i++) mvc.perform(get("/api/lessons/"+lesson+"/download").session(f.studentSession)).andExpect(status().isOk()).andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.containsString("attachment")));
    assertEquals(3,points(f.student));
    mvc.perform(patch("/api/lessons/"+lesson).session(f.teacherSession).contentType("application/json").content(json.writeValueAsBytes(Api.map("content","Advanced explanation ".repeat(20),"advancedMaterial",true)))).andExpect(status().isOk());
    assertEquals(6,points(f.teacher));
    mvc.perform(patch("/api/lessons/"+lesson).session(f.teacherSession).contentType("application/json").content("{\"title\":\"Edited\"}")).andExpect(status().isOk());
    assertEquals(6,points(f.teacher));
    long draft=create("/api/courses/"+f.course.id+"/lessons",Api.map("title","Draft","published",false),f.teacherSession).get("id").asLong();
    mvc.perform(get("/api/lessons/"+draft+"/download").session(f.studentSession)).andExpect(status().isForbidden());
  }

  @Test void peerAnswersAndBestAnswerRequireDifferentAuthorsAndTeacherApproval() throws Exception {
    Fixture f=setup(); String path="/api/courses/"+f.course.id+"/discussions";
    long question=create(path,Api.map("body","How does this work?"),f.studentSession).get("id").asLong();
    create(path,Api.map("body","My own clarification","parentId",question),f.studentSession);
    assertEquals(3,points(f.student));
    long answer=create(path,Api.map("body","A complete peer answer","parentId",question),f.peerSession).get("id").asLong();
    create(path,Api.map("body","More context","parentId",question),f.peerSession);
    assertEquals(5,points(f.peer));
    create(path,Api.map("body","Teacher reply","parentId",question),f.teacherSession);
    create(path,Api.map("body","Teacher follow-up","parentId",question),f.teacherSession);
    assertEquals(4,points(f.teacher));
    mvc.perform(post("/api/discussions/"+answer+"/best-answer").session(f.studentSession)).andExpect(status().isForbidden());
    create("/api/discussions/"+answer+"/best-answer",Api.map(),f.teacherSession);
    create("/api/discussions/"+answer+"/best-answer",Api.map(),f.teacherSession);
    assertEquals(12,points(f.peer));
    long other=create(path,Api.map("body","Another answer","parentId",question),f.peerSession).get("id").asLong();
    mvc.perform(post("/api/discussions/"+other+"/best-answer").session(f.teacherSession)).andExpect(status().isConflict());
  }

  @Test void peerReviewMustBeDetailedAndApprovedBeforeEarningPoints() throws Exception {
    Fixture f=setup(); Assessment a=new Assessment(); a.course=f.course; a.createdBy=f.teacher; a.title="Review"; store.save(a);
    Attempt attempt=new Attempt(); attempt.assessment=a; attempt.student=f.student; attempt.status="submitted"; attempt.submittedAt=Instant.now(); store.save(attempt);
    String path="/api/courses/"+f.course.id+"/peer-reviews";
    mvc.perform(post(path).session(f.peerSession).contentType("application/json").content(json.writeValueAsBytes(Api.map("attemptId",attempt.id,"body","Too short")))).andExpect(status().isBadRequest());
    mvc.perform(post(path).session(f.studentSession).contentType("application/json").content(json.writeValueAsBytes(Api.map("attemptId",attempt.id,"body","Detailed actionable review ".repeat(15))))).andExpect(status().isBadRequest());
    long review=create(path,Api.map("attemptId",attempt.id,"body","Detailed actionable review ".repeat(15)),f.peerSession).get("id").asLong();
    assertEquals(0,points(f.peer));
    mvc.perform(patch("/api/peer-reviews/"+review).session(f.peerSession).contentType("application/json").content("{\"status\":\"approved\"}")).andExpect(status().isForbidden());
    for(int i=0;i<2;i++) mvc.perform(patch("/api/peer-reviews/"+review).session(f.teacherSession).contentType("application/json").content("{\"status\":\"approved\"}")).andExpect(status().isOk());
    assertEquals(6,points(f.peer));
    mvc.perform(get(path).session(f.peerSession)).andExpect(status().isOk()).andExpect(jsonPath("$.reviews[0].answers").doesNotExist());
  }

  @Test void lateTeacherRepliesAndCrossCourseParentsCannotEarnReputation() throws Exception {
    Fixture f=setup(); String path="/api/courses/"+f.course.id+"/discussions";
    long question=create(path,Api.map("body","An older question"),f.studentSession).get("id").asLong();
    store.get(DiscussionPost.class,question).createdAt=Instant.now().minusSeconds(86401);
    create(path,Api.map("body","A late reply","parentId",question),f.teacherSession);
    assertEquals(0,points(f.teacher));
    Course other=new Course(); other.code="OTHER"; other.title="Other"; other.owner=f.teacher; store.save(other);
    Enrollment member=new Enrollment(); member.course=other; member.user=f.peer; member.courseRole="student"; store.save(member);
    mvc.perform(post("/api/courses/"+other.id+"/discussions").session(f.peerSession).contentType("application/json")
        .content(json.writeValueAsBytes(Api.map("body","Cross-course answer","parentId",question)))).andExpect(status().isBadRequest());
    assertEquals(0,points(f.peer));
  }
}
