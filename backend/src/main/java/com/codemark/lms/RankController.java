package com.codemark.lms;

import static com.codemark.lms.Api.*;
import jakarta.servlet.http.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

@RestController @RequestMapping("/api/rank") @Transactional
class RankController {
  final Store store; final Access access; final RankService rank;
  RankController(Store s,Access a,RankService p) { store=s; access=a; rank=p; }
  @GetMapping("/leaderboard") Object board(HttpServletRequest r,@RequestParam(required=false) Long courseId,@RequestParam(defaultValue="student") String role,@RequestParam(defaultValue="") String q,@RequestParam(defaultValue="0") int offset,@RequestParam(defaultValue="10") int limit) {
    User actor=access.current(r);
    require(Set.of("student","teacher").contains(role),"invalid_role",400);
    Season current=rank.active();
    if(role.equals("teacher")) {
      if(courseId!=null) rank.visibleCourse(actor,courseId);
      var all=rank.teacherBoard(actor,courseId);
      String query=q.toLowerCase(Locale.ROOT);
      var filtered=all.stream().filter(row->(row.get("name")+" "+row.get("studentId")).toLowerCase(Locale.ROOT).contains(query)).toList();
      var courses=rank.visibleCourses(actor).stream().map(c->map("id",c.id,"code",c.code,"title",c.title)).toList();
      return map("role","teacher","season",current==null?null:current.name,"total",filtered.size(),"rows",filtered.stream().skip(Math.max(0,offset)).limit(Math.max(1,Math.min(100,limit))).toList(),
          "mine",all.stream().filter(e->Boolean.TRUE.equals(e.get("mine"))).findFirst().orElse(null),"courses",courses);
    }
    if(courseId==null) {
      var courses=new ArrayList<Map<String,Object>>(); var students=new HashSet<Object>();
      for(Course c:rank.visibleCourses(actor)) {
        var rows=rank.board(actor,c.id); rows.forEach(row->students.add(row.get("userId")));
        courses.add(map("id",c.id,"courseId",c.id,"code",c.code,"title",c.title,"total",rows.size(),"rows",rows.stream().limit(5).toList()));
      }
      return map("season",current==null?null:current.name,"total",students.size(),"rows",List.of(),"mine",null,"courses",courses,"groups",courses);
    }
    rank.visibleCourse(actor,courseId);
    var all=rank.board(actor,courseId);
    var filtered=all.stream().filter(e->(e.get("name")+" "+e.get("studentId")).toLowerCase().contains(q.toLowerCase())).toList();
    Season season=rank.active();
    return map("season",season==null?null:season.name,"total",filtered.size(),"rows",filtered.stream().skip(Math.max(0,offset)).limit(Math.max(1,Math.min(100,limit))).toList(),"mine",all.stream().filter(e->Boolean.TRUE.equals(e.get("mine"))).findFirst().orElse(null));
  }
  @GetMapping("/config") Object config(HttpServletRequest r) {
    access.admin(r);
    return map("seasons",store.all(Season.class).stream().map(s->map("id",s.id,"name",s.name,"startsAt",s.startsAt,"endsAt",s.endsAt,"active",s.active)).toList(),"tiers",store.list(RankTier.class,"order by e.threshold").stream().map(t->map("name",t.name,"threshold",t.threshold)).toList(),"maskCodes",store.all(RankPolicy.class).get(0).maskCodes);
  }
  @PutMapping("/policy") Object policy(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    access.admin(r); RankPolicy policy=store.all(RankPolicy.class).get(0); store.lock(policy);
    policy.maskCodes=bool(b,"maskCodes",policy.maskCodes); return map("ok",true);
  }
  @PostMapping("/seasons") Object season(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    User actor=access.admin(r); store.lock(store.all(RankPolicy.class).get(0));
    var before=rank.board(actor,null);
    Season s=new Season(); s.name=required(b,"name"); s.startsAt=instant(b,"startsAt",null); s.endsAt=instant(b,"endsAt",null);
    require(s.startsAt!=null && s.endsAt!=null && s.startsAt.isBefore(s.endsAt),"invalid_dates",400);
    s.active=bool(b,"active",true); if(s.active) for(Season old:store.all(Season.class)) old.active=false;
    store.save(s); rank.announceChanges(before,actor); access.audit(actor,"season_created",r.getRemoteAddr(),"seasonId",s.id); return map("id",s.id);
  }
  @PostMapping("/seasons/{id}/activate") Object activate(HttpServletRequest r,@PathVariable long id) {
    User actor=access.admin(r); store.lock(store.all(RankPolicy.class).get(0));
    var before=rank.board(actor,null);
    Season selected=store.get(Season.class,id);
    for(Season s:store.all(Season.class)) s.active=s.id.equals(selected.id);
    rank.announceChanges(before,actor);
    return map("ok",true);
  }
  @PutMapping("/tiers") Object tiers(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    User actor=access.admin(r); RankPolicy policy=store.all(RankPolicy.class).get(0); store.lock(policy);
    require(b.get("tiers") instanceof List<?>,"invalid_tiers",400);
    List<?> rows=(List<?>)b.get("tiers"); require(!rows.isEmpty() && rows.size()<=30,"invalid_tiers",400);
    double previous=-1; Set<String> names=new HashSet<>(); var created=new ArrayList<RankTier>();
    for(Object row:rows) {
      Map<?,?> m=(Map<?,?>)row; RankTier t=new RankTier(); t.name=Objects.toString(m.get("name"),"").trim(); t.threshold=Double.parseDouble(Objects.toString(m.get("threshold")));
      require(!t.name.isBlank() && t.name.length()<=60 && names.add(t.name) && Double.isFinite(t.threshold) && t.threshold>=0 && t.threshold>previous && (previous!=-1 || t.threshold==0),"invalid_tiers",400);
      previous=t.threshold; created.add(t);
    }
    store.all(RankTier.class).forEach(store::delete); created.forEach(store::save);
    policy.maskCodes=bool(b,"maskCodes",policy.maskCodes); access.audit(actor,"tiers_changed",r.getRemoteAddr()); return map("ok",true);
  }
  @GetMapping("/ledger") Object ledger(HttpServletRequest r,@RequestParam(defaultValue="0") int offset,@RequestParam(required=false) Long seasonId) {
    access.admin(r); var rows=store.list(PointEntry.class,"order by e.id desc").stream().filter(e->seasonId==null || e.seasonId.equals(seasonId)).toList();
    return map("total",rows.size(),"entries",rows.stream().skip(Math.max(0,offset)).limit(100).map(e->map("id",e.id,"studentId",e.studentCode,"userId",e.studentId,"recipientRole",RankService.entryRole(e),"seasonId",e.seasonId,"courseId",e.courseId,"sourceType",e.sourceType,"sourceId",e.sourceId,"points",e.points,"reason",e.reason,"createdAt",e.createdAt,"createdBy",e.createdBy)).toList());
  }
  @PostMapping("/adjustments") Object adjust(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    User actor=access.current(r); require(actor.role.equals("admin")||actor.role.equals("teacher"),"forbidden",403);
    store.lock(store.all(RankPolicy.class).get(0));
    User student=store.list(User.class,"where e.studentId=?1",required(b,"studentId")).stream().findFirst().orElseThrow(()->new Failure("not_found",404));
    Course c=access.course(actor,Long.parseLong(required(b,"courseId")),true);
    require(!store.list(Enrollment.class,"where e.course=?1 and e.user=?2 and e.courseRole='student'",c,student).isEmpty(),"student_not_enrolled",400);
    Season season=rank.active(); require(season!=null,"no_active_season",409); store.lock(season);
    rank.append(student,season,c,"manual",0,Double.parseDouble(required(b,"points")),required(b,"reason"),actor);
    return map("ok",true);
  }
}
