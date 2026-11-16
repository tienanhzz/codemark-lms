package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "cf_auditevent")
class AuditEvent extends BaseEntity {
  protected AuditEvent() {}

  Long actorId;
  String kind;

  @JdbcTypeCode(SqlTypes.JSON)
  Map<String, Object> detail = new LinkedHashMap<>();

  String ip;
}
