package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "cf_lesson")
class Lesson extends BaseEntity {
  protected Lesson() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  String title;

  @Column(length = 100000)
  String content = "";

  @JdbcTypeCode(SqlTypes.JSON)
  List<String> tagIds = new ArrayList<>();

  int position;
  boolean published = true;
  @Column(nullable = false)
  @org.hibernate.annotations.ColumnDefault("false")
  boolean advancedMaterial;
  Long createdById;

  @PostLoad void normalizeTags() { if (tagIds == null) tagIds = new ArrayList<>(); }
}
