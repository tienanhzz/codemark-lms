package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;

@Entity @Table(name="cf_season")
class Season extends BaseEntity {
  String name;
  Instant startsAt;
  Instant endsAt;
  boolean active;
}
@Entity @Table(name="cf_rank_tier")
class RankTier extends BaseEntity { String name; double threshold; }
@Entity @Table(name="cf_rank_policy")
class RankPolicy extends BaseEntity { boolean maskCodes=true; }
@Entity @Table(name="cf_point_entry", indexes=@Index(columnList="seasonId,studentId,sourceType,sourceId"))
class PointEntry extends BaseEntity {
  Long studentId; // Stable user primary key: assigning a login code does not break history.
  @org.hibernate.annotations.ColumnDefault("'student'")
  String recipientRole="student"; // Legacy rows belong to students, never reinterpreted on a role change.
  String studentCode; // Login code at the time of the award, kept for audit display.
  Long seasonId;
  Long courseId; // Nullable for historical unscoped ledger entries.
  String sourceType;
  Long sourceId;
  double points;
  String reason;
  Long createdBy;
  @PreUpdate @PreRemove void immutable() { throw new IllegalStateException("Sổ cái chỉ được thêm"); }
}
@Entity @Table(name="cf_quiz_link")
class QuizLink extends BaseEntity {
  @ManyToOne Course course;
  String title;
  @Column(length=4000) String url;
  @Column(length=20000) String description="";
  Instant opensAt;
  Instant dueAt;
  String difficulty="easy";
  double maxScore;
}
@Entity @Table(name="cf_quiz_result", uniqueConstraints=@UniqueConstraint(columnNames={"quiz_id","student_id"}))
class QuizResult extends BaseEntity {
  @ManyToOne QuizLink quiz;
  @ManyToOne User student;
  String status="pending";
  Double score;
}

@Entity @Table(name="cf_rank_activity", uniqueConstraints=@UniqueConstraint(columnNames={"studentId","courseId","seasonId","weekStart"}))
class RankActivity extends BaseEntity {
  Long studentId;
  Long courseId;
  Long seasonId;
  LocalDate weekStart;
  @PreUpdate @PreRemove void immutable() { throw new IllegalStateException("Activity history is immutable"); }
}
