package com.codemark.lms;

import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Explicit demo data only: never runs during ordinary application startup. */
@Service
class RankDemoSeed {
  private final Store store;
  private final Access access;
  private final RankService rank;
  RankDemoSeed(Store store, Access access, RankService rank) {
    this.store=store; this.access=access; this.rank=rank;
  }

  @Transactional
  public void seed() {
    store.lock(store.all(RankPolicy.class).get(0));
    User admin=store.list(User.class,"where e.role='admin'").get(0);
    Season season=rank.active();
    if(season==null) {
      season=new Season(); season.name="CodeMark EXP"; season.active=true;
      season.startsAt=Instant.now().minusSeconds(60); season.endsAt=Instant.now().plusSeconds(365L*86400);
      store.save(season);
    }
    store.lock(season);
    var before=rank.board(admin,null);
    String[] names={"Nguyễn Minh Anh","Trần Quốc Bảo","Lê Hoàng Phúc","Phạm Ngọc Linh","Hoàng Đức Huy",
      "Vũ Thu Hà","Đặng Tuấn Kiệt","Bùi Khánh Vy","Đỗ Gia Hưng","Hồ Thảo Nguyên",
      "Ngô Quang Minh","Dương Hải Yến","Lý Thành Đạt","Đinh Bảo Ngọc","Mai Nhật Nam",
      "Trịnh Phương Anh","Võ Đức Anh","Phan Thanh Tâm","Cao Minh Khang","Tạ Yến Nhi",
      "Lâm Quốc Khánh","Đoàn Hà My","Đào Anh Tuấn","Hà Ngọc Mai","Nguyễn Tiến Dũng"};
    var courses=store.list(Course.class,"where e.published=true order by e.id");
    if(courses.isEmpty()) {
      Course c=new Course(); c.code="DEMO-EXP"; c.title="CodeMark Demo"; c.owner=admin; c.term="Demo"; c.published=true; store.save(c); courses=java.util.List.of(c);
    }
    String hash=access.hash("CodeMark@2026!");
    for(int i=0;i<names.length;i++) {
      String code=String.valueOf(2026900001L+i);
      User u=store.list(User.class,"where e.studentId=?1",code).stream().findFirst().orElse(null);
      if(u==null) {
        u=new User(); u.studentId=code; u.name=names[i]; u.role="student";
        u.passwordHash=hash; u.mustChangePassword=true; store.save(u);
      }
      Api.require(u.role.equals("student"),"demo_code_conflict",409);
      for(Course course:courses) {
        if(store.list(Enrollment.class,"where e.course=?1 and e.user=?2",course,u).isEmpty()) {
          Enrollment member=new Enrollment(); member.course=course; member.user=u; member.courseRole="student"; store.save(member);
        }
        double previous=store.list(PointEntry.class,"where e.studentId=?1 and e.seasonId=?2 and e.courseId=?3 and e.sourceType in ('demo','demo_rebalance')",u.id,season.id,course.id).stream().mapToDouble(e->e.points).sum();
        double target=samplePoints(i,course.id);
        if(target!=previous) {
          PointEntry e=new PointEntry(); e.studentId=u.id; e.studentCode=u.studentId; e.seasonId=season.id; e.courseId=course.id;
          e.sourceType="demo_rebalance"; e.sourceId=0L; e.points=target-previous; e.reason="Điều chỉnh EXP mẫu riêng theo lớp"; e.createdBy=admin.id; store.save(e);
        }
      }
    }
    seedTeachers(admin,season,hash,courses);
    rank.announceChanges(before,admin);
  }

  /** Adds only the demo teachers and their Reputation, leaving every other record untouched. */
  @Transactional
  public void seedTeachersOnly() {
    store.lock(store.all(RankPolicy.class).get(0));
    User admin=store.list(User.class,"where e.role='admin'").get(0);
    Season season=rank.active();
    if(season==null) {
      season=new Season(); season.name="CodeMark EXP"; season.active=true;
      season.startsAt=Instant.now().minusSeconds(60); season.endsAt=Instant.now().plusSeconds(365L*86400);
      store.save(season);
    }
    store.lock(season);
    var courses=store.list(Course.class,"where e.published=true order by e.id");
    if(courses.isEmpty()) {
      Course c=new Course(); c.code="DEMO-EXP"; c.title="CodeMark Demo"; c.owner=admin; c.term="Demo"; c.published=true; store.save(c); courses=java.util.List.of(c);
    }
    seedTeachers(admin,season,access.hash("CodeMark@2026!"),courses);
  }

  private void seedTeachers(User admin,Season season,String hash,List<Course> courses) {
    // Four distinct demo teachers per class, each with a stable random name and 0–130 Reputation.
    var usedNames=new HashSet<String>();
    for(Course course:courses) {
      for(int i=0;i<4;i++) {
        String code=String.valueOf(1006900000L+course.id*10+i);
        User teacher=store.list(User.class,"where e.studentId=?1",code).stream().findFirst().orElse(null);
        String name=teacherName(course.id,i,usedNames);
        if(teacher==null) {
          teacher=new User();teacher.studentId=code;teacher.name=name;teacher.role="teacher";
          teacher.passwordHash=hash;teacher.mustChangePassword=true;store.save(teacher);
        } else {
          Api.require(teacher.role.equals("teacher"),"demo_code_conflict",409);
          teacher.name=name;
        }
        if(store.list(Enrollment.class,"where e.course=?1 and e.user=?2",course,teacher).isEmpty()) {
          Enrollment membership=new Enrollment();membership.course=course;membership.user=teacher;membership.courseRole="teacher";store.save(membership);
        }
        double target=teacherPoints(course.id,i);
        double previous=store.list(PointEntry.class,"where e.studentId=?1 and e.seasonId=?2 and e.courseId=?3 and e.sourceType='teacher_demo'",teacher.id,season.id,course.id).stream().mapToDouble(e->e.points).sum();
        if(previous!=target) {
          PointEntry entry=new PointEntry();entry.studentId=teacher.id;entry.studentCode=teacher.studentId;entry.recipientRole="teacher";
          entry.courseId=course.id;entry.seasonId=season.id;entry.sourceType="teacher_demo";entry.sourceId=0L;
          entry.points=target-previous;entry.reason="Reputation mẫu giảng viên; không phải điểm hoạt động thật";entry.createdBy=admin.id;store.save(entry);
        }
      }
    }
  }

  private static final String[] FAMILY={"Nguyễn","Trần","Lê","Phạm","Hoàng","Vũ","Đặng","Bùi","Đỗ","Hồ","Ngô","Dương",
      "Lý","Đinh","Mai","Trịnh","Võ","Phan","Cao","Tạ","Lâm","Đoàn","Đào","Hà"};
  private static final String[] MIDDLE={"Văn","Thị","Minh","Quốc","Ngọc","Thanh","Hữu","Đức","Thu","Hoàng","Gia","Bảo",
      "Khánh","Hải","Tuấn","Phương","Thành","Nhật","Yến","Anh"};
  private static final String[] GIVEN={"An","Bình","Châu","Dũng","Giang","Hà","Hải","Hiếu","Hoa","Hùng","Hương","Khoa",
      "Lan","Linh","Long","Mai","Nam","Nga","Nhung","Phúc","Quân","Sơn","Tâm","Thảo","Thắng","Trang","Trung","Tùng","Vân","Vy"};

  private static String teacherName(long courseId,int index,Set<String> used) {
    Random random=new Random(courseId*1009L+index*97L+20261110L);
    for(int attempt=0;attempt<30;attempt++) {
      String name=FAMILY[random.nextInt(FAMILY.length)]+" "+MIDDLE[random.nextInt(MIDDLE.length)]+" "+GIVEN[random.nextInt(GIVEN.length)];
      if(used.add(name)) return name;
    }
    String fallback="Giảng viên "+courseId+"-"+index;
    used.add(fallback); return fallback;
  }

  private static int teacherPoints(long courseId,int index) {
    int[] base={130,90,45,0};
    int jitter=Math.floorMod(courseId*11+index*5,9);
    return Math.max(0,Math.min(130,base[index]+jitter));
  }

  private static double samplePoints(int studentIndex,long courseId) {
    // A stable class-specific order and range avoids cloning the same board across classes.
    // Only the demo subtotal is rebalanced; earned and manually awarded EXP are untouched.
    long key=courseId-1;
    int rotation=(int)Math.floorMod(key*7,25);
    int minimum=(int)Math.floorMod(key*3,13);
    int maximum=150-(int)Math.floorMod(key*11,29);
    int position=Math.floorMod(studentIndex+rotation,25);
    return Math.round(minimum+(maximum-minimum)*(24-position)/24.0);
  }
}
