package com.codemark.lms;

import static com.codemark.lms.Api.*;

import jakarta.servlet.http.HttpSession;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
class RealtimeService {
  private final Store store;
  private final Access access;
  private final Views views;
  private final GradingService grading;
  private final RealtimeHub hub;

  RealtimeService(Store s, Access a, Views v, GradingService g, RealtimeHub h) {
    store = s;
    access = a;
    views = v;
    grading = g;
    hub = h;
  }

  void connect(String id, HttpSession session, String ip) {
    User u = access.authenticate(session, ip);
    hub.join(id, "user:" + u.id);
    hub.send(id, "connected", map("userId", u.id, "serverTime", Instant.now()));
  }

  void message(String id, HttpSession session, String ip, String event, Map<String, Object> b) {
    User u = access.authenticate(session, ip);
    require(!u.mustChangePassword || event.equals("heartbeat"), "password_change_required", 403);
    switch (event) {
      case "heartbeat" -> hub.send(id, "heartbeat_ack", map("serverTime", Instant.now()));
      case "join_course" -> {
        long courseId = Long.parseLong(b.get("courseId").toString());
        access.course(u, courseId, false);
        hub.join(id, "course:" + courseId);
      }
      case "join_monitor" -> {
        Assessment a =
            store.get(Assessment.class, Long.parseLong(b.get("assessmentId").toString()));
        access.course(u, a.course.id, true);
        access.network(a, ip);
        hub.join(id, "monitor:" + a.id);
        hub.send(id, "monitor_joined", map("assessmentId", a.id));
      }
      case "telemetry" -> {
        Attempt t = store.get(Attempt.class, Long.parseLong(b.get("attemptId").toString()));
        require(t.student.id.equals(u.id), "forbidden", 403);
        access.course(u, t.assessment.course.id, false);
        access.network(t.assessment, ip);
        AssessmentController.recordTelemetry(store, views, hub, t, u, b);
      }
      case "teacher_action" -> action(id, u, ip, b);
      default -> throw new Failure("unknown_event", 400);
    }
  }

  void action(String socket, User u, String ip, Map<String, Object> b) {
    Assessment a = store.get(Assessment.class, Long.parseLong(b.get("assessmentId").toString()));
    access.course(u, a.course.id, true);
    access.network(a, ip);
    String action = required(b, "action");
    Long target =
        b.get("targetUserId") == null ? null : Long.valueOf(b.get("targetUserId").toString());
    var attempts =
        store.list(Attempt.class, "where e.assessment=?1 and e.status='in_progress'", a).stream()
            .filter(t -> target == null || t.student.id.equals(target))
            .toList();
    if (action.equals("alert")) {
      String message = required(b, "message");
      require(message.length() <= 500, "message_too_long", 400);
      require(target == null || !attempts.isEmpty(), "no_active_attempt", 409);
      var payload =
          map("assessmentId", a.id, "message", message, "from", u.name, "sentAt", Instant.now());
      attempts.forEach(t -> hub.user(t.student.id, "teacher_alert", payload));
      hub.monitor(a.id, "teacher_alert", payload);
    } else {
      require(target != null && !attempts.isEmpty(), "no_active_attempt", 409);
      Attempt t = attempts.get(0);
      if (action.equals("adjust_time")) {
        int seconds = integer(b, "seconds", 0, -3600, 3600);
        require(seconds != 0, "invalid_seconds", 400);
        Instant next = t.deadline.plusSeconds(seconds);
        t.deadline = next.isBefore(Instant.now()) ? Instant.now() : next;
        var payload =
            map(
                "attemptId",
                t.id,
                "assessmentId",
                a.id,
                "deadline",
                t.deadline,
                "seconds",
                seconds);
        hub.user(t.student.id, "deadline_adjusted", payload);
        hub.monitor(a.id, "deadline_adjusted", payload);
      } else if (action.equals("force_submit")) {
        grading.submit(t);
        var payload = map("attemptId", t.id, "assessmentId", a.id, "score", t.score);
        hub.user(t.student.id, "forced_submission", payload);
        hub.monitor(a.id, "attempt_submitted", payload);
      } else throw new Failure("unknown_action", 400);
    }
    access.audit(u, "teacher_" + action, ip, "assessmentId", a.id, "targetUserId", target);
    hub.send(socket, "teacher_action_ack", map("action", action, "ok", true));
  }
}
