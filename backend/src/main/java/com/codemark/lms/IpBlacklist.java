package com.codemark.lms;

import jakarta.persistence.*;
import java.time.*;
import java.util.*;

@Entity
@Table(name = "cf_ipblacklist")
class IpBlacklist extends BaseEntity {
  protected IpBlacklist() {}

  @Column(unique = true)
  String network;

  @Column(length = 100000)
  String reason = "";
}
