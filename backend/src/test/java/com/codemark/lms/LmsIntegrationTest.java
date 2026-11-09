package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.*;

@SpringBootTest(
    properties = {
      "spring.datasource.url=jdbc:h2:mem:lms;DB_CLOSE_DELAY=-1",
      "codemark.token-key=a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s=",
      "codemark.lan-origins=http://192.168.1.20:3000",
      "codemark.upload-dir=./target/test-uploads"
    })
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LmsIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired DemoSeed seed;
  @Autowired Store store;
  @Autowired org.springframework.transaction.PlatformTransactionManager transactionManager;

  @Test
  void reseedUpdatesDemoNamesAndDaysWithoutReplacingExistingData() throws Exception {
    var tx = new org.springframework.transaction.support.TransactionTemplate(transactionManager);
    var original =
        tx.execute(
            status -> {
              Course web = store.list(Course.class, "where e.code=?1", "WEB101").get(0);
              Meeting meeting =
                  store.list(Meeting.class, "where e.course=?1 order by e.id", web).get(0);
              web.title = "Web Development Fundamentals";
              meeting.weekday = 0;
              User teacher =
                  store.list(User.class, "where e.studentId=?1", "1000000001").get(0);
              return List.of(
                  web.id,
                  meeting.id,
                  store.all(Question.class).size(),
                  store.all(Attempt.class).size(),
                  teacher.passwordHash);
            });
    seed.seed();
    seed.seed();
    tx.execute(
        status -> {
          Course web = store.list(Course.class, "where e.code=?1", "WEB101").get(0);
          Meeting meeting =
              store.list(Meeting.class, "where e.course=?1 order by e.id", web).get(0);
          assertEquals(original.get(0), web.id);
          assertEquals(original.get(1), meeting.id);
          assertEquals("Phát triển ứng dụng Web", web.title);
          assertEquals(1, meeting.weekday);
          assertEquals(original.get(2), store.all(Question.class).size());
          assertEquals(original.get(3), store.all(Attempt.class).size());
          assertEquals(
              original.get(4),
              store.list(User.class, "where e.studentId=?1", "1000000001").get(0).passwordHash);
          var days = new HashSet<Integer>();
          for (String code : List.of("DEMO101", "WEB101", "DB101", "NET101")) {
            Course course = store.list(Course.class, "where e.code=?1", code).get(0);
            days.add(
                store
                    .list(Meeting.class, "where e.course=?1 order by e.id", course)
                    .get(0)
                    .weekday);
          }
          assertEquals(4, days.size());
          return null;
        });
  }

  @BeforeAll
  void setup() throws Exception {
    seed.seed();
  }

  MockHttpSession login(String studentId) throws Exception {
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .contentType("application/json")
                    .content(
                        json.writeValueAsBytes(
                            Api.map("studentId", studentId, "password", "CodeMark@2026"))))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession();
  }

  JsonNode getJson(String path, MockHttpSession session) throws Exception {
    return json.readTree(
        mvc.perform(get(path).session(session))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  JsonNode postJson(String path, Object body, MockHttpSession session) throws Exception {
    return json.readTree(
        mvc.perform(
                post(path)
                    .session(session)
                    .contentType("application/json")
                    .content(json.writeValueAsBytes(body)))
            .andExpect(status().is2xxSuccessful())
            .andReturn()
            .getResponse()
            .getContentAsString());
  }

  @Test
  void sessionsAndRoles() throws Exception {
    MockHttpSession first = login("2025000001"), second = login("2025000001");
    mvc.perform(get("/api/auth/me").session(first)).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/auth/me").session(second))
        .andExpect(jsonPath("$.role").value("student"))
        .andExpect(jsonPath("$.passwordHash").doesNotExist());
    mvc.perform(get("/api/admin/stats").session(second)).andExpect(status().isForbidden());
  }

  @Test
  void lanCorsAndOriginGuard() throws Exception {
    mvc.perform(
            options("/api/auth/login")
                .header("Origin", "http://192.168.1.20:3000")
                .header("Access-Control-Request-Method", "POST"))
        .andExpect(status().isOk())
        .andExpect(header().string("Access-Control-Allow-Origin", "http://192.168.1.20:3000"))
        .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
    mvc.perform(
            post("/api/auth/login")
                .header("Origin", "https://evil.example")
                .contentType("application/json")
                .content("{}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void completeQuizFlagsAndHiddenAnswers() throws Exception {
    var teacher = login("1000000001");
    var student = login("2025000002");
    long course = getJson("/api/courses", teacher).get("courses").get(0).get("id").asLong();
    JsonNode assessment =
        postJson(
            "/api/courses/" + course + "/assessments",
            Api.map("title", "Integration quiz", "published", true),
            teacher);
    long id = assessment.get("id").asLong();
    JsonNode q =
        postJson(
            "/api/assessments/" + id + "/questions",
            Api.map(
                "prompt",
                "2+2?",
                "kind",
                "mcq",
                "options",
                List.of("3", "4"),
                "answer",
                "1",
                "points",
                5),
            teacher);
    long question = q.get("id").asLong();
    assertFalse(getJson("/api/assessments/" + id, student).get("questions").get(0).has("answer"));
    long attempt =
        postJson("/api/assessments/" + id + "/start", Map.of(), student).get("id").asLong();
    mvc.perform(
            put("/api/attempts/" + attempt + "/flags/" + question)
                .session(student)
                .contentType("application/json")
                .content("{\"flagged\":true}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.flaggedQuestions[0]").value(question));
    mvc.perform(
            put("/api/attempts/" + attempt + "/answers/" + question)
                .session(student)
                .contentType("application/json")
                .content("{\"response\":\"1\"}"))
        .andExpect(status().isOk());
    assertEquals(1, getJson("/api/attempts/" + attempt, student).get("flaggedQuestions").size());
    assertEquals(
        5,
        postJson("/api/attempts/" + attempt + "/submit", Map.of(), student)
            .get("score")
            .asDouble());
    mvc.perform(
            put("/api/attempts/" + attempt + "/answers/" + question)
                .session(student)
                .contentType("application/json")
                .content("{\"response\":\"0\"}"))
        .andExpect(status().isConflict());
    assertFalse(getJson("/api/courses/" + course + "/gradebook", teacher).get("rows").isEmpty());
  }

  @Test
  void attendanceTokenAndDuplicateCheckin() throws Exception {
    var teacher = login("1000000001");
    var student = login("2025000003");
    long course = getJson("/api/courses", teacher).get("courses").get(0).get("id").asLong();
    var session =
        postJson(
            "/api/courses/" + course + "/attendance-sessions",
            Api.map("durationMinutes", 10),
            teacher);
    String token = session.get("token").asText();
    postJson("/api/attendance/check-in", Api.map("token", token), student);
    mvc.perform(
            post("/api/attendance/check-in")
                .session(student)
                .contentType("application/json")
                .content(json.writeValueAsString(Api.map("token", token))))
        .andExpect(status().isConflict());
    mvc.perform(
            post("/api/attendance/check-in")
                .session(student)
                .contentType("application/json")
                .content("{\"token\":\"v1.invalid\"}"))
        .andExpect(status().isBadRequest());
    assertTrue(
        getJson("/api/attendance-sessions/" + session.get("id").asLong(), student)
            .get("token")
            .isNull());
  }

  @Test
  void evidenceUploadDecisionAndAccess() throws Exception {
    var teacher = login("1000000001");
    var student = login("2025000003");
    long course = getJson("/api/courses", teacher).get("courses").get(0).get("id").asLong();
    var file =
        new MockMultipartFile(
            "evidence", "proof.pdf", "application/pdf", "%PDF-1.4 test evidence".getBytes());
    JsonNode leave =
        json.readTree(
            mvc.perform(
                    multipart("/api/courses/" + course + "/leave-requests")
                        .file(file)
                        .param("reason", "Medical appointment")
                        .session(student))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString());
    long id = leave.get("id").asLong();
    mvc.perform(get("/api/leave-requests/" + id + "/evidence").session(student))
        .andExpect(status().isOk())
        .andExpect(content().contentType("application/pdf"));
    assertEquals(
        "approved",
        postJson("/api/leave-requests/" + id + "/decision", Api.map("status", "approved"), teacher)
            .get("status")
            .asText());
    var invalid =
        new MockMultipartFile("evidence", "fake.pdf", "application/pdf", "not a PDF".getBytes());
    mvc.perform(
            multipart("/api/courses/" + course + "/leave-requests")
                .file(invalid)
                .param("reason", "Invalid")
                .session(student))
        .andExpect(status().isBadRequest());
  }

  @Test
  void dashboardAndAdminContracts() throws Exception {
    var admin = login("1000000000");
    var student = login("2025000001");
    assertEquals(4, getJson("/api/dashboard", student).get("courses").size());
    assertEquals(4, getJson("/api/schedule/me", student).get("meetings").size());
    assertTrue(getJson("/api/users", admin).get("total").asInt() >= 6);
    assertTrue(getJson("/api/admin/stats", admin).has("recentEvents"));
    assertTrue(getJson("/api/admin/sessions", admin).has("sessions"));
    mvc.perform(get("/api/admin/audit/export").session(admin)).andExpect(status().isOk());
  }

  @Test
  void outsiderCannotAccessCourse() throws Exception {
    var admin = login("1000000000");
    postJson(
        "/api/users",
        Api.map(
            "studentId",
            "2025999998",
            "name",
            "Outsider",
            "password",
            "CodeMark@2026",
            "role",
            "student"),
        admin);
    var outsider = login("2025999998");
    long id = getJson("/api/courses", admin).get("courses").get(0).get("id").asLong();
    mvc.perform(get("/api/courses/" + id).session(outsider)).andExpect(status().isForbidden());
  }

  @Test
  void cidrAndGraderStrategies() {
    assertTrue(Access.inNetwork("192.168.1.40", "192.168.1.0/24"));
    assertFalse(Access.inNetwork("192.168.2.40", "192.168.1.0/24"));
    assertFalse(Access.inNetwork("127.0.0.1", "evil.example"));
    var q = new Question();
    q.kind = "short";
    q.answer = "java|Java SE";
    q.points = 3;
    assertEquals(3, new TextAnswerGrader().score(q, " JAVA  SE "));
    assertEquals(0, new TextAnswerGrader().score(q, "Python"));
  }

  @Test
  void expiredSessionDenied() throws Exception {
    var student = login("2025000001");
    new org.springframework.transaction.support.TransactionTemplate(transactionManager)
        .execute(
            status -> {
              store
                      .list(User.class, "where e.studentId=?1", "2025000001")
                      .get(0)
                      .lastActivity =
                  java.time.Instant.now().minusSeconds(121);
              return null;
            });
    mvc.perform(get("/api/auth/me").session(student)).andExpect(status().isUnauthorized());
  }

  @Test
  void deadlineAndAttemptLimitAreAuthoritative() throws Exception {
    var teacher = login("1000000001");
    var student = login("2025000002");
    long course = getJson("/api/courses", teacher).get("courses").get(0).get("id").asLong();
    long assessment =
        postJson(
                "/api/courses/" + course + "/assessments",
                Api.map("title", "Deadline test", "published", true, "maxAttempts", 1),
                teacher)
            .get("id")
            .asLong();
    long question =
        postJson(
                "/api/assessments/" + assessment + "/questions",
                Api.map("prompt", "Answer", "kind", "short", "answer", "yes"),
                teacher)
            .get("id")
            .asLong();
    long attempt =
        postJson("/api/assessments/" + assessment + "/start", Map.of(), student).get("id").asLong();
    new org.springframework.transaction.support.TransactionTemplate(transactionManager)
        .execute(
            status -> {
              store.get(Attempt.class, attempt).deadline = java.time.Instant.now().minusSeconds(1);
              return null;
            });
    mvc.perform(
            put("/api/attempts/" + attempt + "/answers/" + question)
                .session(student)
                .contentType("application/json")
                .content("{\"response\":\"yes\"}"))
        .andExpect(status().isConflict());
    assertEquals("submitted", getJson("/api/attempts/" + attempt, student).get("status").asText());
    mvc.perform(post("/api/assessments/" + assessment + "/start").session(student))
        .andExpect(status().isConflict());
  }

  @Test
  void unpublishedAssessmentAndHiddenCasesStayPrivate() throws Exception {
    var teacher = login("1000000001");
    var student = login("2025000003");
    long course = getJson("/api/courses", teacher).get("courses").get(0).get("id").asLong();
    long assessment =
        postJson(
                "/api/courses/" + course + "/assessments",
                Api.map("title", "Private test"),
                teacher)
            .get("id")
            .asLong();
    mvc.perform(get("/api/assessments/" + assessment).session(student))
        .andExpect(status().isNotFound());
    long question =
        postJson(
                "/api/assessments/" + assessment + "/questions",
                Api.map("prompt", "Print", "kind", "code", "language", "java"),
                teacher)
            .get("id")
            .asLong();
    postJson(
        "/api/questions/" + question + "/testcases",
        Api.map("input", "secret-input", "expectedOutput", "secret-output", "hidden", true),
        teacher);
    mvc.perform(
            patch("/api/assessments/" + assessment)
                .session(teacher)
                .contentType("application/json")
                .content("{\"published\":true}"))
        .andExpect(status().isOk());
    assertFalse(
        getJson("/api/assessments/" + assessment, student).toString().contains("secret-output"));
    postJson("/api/assessments/" + assessment + "/start", Map.of(), student);
    mvc.perform(
            post("/api/questions/" + question + "/run")
                .session(student)
                .contentType("application/json")
                .content("{\"source\":\"class Main {}\"}"))
        .andExpect(status().isServiceUnavailable());
    assertFalse(getJson("/api/runner/status", student).get("available").asBoolean());
  }
}

