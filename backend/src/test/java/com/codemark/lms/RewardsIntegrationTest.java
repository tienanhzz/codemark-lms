package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.*;
import java.util.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:rewardsapi;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc @Transactional
class RewardsIntegrationTest {
  @Autowired Store store;
  @Autowired Access access;
  @Autowired RankService rank;
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  User person(String code,String role) {User u=new User();u.name=role+code;u.studentId=code;u.role=role;u.passwordHash=access.hash("RewardTest@2026!");return store.save(u);}
  MockHttpSession login(User user) throws Exception {
    return (MockHttpSession)mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsBytes(Api.map("studentId",user.studentId,"password","RewardTest@2026!"))))
        .andExpect(status().isOk()).andReturn().getRequest().getSession();
  }
  @Test void cosmeticEntitlementsAndProposalReviewAreServerEnforced() throws Exception {
    User teacher=person("1006200001","teacher"),outsider=person("1006200002","teacher"),student=person("2026200001","student"),leader=person("2026200002","student");
    Course c=new Course();c.code="REWARD";c.title="Reward";c.owner=teacher;c.published=true;store.save(c);
    for(User u:List.of(teacher,student,leader)){Enrollment e=new Enrollment();e.course=c;e.user=u;e.courseRole=u.role;store.save(e);}
    Season season=new Season();season.name="Reward season";season.active=true;season.startsAt=Instant.now().minusSeconds(60);season.endsAt=Instant.now().plusSeconds(86400);store.save(season);
    rank.append(leader,season,c,"manual",0,100,"Leader",teacher);
    var studentSession=login(student);var teacherSession=login(teacher);var outsiderSession=login(outsider);
    mvc.perform(get("/api/rank/profile")).andExpect(status().isUnauthorized());
    mvc.perform(put("/api/rank/cosmetics").session(studentSession).contentType("application/json").content("{\"frame\":\"champion\",\"theme\":\"gold\"}")).andExpect(status().isForbidden());
    rank.append(student,season,c,"manual",0,110,"Promoted",teacher);
    mvc.perform(put("/api/rank/cosmetics").session(studentSession).contentType("application/json").content("{\"frame\":\"champion\",\"theme\":\"gold\"}"))
        .andExpect(status().isOk()).andExpect(jsonPath("$.selectedFrame").value("champion"));
    String proposal=json.writeValueAsString(Api.map("courseId",c.id,"requestText","Đề xuất đổi thưởng theo chính sách của trường"));
    mvc.perform(post("/api/rank/redemptions").session(teacherSession).contentType("application/json").content(proposal)).andExpect(status().isForbidden());
    long id=json.readTree(mvc.perform(post("/api/rank/redemptions").session(studentSession).contentType("application/json").content(proposal)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asLong();
    mvc.perform(post("/api/rank/redemptions").session(studentSession).contentType("application/json").content(proposal)).andExpect(status().isConflict());
    String decision="{\"status\":\"approved\",\"decisionNote\":\"Chấp thuận đề xuất, chuyển bộ phận phụ trách xét theo quy chế\"}";
    mvc.perform(post("/api/rank/redemptions/"+id+"/review").session(studentSession).contentType("application/json").content(decision)).andExpect(status().isForbidden());
    mvc.perform(post("/api/rank/redemptions/"+id+"/review").session(outsiderSession).contentType("application/json").content(decision)).andExpect(status().isForbidden());
    double balance=((Number)rank.profile(student).get("totalPoints")).doubleValue();
    mvc.perform(post("/api/rank/redemptions/"+id+"/review").session(teacherSession).contentType("application/json").content(decision)).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("approved"));
    store.flush(); // Separate HTTP requests normally commit before the next locked refresh.
    mvc.perform(post("/api/rank/redemptions/"+id+"/review").session(teacherSession).contentType("application/json").content(decision)).andExpect(status().isConflict());
    assertEquals(balance,((Number)rank.profile(student).get("totalPoints")).doubleValue());
    assertTrue(store.all(Attempt.class).isEmpty(),"Reviewing a proposal cannot create or change exam grades");
    mvc.perform(get("/api/rank/redemptions").session(outsiderSession)).andExpect(jsonPath("$.requests.length()").value(0));
  }
}
