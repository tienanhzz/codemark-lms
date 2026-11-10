package com.codemark.lms;

import static com.codemark.lms.Api.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController @Transactional
class ManualGradingController {
  private final Store store;
  private final Access access;
  private final RankService rank;
  private final Views views;
  ManualGradingController(Store store,Access access,RankService rank,Views views) {
    this.store=store; this.access=access; this.rank=rank; this.views=views;
  }

  @PatchMapping("/api/attempts/{id}/grade")
  Object grade(HttpServletRequest request,@PathVariable long id,@RequestBody Map<String,Object> body) {
    User actor=access.current(request);
    require(Set.of("teacher","admin").contains(actor.role),"forbidden",403);
    Attempt attempt=store.get(Attempt.class,id);
    Course course=access.course(actor,attempt.assessment.course.id,true);
    PracticeSchedule.lock(store,course);
    store.refresh(attempt);
    require("submitted".equals(attempt.status),"attempt_not_submitted",409);
    double score=Double.parseDouble(required(body,"score"));
    require(Double.isFinite(score) && score>=0 && score<=attempt.maxScore,"invalid_score",400);
    String feedback=text(body,"feedback","").trim();
    require(feedback.length()<=20000,"invalid_feedback",400);
    require(body.get("inlineFeedback")==null || body.get("inlineFeedback") instanceof Map<?,?>,"invalid_feedback",400);
    Map<String,String> annotations=new LinkedHashMap<>();
    Set<String> questions=new HashSet<>();
    for(Question question:store.list(Question.class,"where e.assessment=?1",attempt.assessment)) questions.add(question.id.toString());
    if(body.get("inlineFeedback") instanceof Map<?,?> comments) {
      require(comments.size()<=100,"invalid_feedback",400);
      for(var entry:comments.entrySet()) {
        String key=Objects.toString(entry.getKey(),""); String comment=Objects.toString(entry.getValue(),"").trim();
        require(questions.contains(key) && !comment.isEmpty() && comment.length()<=4000,"invalid_feedback",400);
        annotations.put(key,comment);
      }
    }
    Instant now=Instant.now();
    attempt.score=score; attempt.teacherFeedback=feedback; attempt.inlineFeedback=annotations;
    attempt.gradedBy=actor.id; attempt.gradedAt=now;
    if(attempt.maxScore>0) rank.awardSubmission(attempt,actor,now);
    if(actor.role.equals("teacher")) {
      if(feedback.length()>=200 && annotations.values().stream().anyMatch(comment->comment.length()>=30))
        rank.awardAction(actor,course,"teacher_feedback",attempt.id,actor,now);
      Assessment assessment=attempt.assessment;
      if(assessment.gradingDueAt!=null && !now.isAfter(assessment.gradingDueAt)) {
        var roster=store.list(Enrollment.class,"where e.course=?1 and e.courseRole='student' and e.user.role='student'",course);
        boolean outstanding=store.list(Attempt.class,"where e.assessment=?1 and e.student.role='student' and e.submittedAt is not null",assessment).stream().anyMatch(work->work.gradedAt==null);
        if(!outstanding && !roster.isEmpty() && roster.stream().allMatch(member->
            !store.list(Attempt.class,"where e.assessment=?1 and e.student=?2 and e.submittedAt is not null and e.gradedAt is not null",assessment,member.user).isEmpty()))
          rank.awardAction(actor,course,"teacher_grading",assessment.id,actor,now);
      }
    }
    access.audit(actor,"attempt_graded",request.getRemoteAddr(),"attemptId",id,"score",score);
    return views.attempt(attempt,true,actor);
  }
}
