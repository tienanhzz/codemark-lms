package com.codemark.lms;

import static com.codemark.lms.Api.map;

import jakarta.servlet.http.*;
import java.time.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Transactional
class ReportingController {
  private final Store store;
  private final Access access;
  private final Views views;

  ReportingController(Store s, Access a, Views v) {
    store = s;
    access = a;
    views = v;
  }

  @GetMapping("/dashboard")
  Object dashboard(HttpServletRequest r) {
    User u = access.current(r);
    var courses = store.all(Course.class).stream().filter(c -> access.role(u, c) != null).toList();
    var managed = courses.stream().filter(c -> !"student".equals(access.role(u, c))).toList();
    var attempts = store.list(Attempt.class, "where e.student=?1 and e.submittedAt is not null", u);
    var assessments =
        store.all(Assessment.class).stream()
            .filter(
                a -> courses.contains(a.course) && a.published && a.closesAt.isAfter(Instant.now()))
            .toList();
    return map(
        "role",
        u.role,
        "courses",
        courses.stream().map(c -> views.course(c, u)).toList(),
        "currentCourses",
        courses.stream()
            .filter(
                c -> !LocalDate.now().isBefore(c.startDate) && !LocalDate.now().isAfter(c.endDate))
            .count(),
        "averageScore",
        average(attempts),
        "upcomingAssessments",
        assessments.stream().limit(10).map(a -> views.assessment(a, u, false)).toList(),
        "announcements",
        store.list(Announcement.class, "order by e.id desc").stream()
            .filter(a -> courses.contains(a.course))
            .limit(5)
            .map(views::announcement)
            .toList(),
        "openAttendance",
        store.all(AttendanceSession.class).stream()
            .filter(
                s -> courses.contains(s.course) && s.active && s.closesAt.isAfter(Instant.now()))
            .map(s -> map("id", s.id, "courseId", s.course.id, "closesAt", s.closesAt))
            .toList(),
        "managedCourses",
        managed.stream().map(c -> views.course(c, u)).toList(),
        "pendingLeave",
        store.list(LeaveRequest.class, "where e.status='pending'").stream()
            .filter(l -> managed.contains(l.course))
            .count(),
        "weekStart",
        LocalDate.now()
            .with(java.time.temporal.TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
  }

  static Double average(List<Attempt> attempts) {
    return attempts.stream()
        .filter(t -> t.score != null)
        .mapToDouble(t -> t.score)
        .average()
        .stream()
        .boxed()
        .findFirst()
        .orElse(null);
  }

  @GetMapping("/courses/{id}/stats")
  Object stats(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Course c = access.course(u, id, true);
    var enrollments = store.list(Enrollment.class, "where e.course=?1", c);
    var roles = new LinkedHashMap<String, Long>();
    for (String role : List.of("teacher", "ta", "student"))
      roles.put(role, enrollments.stream().filter(e -> e.courseRole.equals(role)).count());
    var attempts =
        store.list(Attempt.class, "where e.assessment.course=?1 and e.submittedAt is not null", c);
    return map(
        "course",
        views.course(c, u),
        "roster",
        roles,
        "lessons",
        store.list(Lesson.class, "where e.course=?1", c).size(),
        "assessments",
        store.list(Assessment.class, "where e.course=?1", c).size(),
        "submittedAttempts",
        attempts.size(),
        "averageScore",
        average(attempts),
        "attendanceSessions",
        store.list(AttendanceSession.class, "where e.course=?1", c).size(),
        "pendingLeave",
        store.list(LeaveRequest.class, "where e.course=?1 and e.status='pending'", c).size(),
        "meetings",
        store.list(Meeting.class, "where e.course=?1", c).stream().map(views::meeting).toList());
  }

  @GetMapping("/courses/{id}/gradebook")
  Object gradebook(HttpServletRequest r, @PathVariable long id) {
    Course c = access.course(access.current(r), id, true);
    var assessments = store.list(Assessment.class, "where e.course=?1 order by e.id", c);
    var attempts =
        store.list(Attempt.class, "where e.assessment.course=?1 and e.submittedAt is not null", c);
    var records = store.list(AttendanceRecord.class, "where e.session.course=?1", c);
    int sessions = store.list(AttendanceSession.class, "where e.course=?1", c).size();
    var rows = new ArrayList<Map<String, Object>>();
    for (Enrollment e :
        store.list(Enrollment.class, "where e.course=?1 and e.courseRole='student'", c)) {
      var scores = new LinkedHashMap<String, Object>();
      for (Assessment a : assessments) {
        var submitted =
            attempts.stream()
                .filter(t -> t.student.id.equals(e.user.id) && t.assessment.id.equals(a.id))
                .toList();
        scores.put(
            a.id.toString(),
            map(
                "best",
                submitted.stream()
                    .filter(t -> t.score != null)
                    .mapToDouble(t -> t.score)
                    .max()
                    .stream()
                    .boxed()
                    .findFirst()
                    .orElse(null),
                "maxScore",
                submitted.stream().mapToDouble(t -> t.maxScore).max().orElse(0),
                "attempts",
                submitted.size()));
      }
      rows.add(
          map(
              "student",
              Views.user(e.user),
              "scores",
              scores,
              "attendance",
              map(
                  "checkedIn",
                  records.stream().filter(x -> x.user.id.equals(e.user.id)).count(),
                  "sessions",
                  sessions)));
    }
    return map(
        "assessments",
        assessments.stream()
            .map(a -> map("id", a.id, "title", a.title, "kind", a.kind, "published", a.published))
            .toList(),
        "rows",
        rows);
  }
}
