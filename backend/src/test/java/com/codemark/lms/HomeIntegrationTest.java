package com.codemark.lms;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = {"spring.datasource.url=jdbc:h2:mem:homepage;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
class HomeIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired ObjectMapper json;
  @Autowired DemoSeed seed;
  @Autowired Store store;
  @Autowired Access access;
  @Autowired PlatformTransactionManager transactions;

  MockHttpSession login(String code) throws Exception {
    return (MockHttpSession) mvc.perform(post("/api/auth/login").contentType("application/json")
        .content(json.writeValueAsBytes(Api.map("studentId", code, "password", "CodeMark@2026"))))
        .andExpect(status().isOk()).andReturn().getRequest().getSession();
  }

  @Test void publicFeedAndPublisherPermissions() throws Exception {
    seed.seed();
    new TransactionTemplate(transactions).execute(status -> {
      User other = new User(); other.studentId = "1000000091"; other.name = "Giảng viên khác";
      other.role = "teacher"; other.passwordHash = access.hash("CodeMark@2026"); store.save(other);
      User firstLogin = new User(); firstLogin.studentId = "1000000092"; firstLogin.name = "Chưa đổi mật khẩu";
      firstLogin.role = "teacher"; firstLogin.mustChangePassword = true;
      firstLogin.passwordHash = access.hash("CodeMark@2026"); store.save(firstLogin);
      return null;
    });
    var teacher = login("1000000001");
    var other = login("1000000091");
    var firstLogin = login("1000000092");
    var student = login("2025000001");
    var admin = login("1000000000");
    String body = "{\"title\":\"Thông báo công khai\",\"body\":\"Nội dung mới\"}";
    // Thông báo của lớp do seed tạo không được xuất hiện trên trang công khai.
    mvc.perform(get("/api/home/announcements")).andExpect(status().isOk())
        .andExpect(jsonPath("$.total").value(0));
    mvc.perform(post("/api/home/announcements").contentType("application/json").content(body)).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/home/announcements").session(student).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(post("/api/home/announcements").session(firstLogin).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(post("/api/home/announcements").session(teacher).contentType("application/json").content("{\"title\":\"  \"}" )).andExpect(status().isBadRequest());
    long id = json.readTree(mvc.perform(post("/api/home/announcements").session(teacher).contentType("application/json").content(body))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asLong();
    String path = "/api/home/announcements/" + id;
    mvc.perform(put(path).session(other).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(delete(path).session(other)).andExpect(status().isForbidden());
    mvc.perform(put(path).session(student).contentType("application/json").content(body)).andExpect(status().isForbidden());
    mvc.perform(delete(path).session(student)).andExpect(status().isForbidden());
    mvc.perform(put(path).session(teacher).contentType("application/json").content(body)).andExpect(status().isOk());
    mvc.perform(get("/api/home/announcements")).andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].authorRole").value("teacher"))
        .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist())
        .andExpect(jsonPath("$.items[0].studentId").doesNotExist());
    for (int i = 0; i < 10; i++) {
      mvc.perform(post("/api/home/announcements").session(admin).contentType("application/json").content(body)).andExpect(status().isOk());
    }
    mvc.perform(get("/api/home/announcements")).andExpect(jsonPath("$.items.length()").value(10)).andExpect(jsonPath("$.total").value(11));
    mvc.perform(get("/api/home/announcements?page=2")).andExpect(jsonPath("$.items.length()").value(1));
    mvc.perform(get("/api/home/announcements?page=0")).andExpect(status().isBadRequest());
    mvc.perform(put(path).session(admin).contentType("application/json").content(body)).andExpect(status().isOk());
    mvc.perform(delete(path).session(admin)).andExpect(status().isOk());
    mvc.perform(get("/api/home/announcements")).andExpect(jsonPath("$.total").value(10));
  }
}
