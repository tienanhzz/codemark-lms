package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_leaverequest")
class LeaveRequest extends BaseEntity {
  protected LeaveRequest() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  @ManyToOne(fetch = FetchType.EAGER)
  User student;

  Long meetingId;

  @Column(length = 100000)
  String reason;

  String evidenceName;
  String evidencePath;
  String evidenceMime;
  long evidenceSize;
  String status = "pending";

  @ManyToOne(fetch = FetchType.EAGER)
  User decidedBy;

  Instant decidedAt;
  String decisionNote;
}
