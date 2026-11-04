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
class AdminController {
  private final Store store;
  private final Access access;
  private final Views views;

  AdminController(Store s, Access a, Views v) {
    store = s;
    access = a;
    views = v;
  }

  @GetMapping("/users")
  Object users(
      HttpServletRequest r,
      @RequestParam(defaultValue = "") String q,
      @RequestParam(defaultValue = "") String role,
      @RequestParam(defaultValue = "50") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    access.admin(r);
    var users = search(q, role);
    return map(
        "total",
        users.size(),
        "users",
        users.stream()
            .skip(Math.max(0, offset))
            .limit(Math.max(1, Math.min(limit, 200)))
            .map(Views::user)
            .toList());
  }

  List<User> search(String q, String role) {
    String term = q.toLowerCase();
    return store.all(User.class).stream()
        .filter(
            u ->
                (u.name.toLowerCase().contains(term) || u.email.toLowerCase().contains(term))
                    && (role.isBlank() || u.role.equals(role)))
        .toList();
  }

  @GetMapping("/users/search")
  Object search(HttpServletRequest r, @RequestParam(defaultValue = "") String q) {
    User actor = access.current(r);
    require(!actor.role.equals("student"), "forbidden", 403);
    return map("users", search(q, "").stream().limit(20).map(Views::user).toList());
  }

  @PostMapping("/users")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object create(HttpServletRequest r, @RequestBody Map<String, Object> b) {
    User actor = access.admin(r);
    User u = new User();
    userFields(u, b, true);
    store.save(u);
    access.audit(actor, "user_created", r.getRemoteAddr(), "userId", u.id);
    return Views.user(u);
  }

  void userFields(User u, Map<String, Object> b, boolean create) {
    u.email = text(b, "email", u.email);
    u.name = text(b, "name", u.name);
    u.role = text(b, "role", u.role);
    require(
        u.email != null
            && u.email.contains("@")
            && u.name != null
            && !u.name.isBlank()
            && Set.of("admin", "teacher", "ta", "student").contains(u.role),
        "invalid_user",
        400);
    u.email = u.email.trim().toLowerCase();
    String password = text(b, "password", "");
    if (create || !password.isEmpty()) {
      require(password.length() >= 12 && password.length() <= 72, "weak_password", 400);
      u.passwordHash = access.hash(password);
      u.activeSession = null;
    }
  }

  @PatchMapping("/users/{id}")
  Object edit(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User actor = access.admin(r);
    User u = store.get(User.class, id);
    if (actor.id.equals(id))
      require(text(b, "role", u.role).equals("admin"), "cannot_demote_self", 409);
    userFields(u, b, false);
    access.audit(actor, "user_updated", r.getRemoteAddr(), "userId", id);
    return Views.user(u);
  }

  @DeleteMapping("/users/{id}")
  Object remove(HttpServletRequest r, @PathVariable long id) {
    User actor = access.admin(r);
    require(!actor.id.equals(id), "cannot_delete_self", 409);
    User u = store.get(User.class, id);
    require(store.list(Course.class, "where e.owner=?1", u).isEmpty(), "user_owns_courses", 409);
    store.list(Enrollment.class, "where e.user=?1", u).forEach(store::delete);
    store.delete(u);
    store.flush();
    access.audit(actor, "user_deleted", r.getRemoteAddr(), "userId", id);
    return map("ok", true);
  }

  @GetMapping("/admin/sessions")
  Object sessions(HttpServletRequest r) {
    access.admin(r);
    return map(
        "sessions",
        store.all(User.class).stream()
            .filter(this::active)
            .map(
                u -> {
                  var d = Views.user(u);
                  d.putAll(
                      map(
                          "ip",
                          u.sessionIp,
                          "userAgent",
                          u.sessionUserAgent,
                          "lastActivity",
                          u.lastActivity));
                  return d;
                })
            .toList());
  }

  boolean active(User u) {
    return u.activeSession != null
        && u.lastActivity != null
        && u.lastActivity.plusSeconds(120).isAfter(Instant.now());
  }

  @DeleteMapping("/admin/sessions/{id}")
  Object revoke(HttpServletRequest r, @PathVariable long id) {
    User actor = access.admin(r);
    store.get(User.class, id).activeSession = null;
    access.audit(actor, "session_revoked", r.getRemoteAddr(), "userId", id);
    return map("ok", true);
  }

  @GetMapping("/admin/ip-blacklist")
  Object networks(HttpServletRequest r) {
    access.admin(r);
    return map(
        "networks",
        store.all(IpBlacklist.class).stream()
            .map(
                n ->
                    map(
                        "id",
                        n.id,
                        "network",
                        n.network,
                        "reason",
                        n.reason,
                        "createdAt",
                        n.createdAt))
            .toList());
  }

  @PostMapping("/admin/ip-blacklist")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object addNetwork(HttpServletRequest r, @RequestBody Map<String, Object> b) {
    User actor = access.admin(r);
    IpBlacklist n = new IpBlacklist();
    n.network = required(b, "network");
    require(Access.inNetwork(n.network.split("/")[0], n.network), "invalid_network", 400);
    n.reason = text(b, "reason", "");
    store.save(n);
    access.audit(actor, "network_blocked", r.getRemoteAddr(), "network", n.network);
    return map("id", n.id, "network", n.network, "reason", n.reason, "createdAt", n.createdAt);
  }

  @DeleteMapping("/admin/ip-blacklist/{id}")
  Object removeNetwork(HttpServletRequest r, @PathVariable long id) {
    User actor = access.admin(r);
    store.delete(store.get(IpBlacklist.class, id));
    access.audit(actor, "network_unblocked", r.getRemoteAddr(), "id", id);
    return map("ok", true);
  }

  @GetMapping("/admin/audit")
  Object audit(
      HttpServletRequest r,
      @RequestParam(defaultValue = "") String kind,
      @RequestParam(defaultValue = "50") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    access.admin(r);
    var events =
        store.list(AuditEvent.class, "order by e.id desc").stream()
            .filter(e -> kind.isBlank() || e.kind.equals(kind))
            .toList();
    return map(
        "total",
        events.size(),
        "events",
        events.stream()
            .skip(Math.max(0, offset))
            .limit(Math.max(1, Math.min(limit, 200)))
            .map(views::audit)
            .toList());
  }

  @GetMapping(value = "/admin/audit/export", produces = "text/csv")
  String export(HttpServletRequest r) {
    access.admin(r);
    StringBuilder csv = new StringBuilder("id,actorId,kind,ip,createdAt\n");
    for (AuditEvent e : store.all(AuditEvent.class))
      csv.append(e.id)
          .append(',')
          .append(e.actorId)
          .append(',')
          .append(e.kind)
          .append(',')
          .append(e.ip)
          .append(',')
          .append(e.createdAt)
          .append('\n');
    return csv.toString();
  }

  @GetMapping("/admin/stats")
  Object stats(HttpServletRequest r) {
    access.admin(r);
    var users = store.all(User.class);
    var counts = new LinkedHashMap<String, Long>();
    for (String role : List.of("admin", "teacher", "ta", "student"))
      counts.put(role, users.stream().filter(u -> u.role.equals(role)).count());
    return map(
        "users",
        counts,
        "courses",
        store.all(Course.class).size(),
        "assessments",
        store.all(Assessment.class).size(),
        "attempts",
        store.all(Attempt.class).size(),
        "attendanceCheckins",
        store.all(AttendanceRecord.class).size(),
        "pendingLeave",
        store.list(LeaveRequest.class, "where e.status='pending'").size(),
        "activeSessions",
        users.stream().filter(this::active).count(),
        "recentEvents",
        store.list(AuditEvent.class, "order by e.id desc").stream()
            .limit(10)
            .map(views::audit)
            .toList());
  }
}
