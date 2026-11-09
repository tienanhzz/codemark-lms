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
class AssessmentController {
  private final Store store;
  private final Access access;
  private final Views views;
  private final GradingService grading;
  private final ContainerRunner runner;
  private final RealtimeHub hub;

  AssessmentController(
      Store s, Access a, Views v, GradingService g, ContainerRunner r, RealtimeHub h) {
    store = s;
    access = a;
    views = v;
    grading = g;
    runner = r;
    hub = h;
  }

  Assessment allowed(User u, long id, boolean staff) {
    Assessment a = store.get(Assessment.class, id);
    access.course(u, a.course.id, staff);
    if (!staff && "student".equals(access.role(u, a.course)))
      require(a.published, "not_found", 404);
    return a;
  }

  @GetMapping("/runner/status")
  Object runner(HttpServletRequest r) {
    access.current(r);
    return runner.status();
  }

  @GetMapping("/courses/{id}/assessments")
  Object list(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Course c = access.course(u, id, false);
    return map(
        "assessments",
        store.list(Assessment.class, "where e.course=?1 order by e.opensAt", c).stream()
            .filter(a -> a.published || !"student".equals(access.role(u, c)))
            .map(a -> views.assessment(a, u, false))
            .toList());
  }

  @PostMapping("/courses/{id}/assessments")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object create(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Assessment a = new Assessment();
    a.course = access.course(u, id, true);
    a.createdBy = u;
    fields(a, b);
    store.save(a);
    return views.assessment(a, u, true);
  }

  @SuppressWarnings("unchecked")
  void fields(Assessment a, Map<String, Object> b) {
    a.title = text(b, "title", a.title);
    require(a.title != null && !a.title.isBlank(), "title_required", 400);
    a.description = text(b, "description", a.description);
    a.kind = text(b, "kind", a.kind);
    if (b.containsKey("rankWeight")) {
      a.rankWeight = Double.parseDouble(b.get("rankWeight").toString());
      require(Double.isFinite(a.rankWeight) && a.rankWeight > 0 && a.rankWeight <= 10, "invalid_weight", 400);
    }
    a.opensAt = instant(b, "opensAt", a.opensAt == null ? Instant.now() : a.opensAt);
    a.closesAt =
        instant(b, "closesAt", a.closesAt == null ? Instant.now().plusSeconds(86400) : a.closesAt);
    require(a.closesAt.isAfter(a.opensAt), "invalid_time_range", 400);
    a.durationMinutes = integer(b, "durationMinutes", a.durationMinutes, 1, 1440);
    a.maxAttempts = integer(b, "maxAttempts", a.maxAttempts, 1, 100);
    a.published = bool(b, "published", a.published);
    if (b.containsKey("ipAllowlist")) {
      require(b.get("ipAllowlist") instanceof List<?>, "invalid_allowlist", 400);
      a.ipAllowlist = ((List<?>) b.get("ipAllowlist")).stream().map(Object::toString).toList();
      for (String n : a.ipAllowlist)
        require(Access.inNetwork(n.split("/")[0], n), "invalid_network", 400);
    }
  }

  @GetMapping("/assessments/{id}")
  Object get(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Assessment a = allowed(u, id, false);
    access.network(a, r.getRemoteAddr());
    return views.assessment(a, u, true);
  }

  @PatchMapping("/assessments/{id}")
  Object edit(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Assessment a = allowed(u, id, true);
    fields(a, b);
    return views.assessment(a, u, true);
  }

  @DeleteMapping("/assessments/{id}")
  Object remove(HttpServletRequest r, @PathVariable long id) {
    Assessment a = allowed(access.current(r), id, true);
    deleteAssessment(store, a);
    return map("ok", true);
  }

  static void deleteAssessment(Store s, Assessment a) {
    for (Attempt t : s.list(Attempt.class, "where e.assessment=?1", a)) {
      s.list(ProctorEvent.class, "where e.attempt=?1", t).forEach(s::delete);
      s.delete(t);
    }
    for (Question q : s.list(Question.class, "where e.assessment=?1", a)) {
      s.list(TestCase.class, "where e.question=?1", q).forEach(s::delete);
      s.delete(q);
    }
    s.delete(a);
  }

  @GetMapping("/assessments/{id}/questions")
  Object questions(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Assessment a = allowed(u, id, false);
    boolean staff = !"student".equals(access.role(u, a.course));
    return map(
        "questions",
        store.list(Question.class, "where e.assessment=?1 order by e.position,e.id", a).stream()
            .map(q -> views.question(q, staff))
            .toList());
  }

  @PostMapping("/assessments/{id}/questions")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addQuestion(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    Question q = new Question();
    q.assessment = allowed(access.current(r), id, true);
    questionFields(q, b);
    store.save(q);
    return views.question(q, true);
  }

  void questionFields(Question q, Map<String, Object> b) {
    q.prompt = text(b, "prompt", q.prompt);
    require(q.prompt != null && !q.prompt.isBlank(), "prompt_required", 400);
    q.kind = text(b, "kind", q.kind);
    require(Set.of("mcq", "short", "code").contains(q.kind), "invalid_kind", 400);
    q.language = text(b, "language", q.language);
    if (q.kind.equals("code"))
      require(
          Set.of("python", "c", "cpp", "java", "sql")
              .contains(q.language == null ? "" : q.language),
          "unsupported_language",
          400);
    q.answer = text(b, "answer", q.answer);
    q.points = Double.parseDouble(text(b, "points", Double.toString(q.points)));
    require(Double.isFinite(q.points) && q.points > 0 && q.points <= 10000, "invalid_points", 400);
    q.position = integer(b, "position", q.position, 0, 10000);
    if (b.containsKey("options")) {
      require(b.get("options") instanceof List<?>, "invalid_options", 400);
      q.options = ((List<?>) b.get("options")).stream().map(Object::toString).toList();
    }
    if (q.kind.equals("mcq")) {
      require(q.options.size() >= 2 && q.answer != null, "invalid_options", 400);
      integer(map("answer", q.answer), "answer", 0, 0, q.options.size() - 1);
    }
  }

  @PatchMapping("/questions/{id}")
  Object editQuestion(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    Question q = store.get(Question.class, id);
    allowed(access.current(r), q.assessment.id, true);
    questionFields(q, b);
    return views.question(q, true);
  }

  @DeleteMapping("/questions/{id}")
  Object removeQuestion(HttpServletRequest r, @PathVariable long id) {
    Question q = store.get(Question.class, id);
    allowed(access.current(r), q.assessment.id, true);
    store.list(TestCase.class, "where e.question=?1", q).forEach(store::delete);
    store.delete(q);
    return map("ok", true);
  }

  @GetMapping("/questions/{id}/testcases")
  Object cases(HttpServletRequest r, @PathVariable long id) {
    Question q = store.get(Question.class, id);
    allowed(access.current(r), q.assessment.id, true);
    return map(
        "testCases",
        store.list(TestCase.class, "where e.question=?1 order by e.id", q).stream()
            .map(views::testCase)
            .toList());
  }

  @PostMapping("/questions/{id}/testcases")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addCase(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    TestCase c = new TestCase();
    c.question = store.get(Question.class, id);
    allowed(access.current(r), c.question.assessment.id, true);
    c.input = text(b, "input", "");
    c.expectedOutput = text(b, "expectedOutput", "");
    c.hidden = bool(b, "hidden", false);
    c.points = Double.parseDouble(text(b, "points", "1"));
    require(c.points > 0 && Double.isFinite(c.points), "invalid_points", 400);
    c.timeLimitMs = integer(b, "timeLimitMs", 2000, 100, 30000);
    c.memoryMb = integer(b, "memoryMb", 256, 32, 1024);
    store.save(c);
    return views.testCase(c);
  }

  @DeleteMapping("/testcases/{id}")
  Object deleteCase(HttpServletRequest r, @PathVariable long id) {
    TestCase c = store.get(TestCase.class, id);
    allowed(access.current(r), c.question.assessment.id, true);
    store.delete(c);
    return map("ok", true);
  }

  @PostMapping("/questions/{id}/run")
  Object run(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Question q = store.get(Question.class, id);
    Assessment a = allowed(u, q.assessment.id, false);
    access.network(a, r.getRemoteAddr());
    require(q.kind.equals("code"), "not_a_code_question", 400);
    if ("student".equals(access.role(u, a.course))) {
      Attempt t =
          store
              .list(
                  Attempt.class,
                  "where e.assessment=?1 and e.student=?2 and e.status='in_progress' order by e.id"
                      + " desc",
                  a,
                  u)
              .stream()
              .findFirst()
              .orElseThrow(() -> new Failure("no_active_attempt", 409));
      grading.checkOpen(t);
    }
    require(runner.available(), "runner_unavailable", 503);
    var cases =
        store.list(TestCase.class, "where e.question=?1 and e.hidden=false order by e.id", q);
    var results = runner.runCases(q.language, required(b, "source"), cases);
    var payload = new ArrayList<Map<String, Object>>();
    for (int i = 0; i < cases.size(); i++) {
      var result = results.get(i);
      payload.add(
          map(
              "testCaseId",
              cases.get(i).id,
              "passed",
              result.passed(),
              "stdout",
              result.stdout(),
              "stderr",
              result.stderr(),
              "error",
              result.error()));
    }
    return map("results", payload);
  }

  @PostMapping("/assessments/{id}/start")
  Object start(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Assessment a = allowed(u, id, false);
    require("student".equals(access.role(u, a.course)), "staff_cannot_take_assessment", 403);
    access.network(a, r.getRemoteAddr());
    Instant now = Instant.now();
    require(!now.isBefore(a.opensAt) && now.isBefore(a.closesAt), "assessment_closed", 409);
    // Lock the assessment row so simultaneous start requests cannot bypass attempt limits.
    store.lock(a);
    var previous =
        store.list(
            Attempt.class, "where e.assessment=?1 and e.student=?2 order by e.id desc", a, u);
    for (Attempt t : previous)
      if (t.status.equals("in_progress")) {
        if (t.deadline.isAfter(now)) return views.attempt(t, true, u);
        grading.submit(t);
      }
    require(previous.size() < a.maxAttempts, "max_attempts_reached", 409);
    Attempt t = new Attempt();
    t.assessment = a;
    t.student = u;
    t.deadline = now.plusSeconds(a.durationMinutes * 60L);
    if (t.deadline.isAfter(a.closesAt)) t.deadline = a.closesAt;
    t.maxScore =
        store.list(Question.class, "where e.assessment=?1", a).stream()
            .mapToDouble(q -> q.points)
            .sum();
    store.save(t);
    access.audit(u, "attempt_started", r.getRemoteAddr(), "assessmentId", id);
    return views.attempt(t, true, u);
  }

  Attempt attempt(User u, long id, String ip, boolean own) {
    Attempt t = store.get(Attempt.class, id);
    if (own) require(t.student.id.equals(u.id), "forbidden", 403);
    else if (!t.student.id.equals(u.id)) access.course(u, t.assessment.course.id, true);
    else access.course(u, t.assessment.course.id, false);
    access.network(t.assessment, ip);
    return t;
  }

  @GetMapping("/attempts/{id}")
  Object getAttempt(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Attempt t = attempt(u, id, r.getRemoteAddr(), false);
    if (t.status.equals("in_progress") && !t.deadline.isAfter(Instant.now())) grading.submit(t);
    return views.attempt(t, true, u);
  }

  @GetMapping("/attempts")
  Object myAttempts(HttpServletRequest r) {
    User u = access.current(r);
    return map(
        "attempts",
        store.list(Attempt.class, "where e.student=?1 order by e.id desc", u).stream()
            .map(t -> views.attempt(t, false, u))
            .toList());
  }

  @PutMapping("/attempts/{id}/answers/{questionId}")
  Object answer(
      HttpServletRequest r,
      @PathVariable long id,
      @PathVariable long questionId,
      @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Attempt t = attempt(u, id, r.getRemoteAddr(), true);
    grading.checkOpen(t);
    require(
        store.get(Question.class, questionId).assessment.id.equals(t.assessment.id),
        "question_not_found",
        404);
    var answers = new LinkedHashMap<>(t.answers);
    String response = b.get("response") == null ? null : b.get("response").toString();
    require(response == null || response.length() <= 100000, "answer_too_long", 400);
    answers.put(Long.toString(questionId), response);
    t.answers = answers;
    if (b.get("currentQuestion") != null)
      t.currentQuestion = Long.valueOf(b.get("currentQuestion").toString());
    return map("ok", true, "deadline", t.deadline);
  }

  @PutMapping("/attempts/{id}/flags/{questionId}")
  Object flags(
      HttpServletRequest r,
      @PathVariable long id,
      @PathVariable long questionId,
      @RequestBody Map<String, Object> b) {
    Attempt t = attempt(access.current(r), id, r.getRemoteAddr(), true);
    grading.checkOpen(t);
    require(
        store.get(Question.class, questionId).assessment.id.equals(t.assessment.id),
        "question_not_found",
        404);
    require(b.get("flagged") instanceof Boolean, "invalid_flag", 400);
    var flags = new TreeSet<>(t.flaggedQuestions);
    if ((boolean) b.get("flagged")) flags.add(questionId);
    else flags.remove(questionId);
    t.flaggedQuestions = new ArrayList<>(flags);
    return map("flaggedQuestions", t.flaggedQuestions);
  }

  @PostMapping("/attempts/{id}/submit")
  Object submit(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Attempt t = attempt(u, id, r.getRemoteAddr(), true);
    boolean expired = t.status.equals("in_progress") && !t.deadline.isAfter(Instant.now());
    grading.submit(t);
    access.audit(u, "attempt_submitted", r.getRemoteAddr(), "attemptId", id, "score", t.score);
    hub.monitor(
        t.assessment.id,
        "attempt_submitted",
        map("attemptId", id, "assessmentId", t.assessment.id, "score", t.score));
    var d = views.attempt(t, false, u);
    d.put("ok", true);
    d.put("deadlineExceeded", expired);
    return d;
  }

  @GetMapping("/assessments/{id}/attempts")
  Object attempts(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Assessment a = allowed(u, id, true);
    return map(
        "attempts",
        store.list(Attempt.class, "where e.assessment=?1 order by e.id desc", a).stream()
            .map(t -> views.attempt(t, false, u))
            .toList());
  }

  @PostMapping("/attempts/{id}/telemetry")
  Object telemetry(
      HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Attempt t = attempt(u, id, r.getRemoteAddr(), true);
    recordTelemetry(store, views, hub, t, u, b);
    return map("ok", true);
  }

  static void recordTelemetry(
      Store s, Views views, RealtimeHub hub, Attempt t, User u, Map<String, Object> b) {
    require(
        t.status.equals("in_progress") && t.deadline.isAfter(Instant.now()), "attempt_closed", 409);
    String kind = text(b, "event", "");
    require(
        Set.of(
                "connected",
                "visibility_change",
                "focus",
                "blur",
                "fullscreen_change",
                "copy",
                "cut",
                "paste",
                "connectivity",
                "question_progress")
            .contains(kind),
        "invalid_event",
        400);
    ProctorEvent e = new ProctorEvent();
    e.attempt = t;
    e.user = u;
    e.kind = kind;
    for (String key :
        List.of("question", "fullscreen", "visible", "tabSwitches", "clipboard", "connectivity"))
      if (b.containsKey(key)) {
        Object value = b.get(key);
        if (value instanceof String || value instanceof Number || value instanceof Boolean)
          e.detail.put(
              key,
              value instanceof String
                  ? value.toString().substring(0, Math.min(128, value.toString().length()))
                  : value);
      }
    if (b.get("question") instanceof Number n) t.currentQuestion = n.longValue();
    s.save(e);
    hub.monitor(t.assessment.id, "proctor_event", views.proctor(e));
  }

  @GetMapping("/attempts/{id}/proctor")
  Object proctor(HttpServletRequest r, @PathVariable long id) {
    Attempt t = store.get(Attempt.class, id);
    access.course(access.current(r), t.assessment.course.id, true);
    return map(
        "events",
        store.list(ProctorEvent.class, "where e.attempt=?1 order by e.id", t).stream()
            .map(views::proctor)
            .toList());
  }

  @GetMapping(value = "/courses/{id}/proctor-report", produces = "text/csv")
  String report(HttpServletRequest r, @PathVariable long id) {
    Course c = access.course(access.current(r), id, true);
    return "id,attemptId,userId,kind,createdAt\n"
        + store
            .list(ProctorEvent.class, "where e.attempt.assessment.course=?1 order by e.id", c)
            .stream()
            .map(
                e ->
                    e.id
                        + ","
                        + e.attempt.id
                        + ","
                        + e.user.id
                        + ","
                        + e.kind
                        + ","
                        + e.createdAt
                        + "\n")
            .reduce("", String::concat);
  }
}
