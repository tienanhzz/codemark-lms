package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "cf_question")
class Question extends BaseEntity {
  protected Question() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Assessment assessment;

  @Column(length = 100000)
  String prompt;

  String kind = "mcq";
  String language;

  @JdbcTypeCode(SqlTypes.JSON)
  List<String> options = new ArrayList<>();

  @JdbcTypeCode(SqlTypes.JSON)
  List<String> tagIds = new ArrayList<>();

  @Column(length = 100000)
  String answer;

  double points = 1;
  int position;

  @PostLoad void normalizeTags() { if (tagIds == null) tagIds = new ArrayList<>(); }
}
