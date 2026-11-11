package com.codemark.lms;

import jakarta.persistence.*;
import java.time.Instant;

@Entity @Table(name="cf_reward_preference",uniqueConstraints=@UniqueConstraint(columnNames="userId"))
class RewardPreference extends BaseEntity {
  Long userId;
  String frame="default";
  String theme="default";
}

@Entity @Table(name="cf_reward_request")
class RewardRequest extends BaseEntity {
  @ManyToOne User student;
  @ManyToOne Course course;
  @ManyToOne Assessment assessment;
  Long seasonId;
  @Column(length=2000) String requestText;
  String status="pending";
  @Column(length=2000) String decisionNote;
  Long reviewedBy;
  Instant reviewedAt;
}
