package com.codemark.lms;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Idempotently refresh stored rank notices, preserving manually published announcements. */
@Component @Order(2)
class AnnouncementCleanup implements ApplicationRunner {
  private final Store store;
  AnnouncementCleanup(Store store) { this.store=store; }

  @Override @Transactional public void run(ApplicationArguments args) {
    for(HomeAnnouncement item:store.list(HomeAnnouncement.class,"where e.authorRole='system'")) {
      String body=RankAnnouncementText.normalizeBody(item.body);
      if(body.isBlank()) store.delete(item);
      else {
        item.body=body;
        item.title=RankAnnouncementText.title(item.title);
      }
    }
  }
}
