package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_meeting")
class Meeting extends BaseEntity {
  protected Meeting() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  int weekday;
  LocalTime startTime;
  LocalTime endTime;
  String location = "";
}
