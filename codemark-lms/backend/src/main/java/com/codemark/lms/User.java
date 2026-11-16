package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_user")
class User extends BaseEntity {
  protected User() {}

  @Column(unique = true)
  String studentId;
  boolean pendingCode;
  boolean mustChangePassword;

  @PrePersist @PreUpdate
  void validateCode() {
    Api.require(studentId == null ? pendingCode : studentId.matches("[0-9]{10}"), "invalid_student_id", 400);
  }

  String passwordHash;
  String name;
  String role = "student";
  String activeSession;
  Instant lastActivity;
  String sessionIp;
  String sessionUserAgent;
}
