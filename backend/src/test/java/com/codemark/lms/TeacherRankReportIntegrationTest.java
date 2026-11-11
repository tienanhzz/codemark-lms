package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:teacherReport;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc @Transactional
class TeacherRankReportIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired DemoSeed seed;
  @Autowired Store store;

  MockHttpSession login(String code) throws Exception {
    return (MockHttpSession)mvc.perform(post("/api/auth/login").contentType("application/json")
        .content("{\"studentId\":\""+code+"\",\"password\":\"CodeMark@2026\"}"))
        .andExpect(status().isOk()).andReturn().getRequest().getSession();
  }

  @Test void studentCannotExportTeacherReputation() throws Exception {
    seed.seed();
    mvc.perform(get("/api/rank/teachers/report.pdf").session(login("2025000001")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/rank/teachers/report.pdf")).andExpect(status().isUnauthorized());
  }

  @Test void teacherExportUsesVietnamesePdfAndCorrectCourseScope() throws Exception {
    seed.seed();
    Course course=store.list(Course.class,"where e.code='DEMO101'").get(0);
    byte[] bytes=mvc.perform(get("/api/rank/teachers/report.pdf").param("courseId",course.id.toString()).session(login("1000000001")))
        .andExpect(status().isOk()).andExpect(content().contentType("application/pdf"))
        .andExpect(header().string("Cache-Control","no-store"))
        .andReturn().getResponse().getContentAsByteArray();
    assertTrue(new String(bytes,0,5,java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-"));
    try(var pdf=Loader.loadPDF(bytes)) {
      String text=new PDFTextStripper().getText(pdf);
      assertTrue(text.contains("VINH DANH GIẢNG VIÊN"));
      assertTrue(text.contains("DEMO101"));
      assertTrue(text.contains("Reputation"));
      assertFalse(text.contains("passwordHash"));
      assertFalse(text.contains("CodeMark@2026"));
    }
  }
}
