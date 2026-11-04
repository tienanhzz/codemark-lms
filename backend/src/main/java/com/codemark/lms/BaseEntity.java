package com.codemark.lms;

import jakarta.persistence.*;
import java.time.Instant;

@MappedSuperclass
abstract class BaseEntity {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  Long id;

  @Version long version;
  Instant createdAt = Instant.now();

  public Long getId() {
    return id;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }
}
