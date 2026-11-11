package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class TeacherRankReportTest {
  private final TeacherRankReport renderer=new TeacherRankReport();

  @Test void vietnameseReportPaginatesAndKeepsLastTeacherAndSampleDisclosure() throws Exception {
    var rows=new ArrayList<Map<String,Object>>();
    for(int i=1;i<=150;i++) rows.add(Api.map("userId",(long)i,"position",i,"name","Giảng viên Nguyễn Thị Ánh "+i+(i%5==0?" Trường đào tạo công nghệ và khoa học ứng dụng".repeat(4):""),
        "studentId",String.valueOf(1006900000L+i),"points",700-i*3,"tier",RankService.tierAt(i)));
    byte[] bytes=renderer.render("Mùa tín nhiệm 2026","WEB101 · Phát triển ứng dụng Web",rows,Set.of(1L),Instant.parse("2026-11-10T01:00:00Z"));
    assertEquals("%PDF-",new String(bytes,0,5,StandardCharsets.US_ASCII));
    try(var pdf=Loader.loadPDF(bytes)) {
      assertTrue(pdf.getNumberOfPages()>2,"Long tables must paginate rather than clipping rows");
      String text=new PDFTextStripper().getText(pdf);
      assertTrue(text.contains("VINH DANH GIẢNG VIÊN"));
      assertTrue(text.contains("Giảng viên Nguyễn Thị Ánh 1"));
      assertTrue(text.contains("1006900150"),"The final teacher must remain in the exported report");
      assertTrue(text.contains("điểm mẫu dùng kiểm thử"));
      assertTrue(text.contains("10/11/2026 08:00"));
      assertTrue(text.contains("không tự động thay đổi điểm"));
      Path dir=Path.of(System.getProperty("java.io.tmpdir"));
      Files.write(dir.resolve("codemark-teacher-report-qa.pdf"),bytes);
      PDFRenderer images=new PDFRenderer(pdf);
      ImageIO.write(images.renderImageWithDPI(0,110),"png",dir.resolve("codemark-teacher-report-first.png").toFile());
      ImageIO.write(images.renderImageWithDPI(pdf.getNumberOfPages()-1,110),"png",dir.resolve("codemark-teacher-report-last.png").toFile());
    }
  }

  @Test void emptySeasonStillProducesAReadableReport() throws Exception {
    byte[] bytes=renderer.render(null,"Toàn hệ thống",List.of(),Set.of(),Instant.now());
    try(var pdf=Loader.loadPDF(bytes)) {
      assertEquals(1,pdf.getNumberOfPages());
      String text=new PDFTextStripper().getText(pdf);
      assertTrue(text.contains("Chưa có mùa đang hoạt động"));
      assertTrue(text.contains("Chưa có giảng viên"));
    }
  }
}
