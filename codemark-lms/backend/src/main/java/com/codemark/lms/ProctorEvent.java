package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "cf_proctorevent")
class ProctorEvent extends BaseEntity {
  protected ProctorEvent() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Attempt attempt;

  @ManyToOne(fetch = FetchType.EAGER)
  User user;

  String kind;

  @JdbcTypeCode(SqlTypes.JSON)
  Map<String, Object> detail = new LinkedHashMap<>();
}
