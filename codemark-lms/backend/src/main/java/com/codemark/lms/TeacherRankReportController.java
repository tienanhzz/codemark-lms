package com.codemark.lms;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.time.Instant;
import java.util.*;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/rank/teachers") @Transactional
class TeacherRankReportController {
  private final Access access;
  private final RankService rank;
  private final Store store;
  private final TeacherRankReport report;
  TeacherRankReportController(Access access,RankService rank,Store store,TeacherRankReport report) {
    this.access=access; this.rank=rank; this.store=store; this.report=report;
  }

  @GetMapping(value="/report.pdf",produces=MediaType.APPLICATION_PDF_VALUE)
  ResponseEntity<byte[]> export(HttpServletRequest request,@RequestParam(required=false) Long courseId) throws IOException {
    User actor=access.current(request);
    Api.require(Set.of("admin","teacher").contains(actor.role),"forbidden",403);
    Course course=courseId==null?null:rank.visibleCourse(actor,courseId);
    Season season=rank.active(); var demoTeachers=new HashSet<Long>();
    if(season!=null) for(PointEntry entry:store.list(PointEntry.class,"where e.seasonId=?1 and e.sourceType='teacher_demo'",season.id))
      if(courseId==null || courseId.equals(entry.courseId)) demoTeachers.add(entry.studentId);
    String scope=course==null?"Toàn hệ thống":course.code+" · "+course.title;
    byte[] content=report.render(season==null?null:season.name,scope,rank.teacherBoard(actor,courseId),demoTeachers,Instant.now());
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
        .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=teacher-reputation.pdf")
        .header(HttpHeaders.CACHE_CONTROL,"no-store").body(content);
  }
}
