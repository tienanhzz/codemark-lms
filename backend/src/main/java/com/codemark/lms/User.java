package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_user")
class User extends BaseEntity {
  protected User() {}

  @Column(unique = true)
  String email;

  String passwordHash;
  String name;
  String role = "student";
  String activeSession;
  Instant lastActivity;
  String sessionIp;
  String sessionUserAgent;
}
