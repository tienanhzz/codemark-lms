package com.codemark.lms;

import java.time.*;
import org.springframework.boot.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
class RankBootstrap implements ApplicationRunner {
  private final Store store;
  private final Access access;
  RankBootstrap(Store s, Access a) { store=s; access=a; }
  @Transactional public void run(ApplicationArguments args) {
    if (store.all(RankPolicy.class).isEmpty()) store.save(new RankPolicy());
    if (store.all(RankTier.class).isEmpty()) {
      String[] names={"Iron","Bronze","Silver","Gold","Platinum","Emerald","Diamond","Master","Grandmaster","Challenger"};
      int[] thresholds={0,100,250,450,700,1000,1400,1900,2500,3200};
      for(int i=0;i<names.length;i++) { RankTier t=new RankTier(); t.name=names[i]; t.threshold=thresholds[i]; store.save(t); }
    }
    if(store.list(User.class,"where e.role='admin' and e.pendingCode=false").isEmpty()) {
      Api.require(store.list(User.class,"where e.studentId=?1","0000000000").isEmpty(),"admin_code_conflict",409);
      User u=new User(); u.studentId="0000000000"; u.name="Quản trị viên"; u.role="admin";
      u.passwordHash=access.hash("CodeMark@2026!"); u.mustChangePassword=true; store.save(u);
    }
  }
}
