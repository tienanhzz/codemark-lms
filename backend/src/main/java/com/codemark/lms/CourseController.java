package com.codemark.lms;

import static com.codemark.lms.Api.*;

import jakarta.servlet.http.*;
import java.time.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
@Transactional
class CourseController {
  private final Store store;
  private final Access access;
  private final Views views;

  CourseController(Store s, Access a, Views v) {
    store = s;
    access = a;
    views = v;
  }

  @GetMapping("/courses")
  Object courses(HttpServletRequest r) {
    User u = access.current(r);
    return map("courses", visible(u).stream().map(c -> views.course(c, u)).toList());
  }

  List<Course> visible(User u) {
    return store.all(Course.class).stream().filter(c -> access.role(u, c) != null).toList();
  }

  @PostMapping("/courses")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object create(HttpServletRequest r, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    require(Set.of("admin", "teacher").contains(u.role), "forbidden", 403);
    Course c = new Course();
    c.owner = u;
    if (u.role.equals("admin") && b.get("ownerId") != null)
      c.owner = store.get(User.class, Long.parseLong(b.get("ownerId").toString()));
    require(Set.of("admin", "teacher").contains(c.owner.role), "invalid_owner", 400);
    update(c, b);
    store.save(c);
    Enrollment e = new Enrollment();
    e.course = c;
    e.user = c.owner;
    e.courseRole = "teacher";
    store.save(e);
    access.audit(u, "course_created", r.getRemoteAddr(), "courseId", c.id);
    return views.course(c, u);
  }

  void update(Course c, Map<String, Object> b) {
    c.code = text(b, "code", c.code);
    c.title = text(b, "title", c.title);
    c.description = text(b, "description", c.description);
    c.term = text(b, "term", c.term);
    c.startDate =
        LocalDate.parse(
            text(
                b,
                "startDate",
                c.startDate == null ? LocalDate.now().toString() : c.startDate.toString()));
    c.endDate =
        LocalDate.parse(
            text(
                b,
                "endDate",
                c.endDate == null
                    ? LocalDate.now().plusMonths(4).toString()
                    : c.endDate.toString()));
    c.published = bool(b, "published", c.published);
    require(
        c.code != null
            && !c.code.isBlank()
            && c.title != null
            && !c.title.isBlank()
            && c.term != null
            && !c.endDate.isBefore(c.startDate),
        "invalid_course",
        400);
  }

  @GetMapping("/courses/{id}")
  Object get(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    return views.course(access.course(u, id, false), u);
  }

  @PatchMapping("/courses/{id}")
  Object edit(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Course c = access.owner(u, id);
    update(c, b);
    return views.course(c, u);
  }

  @DeleteMapping("/courses/{id}")
  Object delete(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Course c = access.owner(u, id);
    for (QuizLink quiz : store.list(QuizLink.class, "where e.course=?1", c)) {
      store.list(QuizResult.class, "where e.quiz=?1", quiz).forEach(store::delete);
      store.delete(quiz);
    }
    for (Assessment a : store.list(Assessment.class, "where e.course=?1", c))
      AssessmentController.deleteAssessment(store, a);
    for (AttendanceSession a : store.list(AttendanceSession.class, "where e.course=?1", c)) {
      store.list(AttendanceRecord.class, "where e.session=?1", a).forEach(store::delete);
      store.delete(a);
    }
    for (Class<?> type :
        List.of(
            Enrollment.class,
            Meeting.class,
            Lesson.class,
            Announcement.class,
            DiscussionPost.class,
            LeaveRequest.class)) store.list(type, "where e.course=?1", c).forEach(store::delete);
    store.delete(c);
    access.audit(u, "course_deleted", r.getRemoteAddr(), "courseId", id);
    return map("ok", true);
  }

  @GetMapping("/schedule/me")
  Object schedule(HttpServletRequest r) {
    User u = access.current(r);
    return map(
        "meetings",
        visible(u).stream()
            .flatMap(
                c ->
                    store
                        .list(Meeting.class, "where e.course=?1 order by e.weekday,e.startTime", c)
                        .stream()
                        .map(
                            m -> {
                              var d = views.meeting(m);
                              d.putAll(
                                  map(
                                      "course",
                                      c.code,
                                      "title",
                                      c.title,
                                      "term",
                                      c.term,
                                      "startDate",
                                      c.startDate,
                                      "endDate",
                                      c.endDate));
                              return d;
                            }))
            .toList());
  }

  @GetMapping("/courses/{id}/meetings")
  Object meetings(HttpServletRequest r, @PathVariable long id) {
    Course c = access.course(access.current(r), id, false);
    return map(
        "meetings",
        store.list(Meeting.class, "where e.course=?1 order by e.weekday,e.startTime", c).stream()
            .map(views::meeting)
            .toList());
  }

  @PostMapping("/courses/{id}/meetings")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addMeeting(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    Meeting m = new Meeting();
    m.course = access.course(access.current(r), id, true);
    m.weekday = integer(b, "weekday", 0, 0, 6);
    m.startTime = LocalTime.parse(required(b, "start"));
    m.endTime = LocalTime.parse(required(b, "end"));
    require(m.endTime.isAfter(m.startTime), "invalid_time_range", 400);
    m.location = text(b, "location", "");
    store.save(m);
    return views.meeting(m);
  }

  @DeleteMapping("/courses/{id}/meetings/{meetingId}")
  Object removeMeeting(HttpServletRequest r, @PathVariable long id, @PathVariable long meetingId) {
    Course c = access.course(access.current(r), id, true);
    Meeting m = store.get(Meeting.class, meetingId);
    require(m.course.id.equals(c.id), "not_found", 404);
    store.delete(m);
    return map("ok", true);
  }

  @GetMapping("/courses/{id}/roster")
  Object roster(HttpServletRequest r, @PathVariable long id) {
    Course c = access.course(access.current(r), id, true);
    return map(
        "roster",
        store.list(Enrollment.class, "where e.course=?1", c).stream()
            .map(views::enrollment)
            .toList());
  }

  @PostMapping("/courses/{id}/roster")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addRoster(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User actor = access.current(r);
    Course c = access.course(actor, id, true);
    User user =
        store.list(User.class, "where e.studentId=?1", required(b, "studentId").toLowerCase()).stream()
            .findFirst()
            .orElseThrow(() -> new Failure("user_not_found", 404));
    require(
        store.list(Enrollment.class, "where e.course=?1 and e.user=?2", c, user).isEmpty(),
        "already_enrolled",
        409);
    Enrollment e = new Enrollment();
    e.course = c;
    e.user = user;
    e.courseRole = text(b, "courseRole", "student");
    rosterRole(actor, c, e.courseRole);
    store.save(e);
    return views.enrollment(e);
  }

  void rosterRole(User actor, Course c, String role) {
    require(Set.of("student", "ta", "teacher").contains(role), "invalid_role", 400);
    if (!role.equals("student")) access.owner(actor, c.id);
  }

  @PatchMapping("/courses/{id}/roster/{userId}")
  Object editRoster(
      HttpServletRequest r,
      @PathVariable long id,
      @PathVariable long userId,
      @RequestBody Map<String, Object> b) {
    User actor = access.current(r);
    Course c = access.owner(actor, id);
    Enrollment e =
        store.list(Enrollment.class, "where e.course=?1 and e.user.id=?2", c, userId).stream()
            .findFirst()
            .orElseThrow(() -> new Failure("not_found", 404));
    require(!c.owner.id.equals(userId), "cannot_change_owner", 409);
    rosterRole(actor, c, required(b, "courseRole"));
    e.courseRole = required(b, "courseRole");
    return views.enrollment(e);
  }

  @DeleteMapping("/courses/{id}/roster/{userId}")
  Object removeRoster(HttpServletRequest r, @PathVariable long id, @PathVariable long userId) {
    User actor = access.current(r);
    Course c = access.course(actor, id, true);
    require(!c.owner.id.equals(userId), "cannot_remove_owner", 409);
    Enrollment e =
        store.list(Enrollment.class, "where e.course=?1 and e.user.id=?2", c, userId).stream()
            .findFirst()
            .orElseThrow(() -> new Failure("not_found", 404));
    if (!e.courseRole.equals("student")) access.owner(actor, id);
    store.delete(e);
    return map("ok", true);
  }

  @GetMapping("/courses/{id}/lessons")
  Object lessons(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Course c = access.course(u, id, false);
    return map(
        "lessons",
        store.list(Lesson.class, "where e.course=?1 order by e.position,e.id", c).stream()
            .filter(l -> l.published || !"student".equals(access.role(u, c)))
            .map(views::lesson)
            .toList());
  }

  @PostMapping("/courses/{id}/lessons")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addLesson(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    Lesson l = new Lesson();
    l.course = access.course(access.current(r), id, true);
    lessonFields(l, b);
    store.save(l);
    return views.lesson(l);
  }

  void lessonFields(Lesson l, Map<String, Object> b) {
    l.title = text(b, "title", l.title);
    require(l.title != null && !l.title.isBlank(), "title_required", 400);
    l.content = text(b, "content", l.content);
    l.position = integer(b, "position", l.position, 0, 10000);
    l.published = bool(b, "published", l.published);
    if (b.containsKey("tagIds")) l.tagIds = LearningTaxonomyController.validatedTagIds(store,b.get("tagIds"),true);
  }

  @PatchMapping("/lessons/{id}")
  Object editLesson(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    Lesson l = store.get(Lesson.class, id);
    access.course(access.current(r), l.course.id, true);
    lessonFields(l, b);
    return views.lesson(l);
  }

  @DeleteMapping("/lessons/{id}")
  Object removeLesson(HttpServletRequest r, @PathVariable long id) {
    Lesson l = store.get(Lesson.class, id);
    access.course(access.current(r), l.course.id, true);
    store.delete(l);
    return map("ok", true);
  }

  @GetMapping("/courses/{id}/announcements")
  Object announcements(HttpServletRequest r, @PathVariable long id) {
    Course c = access.course(access.current(r), id, false);
    return map(
        "announcements",
        store.list(Announcement.class, "where e.course=?1 order by e.id desc", c).stream()
            .map(views::announcement)
            .toList());
  }

  @PostMapping("/courses/{id}/announcements")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addAnnouncement(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Announcement a = new Announcement();
    a.course = access.course(u, id, true);
    a.author = u;
    a.title = required(b, "title");
    a.body = required(b, "body");
    store.save(a);
    return views.announcement(a);
  }

  @DeleteMapping("/announcements/{id}")
  Object deleteAnnouncement(HttpServletRequest r, @PathVariable long id) {
    Announcement a = store.get(Announcement.class, id);
    access.course(access.current(r), a.course.id, true);
    store.delete(a);
    return map("ok", true);
  }

  @GetMapping("/courses/{id}/discussions")
  Object discussions(HttpServletRequest r, @PathVariable long id) {
    Course c = access.course(access.current(r), id, false);
    return map(
        "posts",
        store.list(DiscussionPost.class, "where e.course=?1 order by e.id", c).stream()
            .map(views::post)
            .toList());
  }

  @PostMapping("/courses/{id}/discussions")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addPost(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    DiscussionPost p = new DiscussionPost();
    p.course = access.course(u, id, false);
    p.author = u;
    p.body = required(b, "body");
    if (b.get("parentId") != null) {
      p.parentId = Long.valueOf(b.get("parentId").toString());
      require(
          store.get(DiscussionPost.class, p.parentId).course.id.equals(id), "invalid_parent", 400);
    }
    store.save(p);
    return views.post(p);
  }

  @DeleteMapping("/discussions/{id}")
  Object deletePost(HttpServletRequest r, @PathVariable long id) {
    DiscussionPost p = store.get(DiscussionPost.class, id);
    User u = access.current(r);
    access.course(u, p.course.id, false);
    if (!p.author.id.equals(u.id)) access.course(u, p.course.id, true);
    store
        .list(DiscussionPost.class, "where e.parentId=?1", id)
        .forEach(child -> child.parentId = null);
    store.delete(p);
    return map("ok", true);
  }
}
