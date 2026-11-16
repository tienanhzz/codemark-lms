package com.codemark.lms;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:rank;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
class RankIntegrationTest {
  @Autowired org.springframework.test.web.servlet.MockMvc mvc;
  @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
  @Autowired DemoSeed seed;
  @Autowired Store store;
  @Autowired GradingService grading;
  @Autowired org.springframework.transaction.PlatformTransactionManager manager;
  org.springframework.mock.web.MockHttpSession login(String code,String password) throws Exception {
    return (org.springframework.mock.web.MockHttpSession)mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsBytes(Api.map("studentId",code,"password",password))))
      .andExpect(status().isOk()).andReturn().getRequest().getSession();
  }
  com.fasterxml.jackson.databind.JsonNode postJson(String url,Object body,org.springframework.mock.web.MockHttpSession session) throws Exception {
    if ((url.endsWith("/assessments") || url.endsWith("/quiz-links")) && body instanceof java.util.Map<?,?> original) {
      var scheduled = new java.util.HashMap<String,Object>(); original.forEach((k,v)->scheduled.put(k.toString(),v));
      scheduled.putIfAbsent("opensAt", java.time.Instant.now().minusSeconds(8L*86400).toString()); body=scheduled;
    }
    return json.readTree(mvc.perform(post(url).session(session).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString());
  }
  @Test void fullRankQuizBulkAndPermissions() throws Exception {
    seed.seed();
    var admin=login("0000000000","CodeMark@2026!");
    mvc.perform(get("/api/rank/config").session(admin)).andExpect(status().isForbidden());
    postJson("/api/auth/password",Api.map("currentPassword","CodeMark@2026!","newPassword","AdminNew@2026!"),admin);
    var teacher=login("1000000001","CodeMark@2026"); var student=login("2025000001","CodeMark@2026");
    mvc.perform(post("/api/admin/bulk-accounts").session(student).contentType("application/json").content("{}" )).andExpect(status().isForbidden());
    String csv="studentId,password\n2025888888,StudentNew@2026\nabc,bad\n2025777777,Duplicate@2026\n2025777777,Duplicate@2026\n2025000001,ExistingPass@2026\n";
    var preview=postJson("/api/admin/bulk-accounts",Api.map("csv",csv),admin);
    org.junit.jupiter.api.Assertions.assertEquals(1,preview.get("valid").asInt());
    postJson("/api/admin/bulk-accounts",Api.map("csv",csv,"commit",true),admin);
    var bulk=login("2025888888","StudentNew@2026");
    mvc.perform(get("/api/courses").session(bulk)).andExpect(status().isForbidden());
    var season=postJson("/api/rank/seasons",Api.map("name","Mùa kiểm thử","startsAt",java.time.Instant.now().minusSeconds(3600).toString(),"endsAt",java.time.Instant.now().plusSeconds(86400).toString()),admin);
    var courses=json.readTree(mvc.perform(get("/api/courses").session(teacher)).andReturn().getResponse().getContentAsString());
    long course=courses.get("courses").get(0).get("id").asLong();
    new org.springframework.transaction.support.TransactionTemplate(manager).execute(status->{store.get(Course.class,course).published=true; return null;});
    var body=Api.map("title","Quiz ngoài","url","https://wayground.com/join","maxScore",10,"dueAt",java.time.Instant.now().plusSeconds(3600).toString());
    mvc.perform(post("/api/courses/"+course+"/quiz-links").session(student).contentType("application/json").content(json.writeValueAsBytes(body))).andExpect(status().isForbidden());
    long quiz=postJson("/api/courses/"+course+"/quiz-links",body,teacher).get("id").asLong();
    mvc.perform(patch("/api/courses/"+course).session(teacher).contentType("application/json").content("{\"title\":\"Lớp đã sửa\"}")).andExpect(status().isOk());
    mvc.perform(get("/api/courses/"+course+"/quiz-links").session(teacher)).andExpect(jsonPath("$.quizzes.length()").value(1));
    postJson("/api/quiz-links/"+quiz+"/complete",Api.map(),student);
    var before=json.readTree(mvc.perform(get("/api/rank/leaderboard").param("courseId",String.valueOf(course)).session(student)).andReturn().getResponse().getContentAsString());
    org.junit.jupiter.api.Assertions.assertEquals(0,before.get("mine").get("points").asDouble());
    for(int score:new int[]{8,8,9,7}) postJson("/api/quiz-links/"+quiz+"/scores",Api.map("studentId","2025000001","score",score),teacher);
    postJson("/api/quiz-links/"+quiz+"/import",Api.map("csv","studentId,score\n2025000001,9\nwrong,8\n"),teacher);
    var after=json.readTree(mvc.perform(get("/api/rank/leaderboard").param("courseId",String.valueOf(course)).session(student)).andReturn().getResponse().getContentAsString());
    org.junit.jupiter.api.Assertions.assertEquals(4,after.get("mine").get("points").asDouble());
    // Exercise the real automatic grading path for both assignment and exam sources.
    new org.springframework.transaction.support.TransactionTemplate(manager).execute(status->{
      User u=store.list(User.class,"where e.studentId=?1","2025000001").get(0);
      Assessment a=store.all(Assessment.class).get(0);
      for(String kind:java.util.List.of("assignment","exam")) {
        Assessment copy=new Assessment();copy.course=a.course;copy.createdBy=a.createdBy;copy.title=kind;copy.kind=kind;copy.rankWeight=kind.equals("exam")?2:1;store.save(copy);
        Question q=new Question();q.assessment=copy;q.prompt="1+1";q.kind="short";q.answer="2";q.points=10;store.save(q);
        for(int repeat=0;repeat<2;repeat++) { if(repeat==1) copy.kind="exam"; Attempt t=new Attempt();t.assessment=copy;t.student=u;t.answers.put(q.id.toString(),"2");store.save(t);grading.submit(t); }
      }
      return null;
    });
    var finalBoard=json.readTree(mvc.perform(get("/api/rank/leaderboard").param("courseId",String.valueOf(course)).session(student)).andReturn().getResponse().getContentAsString());
    org.junit.jupiter.api.Assertions.assertEquals(18,finalBoard.get("mine").get("points").asDouble());
    org.junit.jupiter.api.Assertions.assertEquals("Master",finalBoard.get("mine").get("tier").asText());
    new org.springframework.transaction.support.TransactionTemplate(manager).execute(status->{ new RankService(store).announceChanges(java.util.List.of(),store.list(User.class,"where e.role='admin'").get(0)); return null;});
    var feed=json.readTree(mvc.perform(get("/api/home/announcements")).andReturn().getResponse().getContentAsString());
    long systemNotice=feed.get("items").get(0).get("id").asLong();
    org.junit.jupiter.api.Assertions.assertEquals("system",feed.get("items").get(0).get("authorRole").asText());
    mvc.perform(put("/api/home/announcements/"+systemNotice).session(admin).contentType("application/json")
        .content("{\"title\":\"changed\",\"body\":\"changed\"}")).andExpect(status().isForbidden());
    mvc.perform(delete("/api/home/announcements/"+systemNotice).session(admin)).andExpect(status().isForbidden());
    long champion=finalBoard.get("mine").get("userId").asLong();
    mvc.perform(patch("/api/users/"+champion).session(admin).contentType("application/json")
        .content("{\"role\":\"teacher\"}")).andExpect(status().isOk());
    var rosterFeed=json.readTree(mvc.perform(get("/api/home/announcements")).andReturn().getResponse().getContentAsString());
    org.junit.jupiter.api.Assertions.assertNotEquals(systemNotice,rosterFeed.get("items").get(0).get("id").asLong());
    mvc.perform(patch("/api/users/"+champion).session(admin).contentType("application/json")
        .content("{\"role\":\"student\"}")).andExpect(status().isOk());
    mvc.perform(put("/api/rank/tiers").session(admin).contentType("application/json").content("{\"tiers\":[{\"name\":\"Iron\",\"threshold\":10}]}" )).andExpect(status().isBadRequest());
    postJson("/api/rank/adjustments",Api.map("courseId",course,"studentId","2025000001","points",-10,"reason","Điều chỉnh có lý do"),admin);
    postJson("/api/rank/seasons",Api.map("name","Mùa mới","startsAt",java.time.Instant.now().minusSeconds(60).toString(),"endsAt",java.time.Instant.now().plusSeconds(3600).toString()),admin);
    var reset=json.readTree(mvc.perform(get("/api/rank/leaderboard").param("courseId",String.valueOf(course)).session(student)).andReturn().getResponse().getContentAsString());
    org.junit.jupiter.api.Assertions.assertEquals(0,reset.get("mine").get("points").asDouble());
    mvc.perform(delete("/api/courses/"+course).session(teacher)).andExpect(status().isOk());
  }
  @Test void rankRequiresAuthentication() throws Exception {
    mvc.perform(get("/api/rank/leaderboard")).andExpect(status().isUnauthorized());
  }
  @Test void malformedLoginIsGeneric() throws Exception {
    mvc.perform(post("/api/auth/login").contentType("application/json")
      .content("{\"studentId\":\"123\",\"password\":\"wrong\"}"))
      .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.error").value("invalid_credentials"));
  }
}
