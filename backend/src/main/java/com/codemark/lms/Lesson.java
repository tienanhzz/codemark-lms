package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_lesson")
class Lesson extends BaseEntity {
  protected Lesson() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  String title;

  @Column(length = 100000)
  String content = "";

  int position;
  boolean published = true;
}
