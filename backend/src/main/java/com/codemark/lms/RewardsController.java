package com.codemark.lms;

import static com.codemark.lms.Api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/rank") @Transactional
class RewardsController {
  private final Store store;
  private final Access access;
  private final RankService rank;
  RewardsController(Store store,Access access,RankService rank) {this.store=store;this.access=access;this.rank=rank;}

  @GetMapping("/profile") Object profile(HttpServletRequest r) {return rank.profile(access.current(r));}
  @GetMapping("/rules") Object rules(HttpServletRequest r) {
    access.current(r);
    return map("student",ProgressRules.list("student"),"teacher",ProgressRules.list("teacher"),
        "note","Mỗi hoạt động chỉ ghi một lần; nộp sớm/điểm tuyệt đối chỉ nâng đến mức cao nhất cho bài. Điểm đăng nhập ghi vào hồ sơ chung, không nhân sang các lớp. Không giới hạn tổng EXP/Reputation.");
  }
  @PutMapping("/cosmetics") Object cosmetics(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    User u=access.current(r);store.lock(u);
    require(Set.of("student","teacher").contains(u.role),"forbidden",403);
    var profile=rank.profile(u);int position=profile.get("position")==null?Integer.MAX_VALUE:((Number)profile.get("position")).intValue();
    double points=((Number)profile.get("totalPoints")).doubleValue();
    String frame=text(b,"frame",profile.get("selectedFrame").toString());String theme=text(b,"theme",profile.get("selectedTheme").toString());
    require(RankService.frameAllowed(frame,position,points) && RankService.themeAllowed(theme,position,points),"reward_locked",403);
    RewardPreference pref=rank.preference(u,true);pref.frame=frame;pref.theme=theme;
    return rank.profile(u);
  }

  @GetMapping("/redemptions") Object requests(HttpServletRequest r) {
    User actor=access.current(r);
    return map("requests",store.list(RewardRequest.class,"order by e.id desc").stream().filter(x->visible(actor,x)).map(this::view).toList(),
        "policyNote","Đề xuất đổi thưởng chờ phê duyệt theo quy định của trường. Phê duyệt không tự sửa điểm thi hay trừ EXP.");
  }
  @PostMapping("/redemptions") Object request(HttpServletRequest r,@RequestBody Map<String,Object> b) {
    User student=access.current(r);require(student.role.equals("student"),"forbidden",403);
    Course course=access.course(student,Long.parseLong(required(b,"courseId")),false);
    require("student".equals(access.role(student,course)),"forbidden",403);
    Season season=rank.active();require(season!=null,"no_active_season",409);store.lock(season);
    Assessment assessment=null;
    if(b.get("assessmentId")!=null && !b.get("assessmentId").toString().isBlank()) {
      assessment=store.get(Assessment.class,Long.parseLong(b.get("assessmentId").toString()));
      require(assessment.course.id.equals(course.id) && assessment.published,"invalid_assessment",400);
    }
    String text=required(b,"requestText");require(text.length()<=2000,"invalid_request",400);
    Assessment target=assessment;
    require(store.list(RewardRequest.class,"where e.student=?1 and e.course=?2 and e.seasonId=?3 and e.status='pending'",student,course,season.id).stream().noneMatch(x->Objects.equals(x.assessment==null?null:x.assessment.id,target==null?null:target.id)),"request_already_pending",409);
    RewardRequest item=new RewardRequest();item.student=student;item.course=course;item.assessment=assessment;item.seasonId=season.id;item.requestText=text;store.save(item);
    access.audit(student,"reward_requested",r.getRemoteAddr(),"requestId",item.id);return view(item);
  }
  @PostMapping("/redemptions/{id}/review") Object review(HttpServletRequest r,@PathVariable long id,@RequestBody Map<String,Object> b) {
    User actor=access.current(r);require(Set.of("admin","teacher").contains(actor.role),"forbidden",403);
    RewardRequest item=store.get(RewardRequest.class,id);access.course(actor,item.course.id,true);store.refreshLocked(item);
    require(item.status.equals("pending"),"already_reviewed",409);
    String status=required(b,"status"),note=required(b,"decisionNote");
    require(Set.of("approved","rejected").contains(status) && note.length()<=2000,"invalid_request",400);
    item.status=status;item.decisionNote=note;item.reviewedAt=Instant.now();item.reviewedBy=actor.id;
    access.audit(actor,"reward_reviewed",r.getRemoteAddr(),"requestId",id,"status",status);return view(item);
  }
  private boolean visible(User actor,RewardRequest item) {
    if(actor.role.equals("admin")) return true;
    if(actor.role.equals("student")) return actor.id.equals(item.student.id);
    return actor.role.equals("teacher") && Set.of("teacher","ta").contains(Objects.toString(access.role(actor,item.course),""));
  }
  private Map<String,Object> view(RewardRequest item) {
    return map("id",item.id,"courseId",item.course.id,"courseCode",item.course.code,"assessmentId",item.assessment==null?null:item.assessment.id,
        "assessmentTitle",item.assessment==null?null:item.assessment.title,"student",Views.user(item.student),"requestText",item.requestText,
        "status",item.status,"decisionNote",item.decisionNote,"reviewedAt",item.reviewedAt,"createdAt",item.createdAt);
  }
}
