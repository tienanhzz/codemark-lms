package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_discussionpost")
class DiscussionPost extends BaseEntity {
  protected DiscussionPost() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Course course;

  @ManyToOne(fetch = FetchType.EAGER)
  User author;

  Long parentId;
  Long bestAnswerId;
  boolean bestAnswer;

  @Column(length = 100000)
  String body;
}
