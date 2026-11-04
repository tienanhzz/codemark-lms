package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_testcase")
class TestCase extends BaseEntity {
  protected TestCase() {}

  @ManyToOne(fetch = FetchType.EAGER)
  Question question;

  @Column(length = 100000)
  String input = "";

  @Column(length = 100000)
  String expectedOutput = "";

  boolean hidden;
  double points = 1;
  int timeLimitMs = 2000;
  int memoryMb = 256;
}
