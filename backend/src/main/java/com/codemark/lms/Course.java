package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_course")
class Course extends BaseEntity {
  protected Course() {}

  @Column(unique = true)
  String code;

  String title;

  @Column(length = 100000)
  String description = "";

  @ManyToOne(fetch = FetchType.EAGER)
  User owner;

  String term;
  LocalDate startDate;
  LocalDate endDate;
  boolean published;
}
