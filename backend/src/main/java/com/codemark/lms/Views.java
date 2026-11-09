package com.codemark.lms;

import static com.codemark.lms.Api.map;

import java.util.*;
import org.springframework.stereotype.Component;

/** Explicit DTOs keep password hashes, answers and filesystem paths off the wire. */
@Component
class Views {
  private final Store store;
  private final Access access;

  Views(Store s, Access a) {
    store = s;
    access = a;
  }

  static Map<String, Object> user(User u) {
    return u == null ? null : map("id", u.id, "name", u.name, "studentId", u.studentId, "role", u.role, "pendingCode", u.pendingCode, "mustChangePassword", u.mustChangePassword);
  }

  Map<String, Object> course(Course c, User u) {
    return map(
        "id",
        c.id,
        "code",
        c.code,
        "title",
        c.title,
        "description",
        c.description,
        "ownerId",
        c.owner.id,
        "owner",
        user(c.owner),
        "term",
        c.term,
        "startDate",
        c.startDate,
        "endDate",
        c.endDate,
        "published",
        c.published,
        "role",
        access.role(u, c),
        "meetings",
        store.list(Meeting.class, "where e.course=?1", c).stream().map(this::meeting).toList(),
        "studentCount",
        store.list(Enrollment.class, "where e.course=?1 and e.courseRole='student'", c).size(),
        "lessonCount",
        store.list(Lesson.class, "where e.course=?1", c).size(),
        "assessmentCount",
        store.list(Assessment.class, "where e.course=?1", c).size());
  }

  Map<String, Object> meeting(Meeting m) {
    return map(
        "id",
        m.id,
        "courseId",
        m.course.id,
        "weekday",
        m.weekday,
        "start",
        m.startTime.toString(),
        "end",
        m.endTime.toString(),
        "location",
        m.location);
  }

  Map<String, Object> lesson(Lesson l) {
    return map(
        "id",
        l.id,
        "courseId",
        l.course.id,
        "title",
        l.title,
        "content",
        l.content,
        "position",
        l.position,
        "published",
        l.published,
        "createdAt",
        l.createdAt);
  }

  Map<String, Object> announcement(Announcement a) {
    return map(
        "id",
        a.id,
        "courseId",
        a.course.id,
        "title",
        a.title,
        "body",
        a.body,
        "author",
        user(a.author),
        "createdAt",
        a.createdAt);
  }

  Map<String, Object> post(DiscussionPost p) {
    return map(
        "id",
        p.id,
        "courseId",
        p.course.id,
        "body",
        p.body,
        "parentId",
        p.parentId,
        "author",
        user(p.author),
        "createdAt",
        p.createdAt);
  }

  Map<String, Object> enrollment(Enrollment e) {
    return map(
        "enrollmentId",
        e.id,
        "user",
        user(e.user),
        "courseRole",
        e.courseRole,
        "createdAt",
        e.createdAt);
  }

  Map<String, Object> question(Question q, boolean staff) {
    var cases = store.list(TestCase.class, "where e.question=?1 order by e.id", q);
    var d =
        map(
            "id",
            q.id,
            "assessmentId",
            q.assessment.id,
            "prompt",
            q.prompt,
            "kind",
            q.kind,
            "language",
            q.language,
            "options",
            q.options,
            "points",
            q.points,
            "position",
            q.position,
            "testCaseCount",
            cases.size());
    if (staff) d.put("answer", q.answer);
    d.put("testCases", cases.stream().filter(c -> staff || !c.hidden).map(this::testCase).toList());
    return d;
  }

  Map<String, Object> testCase(TestCase c) {
    return map(
        "id",
        c.id,
        "questionId",
        c.question.id,
        "input",
        c.input,
        "expectedOutput",
        c.expectedOutput,
        "hidden",
        c.hidden,
        "points",
        c.points,
        "timeLimitMs",
        c.timeLimitMs,
        "memoryMb",
        c.memoryMb);
  }

  Map<String, Object> assessment(Assessment a, User u, boolean questions) {
    String role = access.role(u, a.course);
    boolean staff = role != null && !role.equals("student");
    var d =
        map(
            "id",
            a.id,
            "courseId",
            a.course.id,
            "title",
            a.title,
            "description",
            a.description,
            "kind",
            a.kind,
            "opensAt",
            a.opensAt,
            "closesAt",
            a.closesAt,
            "durationMinutes",
            a.durationMinutes,
            "maxAttempts",
            a.maxAttempts,
             "rankWeight",
             a.rankWeight,
            "published",
            a.published,
            "createdAt",
            a.createdAt,
            "role",
            role);
    var qs = store.list(Question.class, "where e.assessment=?1 order by e.position,e.id", a);
    if (staff) {
      d.put("ipAllowlist", a.ipAllowlist);
      d.put("questionCount", qs.size());
      d.put("attemptCount", store.list(Attempt.class, "where e.assessment=?1", a).size());
    }
    if (questions) d.put("questions", qs.stream().map(q -> question(q, staff)).toList());
    return d;
  }

  Map<String, Object> attempt(Attempt a, boolean details, User u) {
    var d =
        map(
            "id",
            a.id,
            "assessmentId",
            a.assessment.id,
            "student",
            user(a.student),
            "startedAt",
            a.startedAt,
            "deadline",
            a.deadline,
            "submittedAt",
            a.submittedAt,
            "status",
            a.status,
            "score",
            a.score,
            "maxScore",
            a.maxScore,
            "currentQuestion",
            a.currentQuestion,
            "flaggedQuestions",
            a.flaggedQuestions);
    if (details) {
      d.put("answers", a.answers);
      d.put("assessment", assessment(a.assessment, u, false));
      d.put("serverTime", java.time.Instant.now());
      d.put(
          "questions",
          store
              .list(Question.class, "where e.assessment=?1 order by e.position,e.id", a.assessment)
              .stream()
              .map(q -> question(q, false))
              .toList());
    }
    return d;
  }

  Map<String, Object> proctor(ProctorEvent e) {
    return map(
        "id",
        e.id,
        "attemptId",
        e.attempt.id,
        "userId",
        e.user.id,
        "kind",
        e.kind,
        "detail",
        e.detail,
        "createdAt",
        e.createdAt);
  }

  Map<String, Object> audit(AuditEvent e) {
    return map(
        "id",
        e.id,
        "actorId",
        e.actorId,
        "kind",
        e.kind,
        "detail",
        e.detail,
        "ip",
        e.ip,
        "createdAt",
        e.createdAt);
  }

  Map<String, Object> leave(LeaveRequest l) {
    return map(
        "id",
        l.id,
        "courseId",
        l.course.id,
        "student",
        user(l.student),
        "meetingId",
        l.meetingId,
        "reason",
        l.reason,
        "evidenceName",
        l.evidenceName,
        "evidenceMime",
        l.evidenceMime,
        "evidenceSize",
        l.evidenceSize,
        "status",
        l.status,
        "decisionNote",
        l.decisionNote,
        "decidedBy",
        user(l.decidedBy),
        "decidedAt",
        l.decidedAt,
        "createdAt",
        l.createdAt);
  }
}
