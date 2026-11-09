package com.codemark.lms;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Transactional
class RankService {
  final Store store;
  RankService(Store s) { store=s; }
  Season active() {
    return store.list(Season.class,"where e.active=true").stream().findFirst().orElse(null);
  }
  // Lock one shared season before reading previous awards: concurrent submissions cannot double-award.
  void best(User student, String type, long source, double points, User actor) {
    store.lock(store.all(RankPolicy.class).get(0));
    Season season=store.locked(Season.class,"where e.active=true").stream().findFirst().orElse(null);
    Instant now=Instant.now();
    if(season==null || now.isBefore(season.startsAt) || now.isAfter(season.endsAt)) return;
    store.lock(season);
    var entries=store.locked(PointEntry.class,"where e.studentId=?1 and e.seasonId=?2 and e.sourceId=?3",student.id,season.id,source);
    double previous=entries.stream().filter(e->e.sourceType.equals(type) || (Set.of("exam","assignment").contains(type) && Set.of("exam","assignment").contains(e.sourceType))).mapToDouble(e->e.points).sum();
    if(points>previous) append(student,season,type,source,points-previous,"Kết quả tốt nhất đã xác nhận",actor);
  }
  void append(User student, Season season, String type, long source, double points, String reason, User actor) {
    Api.require(student.role.equals("student") && Double.isFinite(points) && Math.abs(points)<=1000000 && reason!=null && !reason.isBlank() && reason.length()<=255,"invalid_points",400);
    PointEntry e=new PointEntry(); e.studentId=student.id; e.seasonId=season.id; e.sourceType=type; e.sourceId=source;
    e.studentCode=student.studentId;
    e.points=points; e.reason=reason; e.createdBy=actor.id; store.save(e);
  }
  List<Map<String,Object>> board(User actor, Long courseId) {
    Season season=active();
    if(season==null) return List.of();
    var totals=new HashMap<Long,Double>();
    for(PointEntry e:store.list(PointEntry.class,"where e.seasonId=?1",season.id)) totals.merge(e.studentId,e.points,Double::sum);
    Set<Long> members=null;
    if(courseId!=null) {
      members=new HashSet<>();
      for(Enrollment e:store.list(Enrollment.class,"where e.course.id=?1 and e.courseRole='student'",courseId)) members.add(e.user.id);
    }
    var students=new ArrayList<User>();
    for(User u:store.list(User.class,"where e.role='student'")) if(members==null || members.contains(u.id)) students.add(u);
    students.sort(Comparator.<User>comparingDouble(u->totals.getOrDefault(u.id,0.0)).reversed().thenComparing(u->u.id));
    var tiers=store.list(RankTier.class,"order by e.threshold");
    boolean mask=store.all(RankPolicy.class).get(0).maskCodes;
    var rows=new ArrayList<Map<String,Object>>();
    int position=0;
    for(User u:students) {
      double points=totals.getOrDefault(u.id,0.0); String tier=tiers.isEmpty()?"":tiers.get(0).name;
      for(RankTier t:tiers) if(points>=t.threshold) tier=t.name;
      String code=Objects.toString(u.studentId,"Chờ gán mã");
      if(mask && code.matches("[0-9]{10}")) code=code.substring(0,4)+"***"+code.substring(7);
      rows.add(Api.map("userId",u.id,"studentId",code,"name",u.name,"points",Math.round(points*100.0)/100.0,"tier",tier,"position",++position,"mine",u.id.equals(actor.id)));
    }
    return rows;
  }
}
