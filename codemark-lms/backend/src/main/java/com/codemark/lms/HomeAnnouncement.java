package com.codemark.lms;

import jakarta.persistence.*;

/** Thông báo công khai, tách khỏi thông báo riêng trong lớp học. */
@Entity
@Table(name = "cf_home_announcement")
class HomeAnnouncement extends BaseEntity {
  // Giữ tên người đăng tại thời điểm đăng, kể cả khi tài khoản được xóa sau này.
  @Column(nullable = false) Long authorId;
  String authorName;
  String authorRole;
  @Column(nullable = false, length = 180) String title;
  @Column(nullable = false, length = 10000) String body;
}
