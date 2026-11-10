package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class AnnouncementTextTest {
  private String display(String body) {
    HomeAnnouncement item=new HomeAnnouncement(); item.authorRole="system"; item.body=body;
    return HomeController.displayBody(item);
  }

  @Test void legacyGoldIsCelebratedAndLowRanksAreRemoved() {
    String result=display("Nguyễn Minh Anh: Unranked ? Gold (#4).\nBảo: Gold → Silver (hạng #6).\nLinh: Silver → Bronze (#11).");
    assertTrue(result.contains("Xin chúc mừng chiến binh **Nguyễn Minh Anh** đã thăng chức hạng của mình lên **Gold**!"));
    assertTrue(result.contains("**#4**"));
    assertFalse(result.contains("Silver"));
    assertFalse(result.contains("Bronze"));
    assertFalse(result.contains("EXP"),"A legacy announcement has no historical EXP snapshot to invent");
    assertEquals(result,display(result));
  }

  @Test void previousFantasySilverAndBronzeAreRemovedButManualTextIsUntouched() {
    assertEquals("",display("Xin chúc mừng chiến binh **Bảo** đã thăng hạng lên **Silver**! Với **90 EXP**, bạn đang giữ vị trí **#6** trên chiến trường."));
    assertEquals("",display("Hỡi chiến binh **Linh**! Bậc hạng mới của bạn là **Bronze**! Với **4 EXP**, bạn đang giữ vị trí **#11** trên chiến trường."));
    HomeAnnouncement manual=new HomeAnnouncement(); manual.authorRole="teacher"; manual.body="Silver → Bronze";
    assertEquals(manual.body,HomeController.displayBody(manual));
  }

  @Test void goldDemotionIsARallyingCallRatherThanPromotion() {
    String result=display("Bảo: Diamond → Gold (#4).");
    assertTrue(result.contains("Hỡi chiến binh **Bảo**"));
    assertTrue(result.contains("**Gold**"));
    assertFalse(result.contains("thăng chức"));
  }
}
