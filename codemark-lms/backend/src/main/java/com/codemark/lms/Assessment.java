package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "cf_assessment")
class Assessment extends BaseEntity {
  protected Assessment() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  @ManyToOne(fetch = FetchType.EAGER)
  User createdBy;

  String title;

  @Column(length = 100000)
  String description = "";

  String kind = "quiz";
  @Column(nullable=false)
  @org.hibernate.annotations.ColumnDefault("1")
  double rankWeight = 1;
  @Column(nullable=false)
  @org.hibernate.annotations.ColumnDefault("'easy'")
  String difficulty = "easy";
  Instant opensAt;
  Instant closesAt;
  Instant gradingDueAt;
  int durationMinutes = 60;
  int maxAttempts = 1;
  boolean published;

  @JdbcTypeCode(SqlTypes.JSON)
  List<String> ipAllowlist = new ArrayList<>();
}
