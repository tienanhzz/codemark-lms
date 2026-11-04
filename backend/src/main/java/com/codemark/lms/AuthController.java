package com.codemark.lms;

import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@Transactional
class AuthController {
  private final Access access;

  AuthController(Access a) {
    access = a;
  }

  @GetMapping("/health")
  Object health() {
    return Api.map("status", "ok", "backend", "spring-boot");
  }

  @PostMapping("/api/auth/login")
  Object login(HttpServletRequest r, @RequestBody Map<String, Object> b) {
    return access.login(r, b);
  }

  @GetMapping("/api/auth/me")
  Object me(HttpServletRequest r) {
    return Views.user(access.current(r));
  }

  @PostMapping("/api/auth/heartbeat")
  Object heartbeat(HttpServletRequest r) {
    access.current(r);
    return Api.map("ok", true);
  }

  @PostMapping("/api/auth/logout")
  Object logout(HttpServletRequest r) {
    User u = access.current(r);
    u.activeSession = null;
    u.lastActivity = null;
    r.getSession().invalidate();
    access.audit(u, "logout", r.getRemoteAddr());
    return Api.map("ok", true);
  }

  @PostMapping("/api/auth/password")
  Object password(HttpServletRequest r, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    Api.require(
        access.matches(Api.text(b, "currentPassword", ""), u.passwordHash),
        "invalid_current_password",
        400);
    String password = Api.required(b, "newPassword");
    Api.require(password.length() >= 12 && password.length() <= 72, "weak_password", 400);
    u.passwordHash = access.hash(password);
    access.audit(u, "password_changed", r.getRemoteAddr());
    return Api.map("ok", true);
  }
}
