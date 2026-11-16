package com.codemark.lms;

import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service @Transactional
class RankService {
  final Store store;
  RankService(Store s) { store=s; }
  Season active() { return store.list(Season.class,"where e.active=true").stream().findFirst().orElse(null); }

  static String entryRole(PointEntry entry) { return Objects.toString(entry.recipientRole,"student"); }

  void awardAction(User recipient,Course course,String action,long sourceId,User actor,Instant when) {
    var rule=ProgressRules.get(action);
    Api.require(rule.role().equals(recipient.role),"invalid_recipient_role",400);
    if(action.equals("daily_login")) {
      Api.require(course==null,"invalid_progress_scope",400);
      sourceId=when.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate().toEpochDay();
    } else {
      Api.require(course!=null,"invalid_progress_scope",400);
      if(action.equals("attendance")) sourceId=when.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate().toEpochDay();
    }
    String group=action.equals("teacher_advanced_material")?"teacher_material":action;
    awardMaximum(recipient,course,group,sourceId,rule.points(),rule.label(),actor,when,false);
  }

  void awardSubmission(Attempt attempt,User actor,Instant when) {
    if(!"student".equals(attempt.student.role) || attempt.submittedAt==null || attempt.maxScore<=0) return;
    Assessment a=attempt.assessment;
    int points=0;String label="";
    if("quiz".equals(a.kind)) {points=4;label="Tham gia Quiz";}
    else if(a.closesAt!=null && !attempt.submittedAt.isAfter(a.closesAt)) {
      boolean early=!attempt.submittedAt.isAfter(a.closesAt.minusSeconds(86400));
      points=early?5:4;label=early?"Nộp bài sớm ít nhất 24 giờ":"Nộp bài đúng hạn";
    }
    if(Set.of("exam","code","practice","assignment","project").contains(a.kind) && attempt.score!=null && attempt.score>=attempt.maxScore) {
      points=7;label="Điểm tuyệt đối bài thi hoặc đồ án";
    }
    if(points>0) awardMaximum(attempt.student,a.course,"student_submission",a.id,points,label,actor,when,true);
  }

  private void awardMaximum(User recipient,Course course,String type,long sourceId,int maximum,String reason,User actor,Instant when,boolean includeLegacy) {
    store.lock(store.all(RankPolicy.class).get(0));
    Season season=active();
    if(season==null || when.isBefore(season.startsAt) || when.isAfter(season.endsAt)) return;
    store.lock(season);
    if(course!=null) {
      boolean member=!store.list(Enrollment.class,"where e.course=?1 and e.user=?2 and e.courseRole=?3",course,recipient,recipient.role).isEmpty();
      Api.require(member || recipient.role.equals("teacher") && course.owner.id.equals(recipient.id),"student_not_enrolled",400);
    }
    if(type.equals("teacher_grading") && store.list(PointEntry.class,"where e.seasonId=?1 and e.sourceType='teacher_grading' and e.sourceId=?2",season.id,sourceId).stream().anyMatch(e->Objects.equals(scope(e),course==null?null:course.id))) return;
    Long courseId=course==null?null:course.id;
    double previous=store.list(PointEntry.class,"where e.studentId=?1 and e.seasonId=?2 and e.sourceId=?3",recipient.id,season.id,sourceId).stream()
        .filter(e->entryRole(e).equals(recipient.role) && Objects.equals(scope(e),courseId))
        .filter(e->e.sourceType.equals(type) || includeLegacy && Set.of("assessment","exam","assignment").contains(e.sourceType)
            || type.equals("quiz_participation") && e.sourceType.equals("quiz_link"))
        .mapToDouble(e->e.points).sum();
    if(maximum>previous) append(recipient,season,course,type,sourceId,maximum-previous,reason,actor);
  }

  List<Map<String,Object>> teacherBoard(User actor,Long courseId) {
    var members=new HashSet<Long>();
    if(courseId!=null) {
      Course course=store.get(Course.class,courseId);if(course.owner!=null) members.add(course.owner.id);
      store.list(Enrollment.class,"where e.course.id=?1 and e.courseRole='teacher'",courseId).forEach(e->members.add(e.user.id));
    }
    return roleBoard(actor,"teacher",courseId,courseId==null?null:members);
  }

  private List<Map<String,Object>> roleBoard(User actor,String role,Long courseId,Set<Long> members) {
    Season season=active();var totals=new HashMap<Long,Double>();
    if(season!=null) for(PointEntry e:store.list(PointEntry.class,"where e.seasonId=?1",season.id)) {
      if(!entryRole(e).equals(role)) continue;
      Long scope=scope(e);
      if(courseId!=null && !Objects.equals(scope,courseId)) continue;
      // Superseded unscoped demo balances remain in the audit ledger, not in new totals.
      if(role.equals("student") && scope==null && !e.sourceType.equals("daily_login")) continue;
      totals.merge(e.studentId,e.points,Double::sum);
    }
    var users=new ArrayList<>(store.list(User.class,"where e.role=?1",role).stream().filter(u->members==null || members.contains(u.id)).toList());
    users.sort(Comparator.<User>comparingDouble(u->totals.getOrDefault(u.id,0.0)).reversed().thenComparing(u->u.id));
    var rows=new ArrayList<Map<String,Object>>();int position=0;
    for(User u:users) {
      int place=++position;double points=Math.round(totals.getOrDefault(u.id,0.0)*100)/100.0;
      var row=Api.map("userId",u.id,"studentId",Objects.toString(u.studentId,"Chờ cấp mã"),"name",u.name,"role",role,"points",points,"position",place,"tier",tierAt(place),"mine",u.id.equals(actor.id));
      var pref=preference(u,false);
      row.put("frame",pref!=null && frameAllowed(pref.frame,place,points)?pref.frame:"default");
      row.put("theme",pref!=null && themeAllowed(pref.theme,place,points)?pref.theme:"default");
      row.put("badge",place==1 && points>0?(role.equals("teacher")?"Người truyền lửa":"Chiến thần Deadline"):place<=3 && points>0?"Tinh anh học viện":null);
      rows.add(row);
    }
    return rows;
  }

  RewardPreference preference(User user,boolean create) {
    var existing=store.list(RewardPreference.class,"where e.userId=?1",user.id).stream().findFirst().orElse(null);
    if(existing==null && create) {existing=new RewardPreference();existing.userId=user.id;store.save(existing);}
    return existing;
  }
  static boolean frameAllowed(String value,int position,double points) {
    return "default".equals(value) || points>0 && ("laurel".equals(value) && position<=3 || "champion".equals(value) && position==1);
  }
  static boolean themeAllowed(String value,int position,double points) {
    return "default".equals(value) || points>0 && ("twilight".equals(value) && position<=3 || "gold".equals(value) && position==1);
  }

  Map<String,Object> profile(User user) {
    String role=user.role.equals("teacher")?"teacher":"student";
    var mine=roleBoard(user,role,null,null).stream().filter(r->Boolean.TRUE.equals(r.get("mine"))).findFirst().orElse(null);
    int position=mine==null?Integer.MAX_VALUE:((Number)mine.get("position")).intValue();
    double points=mine==null?0:((Number)mine.get("points")).doubleValue();
    double global=0;Season season=active();
    if(season!=null) global=store.list(PointEntry.class,"where e.studentId=?1 and e.seasonId=?2 and e.sourceType='daily_login'",user.id,season.id).stream().filter(e->entryRole(e).equals(role)).mapToDouble(e->e.points).sum();
    var badges=new ArrayList<Map<String,Object>>();var frames=new ArrayList<Map<String,Object>>();var themes=new ArrayList<Map<String,Object>>();
    frames.add(Api.map("id","default","title","Mặc định"));themes.add(Api.map("id","default","title","Mặc định"));
    if(points>0) badges.add(Api.map("id","first_steps","title","Bước chân tiên phong","description","Đã bắt đầu tích lũy "+(role.equals("teacher")?"Reputation":"EXP")));
    if(points>0 && position<=3) {
      badges.add(Api.map("id","elite","title","Tinh anh học viện","description","Đứng trong Top 3 mùa hiện tại"));
      frames.add(Api.map("id","laurel","title","Vòng nguyệt quế"));themes.add(Api.map("id","twilight","title","Hoàng hôn huyền thoại"));
    }
    if(points>0 && position==1) {
      badges.add(Api.map("id","champion","title",role.equals("teacher")?"Người truyền lửa":"Chiến thần Deadline","description","Dẫn đầu bảng xếp hạng mùa hiện tại"));
      frames.add(Api.map("id","champion","title","Khung nhà vô địch"));themes.add(Api.map("id","gold","title","Vinh quang hoàng kim"));
    }
    RewardPreference pref=preference(user,false);
    return Api.map("role",user.role,"season",season==null?null:season.name,"totalPoints",points,"globalPoints",global,
        "position",mine==null?null:position,"tier",mine==null?null:mine.get("tier"),"badges",badges,"unlocks",Api.map("frames",frames,"themes",themes),
        "selectedFrame",pref!=null && frameAllowed(pref.frame,position,points)?pref.frame:"default",
        "selectedTheme",pref!=null && themeAllowed(pref.theme,position,points)?pref.theme:"default");
  }
  static int reward(String difficulty) {
    return switch(Objects.toString(difficulty,"easy")) {
      case "easy" -> 2; case "medium" -> 3; case "hard" -> 4; case "expert" -> 5;
      default -> throw new Api.Failure("invalid_difficulty",400);
    };
  }
  static LocalDate week(Instant time) {
    return time.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
  }
  // The season lock serializes both deduplication and weekly activity checks.
  void complete(User student, Course course, String type, long source, String difficulty, double percent, User actor, Instant time) {
    if(!Double.isFinite(percent) || percent<50) return;
    int points=reward(difficulty);
    store.lock(store.all(RankPolicy.class).get(0));
    Season season=active();
    if(season==null || time.isBefore(season.startsAt) || time.isAfter(season.endsAt)) return;
    store.lock(season);
    Api.require(!store.list(Enrollment.class,"where e.course=?1 and e.user=?2 and e.courseRole='student'",course,student).isEmpty(),"student_not_enrolled",400);
    String canonical=Set.of("exam","assignment").contains(type)?"assessment":type;
    if(store.list(PointEntry.class,"where e.studentId=?1 and e.seasonId=?2 and e.sourceId=?3",student.id,season.id,source).stream().anyMatch(e->Objects.equals(scope(e),course.id) && (e.sourceType.equals(canonical) || canonical.equals("assessment") && Set.of("exam","assignment").contains(e.sourceType)))) return;
    append(student,season,course,canonical,source,points,"Completed assessment: "+Objects.toString(difficulty,"easy"),actor);
    LocalDate monday=week(time);
    var activity=store.list(RankActivity.class,"where e.studentId=?1 and e.courseId=?2 and e.seasonId=?3",student.id,course.id,season.id);
    if(activity.stream().noneMatch(a->a.weekStart.equals(monday))) {
      RankActivity a=new RankActivity(); a.studentId=student.id; a.courseId=course.id; a.seasonId=season.id; a.weekStart=monday; store.save(a);
      if(activity.stream().anyMatch(old->old.weekStart.equals(monday.minusWeeks(1))))
        append(student,season,course,"diligence",monday.toEpochDay(),2,"Consecutive active week",actor);
    }
  }
  void append(User student, Season season, Course course, String type, long source, double points, String reason, User actor) {
    Api.require(Set.of("student","teacher").contains(student.role) && Double.isFinite(points) && Math.abs(points)<=1000000 && reason!=null && !reason.isBlank() && reason.length()<=255,"invalid_points",400);
    store.lock(season);
    var before=course!=null && student.role.equals("student")?board(actor,course.id):List.<Map<String,Object>>of();
    PointEntry e=new PointEntry(); e.studentId=student.id; e.seasonId=season.id; e.courseId=course==null?null:course.id; e.recipientRole=student.role; e.sourceType=type; e.sourceId=source;
    e.studentCode=student.studentId; e.points=points; e.reason=reason; e.createdBy=actor.id; store.save(e);
    if(course!=null && student.role.equals("student")) announceCourseChanges(before,board(actor,course.id),course,actor);
  }
  Long scope(PointEntry e) {
    if(e.courseId!=null) return e.courseId;
    if(Set.of("assessment","assignment","exam").contains(e.sourceType)) {
      var rows=store.list(Assessment.class,"where e.id=?1",e.sourceId);
      return rows.isEmpty()?null:rows.get(0).course.id;
    }
    if("quiz_link".equals(e.sourceType)) {
      var rows=store.list(QuizLink.class,"where e.id=?1",e.sourceId);
      return rows.isEmpty()?null:rows.get(0).course.id;
    }
    return null;
  }
  static String tierAt(int position) {
    if(position==1) return "Master"; if(position==2) return "Ruby"; if(position==3) return "Diamond";
    if(position<=5) return "Gold"; if(position<=10) return "Silver"; return "Bronze";
  }
  List<Course> visibleCourses(User actor) {
    Set<Long> enrolled=new HashSet<>();
    for(Enrollment e:store.list(Enrollment.class,"where e.user=?1",actor)) enrolled.add(e.course.id);
    return store.all(Course.class).stream().filter(c->c.published || actor.role.equals("admin") || Objects.equals(c.owner.id,actor.id) || enrolled.contains(c.id)).toList();
  }
  Course visibleCourse(User actor,long id) {
    return visibleCourses(actor).stream().filter(c->c.id.equals(id)).findFirst().orElseThrow(()->new Api.Failure("forbidden",403));
  }
  void announceChanges(List<Map<String,Object>> before,User actor) {
    for(Course c:store.all(Course.class)) announceCourseChanges(before.stream().filter(r->Objects.equals(r.get("courseId"),c.id)).toList(),board(actor,c.id),c,actor);
  }
  private void announceCourseChanges(List<Map<String,Object>> before,List<Map<String,Object>> after,Course course,User actor) {
    // The home feed is public; private class membership must not leak there.
    if(!course.published) return;
    var old=new HashMap<Object,Object>(); for(var row:before) old.put(row.get("userId"),row.get("tier"));
    StringBuilder body=new StringBuilder();
    for(var row:after) {
      Object previous=old.get(row.get("userId"));
      if(Objects.equals(previous,row.get("tier")) || !RankAnnouncementText.eligible(row.get("tier").toString())) continue;
      String line=RankAnnouncementText.message(row.get("name").toString(),Objects.toString(previous,"Unranked"),
          row.get("tier").toString(),((Number)row.get("position")).intValue(),row.get("points"));
      if(body.length()+line.length()+1>10000) { publish(body.toString(),course,actor); body.setLength(0); }
      if(!body.isEmpty()) body.append('\n'); body.append(line);
    }
    if(!body.isEmpty()) publish(body.toString(),course,actor);
  }
  private void publish(String body,Course course,User actor) {
    HomeAnnouncement item=new HomeAnnouncement(); item.authorId=actor.id; item.authorName="CodeMark"; item.authorRole="system";
    item.title=RankAnnouncementText.title(" · "+course.code+" · "+course.title); item.body=body; store.save(item);
  }
  // Null is an internal per-class snapshot for administrative roster/season changes, never a global ranking.
  List<Map<String,Object>> board(User actor,Long courseId) {
    if(courseId==null) { var result=new ArrayList<Map<String,Object>>(); for(Course c:store.all(Course.class)) result.addAll(board(actor,c.id)); return result; }
    Season season=active(); var totals=new HashMap<Long,Double>();
    if(season!=null) for(PointEntry e:store.list(PointEntry.class,"where e.seasonId=?1",season.id)) if(entryRole(e).equals("student") && Objects.equals(scope(e),courseId)) totals.merge(e.studentId,e.points,Double::sum);
    var students=store.list(Enrollment.class,"where e.course.id=?1 and e.courseRole='student'",courseId).stream().map(e->e.user).filter(u->u.role.equals("student")).distinct().collect(java.util.stream.Collectors.toCollection(ArrayList::new));
    students.sort(Comparator.<User>comparingDouble(u->totals.getOrDefault(u.id,0.0)).reversed().thenComparing(u->u.id));
    var rows=new ArrayList<Map<String,Object>>(); int position=0;
    for(User u:students) {
      int place=++position;double points=Math.round(totals.getOrDefault(u.id,0.0)*100.0)/100.0;
      RewardPreference pref=preference(u,false);
      rows.add(Api.map("courseId",courseId,"userId",u.id,"studentId",Objects.toString(u.studentId,"Pending"),"name",u.name,"role","student",
          "points",points,"tier",tierAt(place),"position",place,"mine",u.id.equals(actor.id),
          "frame",pref!=null && frameAllowed(pref.frame,place,points)?pref.frame:"default",
          "theme",pref!=null && themeAllowed(pref.theme,place,points)?pref.theme:"default",
          "badge",points>0 && place==1?"Chiến thần Deadline":points>0 && place<=3?"Tinh anh học viện":null));
    }
    return rows;
  }
}
