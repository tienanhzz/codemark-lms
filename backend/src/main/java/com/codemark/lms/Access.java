package com.codemark.lms;

import jakarta.servlet.http.*;
import java.net.*;
import java.time.*;
import java.util.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class Access {
  final Store store;
  private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder();

  String hash(String password) {
    return passwords.encode(password);
  }

  boolean matches(String password, String hash) {
    return passwords.matches(password, hash);
  }

  Access(Store store) {
    this.store = store;
  }

  User current(HttpServletRequest r) {
    return authenticate(r.getSession(false), r.getRemoteAddr());
  }

  User authenticate(HttpSession session, String ip) {
    Api.require(
        session != null && session.getAttribute("uid") instanceof Long,
        "authentication_required",
        401);
    User u = store.get(User.class, (Long) session.getAttribute("uid"));
    Api.require(
        Objects.equals(u.activeSession, session.getId())
            && u.lastActivity != null
            && u.lastActivity.plusSeconds(120).isAfter(Instant.now()),
        "authentication_required",
        401);
    Api.require(!blocked(ip), "network_denied", 403);
    if (u.lastActivity.plusSeconds(5).isBefore(Instant.now())) u.lastActivity = Instant.now();
    return u;
  }

  User admin(HttpServletRequest r) {
    User u = current(r);
    Api.require(u.role.equals("admin"), "forbidden", 403);
    return u;
  }

  String role(User u, Course c) {
    if (u.role.equals("admin")) return "admin";
    if (Objects.equals(u.id, c.owner.id)) return "teacher";
    return store.list(Enrollment.class, "where e.course=?1 and e.user=?2", c, u).stream()
        .map(e -> e.courseRole)
        .findFirst()
        .orElse(null);
  }

  Course course(User u, long id, boolean staff) {
    Course c = store.get(Course.class, id);
    String role = role(u, c);
    Api.require(role != null && (!staff || !role.equals("student")), "forbidden", 403);
    return c;
  }

  Course owner(User u, long id) {
    Course c = course(u, id, true);
    Api.require(u.role.equals("admin") || c.owner.id.equals(u.id), "forbidden", 403);
    return c;
  }

  boolean blocked(String ip) {
    return store.all(IpBlacklist.class).stream().anyMatch(e -> inNetwork(ip, e.network));
  }

  static boolean inNetwork(String ip, String cidr) {
    try {
      // Only literals are accepted; never resolve user supplied hostnames.
      if (!cidr.matches("[0-9a-fA-F:.]+(/[0-9]{1,3})?") || !ip.matches("[0-9a-fA-F:.]+"))
        return false;
      String[] parts = cidr.split("/");
      byte[] network = InetAddress.getByName(parts[0]).getAddress(),
          address = InetAddress.getByName(ip).getAddress();
      int bits = parts.length == 2 ? Integer.parseInt(parts[1]) : network.length * 8;
      if (address.length != network.length || bits < 0 || bits > network.length * 8) return false;
      for (int i = 0; i < bits; i++)
        if ((address[i / 8] & (1 << (7 - i % 8))) != (network[i / 8] & (1 << (7 - i % 8))))
          return false;
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  void network(Assessment a, String ip) {
    Api.require(
        a.ipAllowlist.isEmpty() || a.ipAllowlist.stream().anyMatch(n -> inNetwork(ip, n)),
        "network_denied",
        403);
  }

  void audit(User user, String kind, String ip, Object... detail) {
    AuditEvent e = new AuditEvent();
    e.actorId = user == null ? null : user.id;
    e.kind = kind;
    e.ip = ip;
    e.detail = Api.map(detail);
    store.save(e);
  }

  Map<String, Object> login(HttpServletRequest r, Map<String, Object> b) {
    Api.require(!blocked(r.getRemoteAddr()), "network_denied", 403);
    User u =
        store
            .list(User.class, "where e.email=?1", Api.text(b, "email", "").trim().toLowerCase())
            .stream()
            .findFirst()
            .orElse(null);
    Api.require(
        u != null && passwords.matches(Api.text(b, "password", ""), u.passwordHash),
        "invalid_credentials",
        401);
    HttpSession old = r.getSession(false);
    if (old != null) old.invalidate();
    HttpSession session = r.getSession(true);
    session.setMaxInactiveInterval(120);
    session.setAttribute("uid", u.id);
    u.activeSession = session.getId();
    u.lastActivity = Instant.now();
    u.sessionIp = r.getRemoteAddr();
    u.sessionUserAgent = r.getHeader("User-Agent");
    audit(u, "login", r.getRemoteAddr());
    return Api.map("user", Views.user(u));
  }
}
