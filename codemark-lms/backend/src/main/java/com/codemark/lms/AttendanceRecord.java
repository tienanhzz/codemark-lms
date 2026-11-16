package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(
    name = "cf_attendancerecord",
    uniqueConstraints = @UniqueConstraint(columnNames = {"session_id", "user_id"}))
class AttendanceRecord extends BaseEntity {
  protected AttendanceRecord() {}

  @ManyToOne(fetch = FetchType.EAGER)
  AttendanceSession session;

  @ManyToOne(fetch = FetchType.EAGER)
  User user;

  String ip;
  Instant checkedInAt = Instant.now();
}
