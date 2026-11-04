package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "cf_attempt")
class Attempt extends BaseEntity {
  protected Attempt() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Assessment assessment;

  @ManyToOne(fetch = FetchType.EAGER)
  User student;

  Instant startedAt = Instant.now();
  Instant deadline;
  Instant submittedAt;
  String status = "in_progress";
  Double score;
  double maxScore;
  Long currentQuestion;

  @JdbcTypeCode(SqlTypes.JSON)
  List<Long> flaggedQuestions = new ArrayList<>();

  @JdbcTypeCode(SqlTypes.JSON)
  Map<String, String> answers = new LinkedHashMap<>();
}
