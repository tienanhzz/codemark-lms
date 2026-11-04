package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_announcement")
class Announcement extends BaseEntity {
  protected Announcement() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  @ManyToOne(fetch = FetchType.EAGER)
  User author;

  String title;

  @Column(length = 100000)
  String body = "";
}
