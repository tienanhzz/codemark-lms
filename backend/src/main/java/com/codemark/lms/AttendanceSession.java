package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_attendancesession")
class AttendanceSession extends BaseEntity {
  protected AttendanceSession() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  @ManyToOne(fetch = FetchType.EAGER)
  User openedBy;

  Instant opensAt = Instant.now();
  Instant closesAt;
  String subnet;
  boolean active = true;
}
