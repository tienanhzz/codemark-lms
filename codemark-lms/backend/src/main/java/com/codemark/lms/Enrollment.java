package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(
    name = "cf_enrollment",
    uniqueConstraints = @UniqueConstraint(columnNames = {"course_id", "user_id"}))
class Enrollment extends BaseEntity {
  protected Enrollment() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  @ManyToOne(fetch = FetchType.EAGER)
  User user;

  String courseRole = "student";
}
