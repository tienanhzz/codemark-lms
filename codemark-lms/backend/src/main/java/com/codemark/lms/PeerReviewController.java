package com.codemark.lms;

import static com.codemark.lms.Api.*;
import jakarta.persistence.*;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@Entity @Table(name="cf_peer_review",uniqueConstraints=@UniqueConstraint(columnNames={"attempt_id","reviewer_id"}))
class PeerReview extends BaseEntity {
  @ManyToOne @OnDelete(action=OnDeleteAction.CASCADE) Course course;
  @ManyToOne @OnDelete(action=OnDeleteAction.CASCADE) Attempt attempt;
  @ManyToOne @OnDelete(action=OnDeleteAction.CASCADE) User reviewer;
  @Column(length=10000) String body;
  String status="pending";
  Long decidedBy;
  Instant decidedAt;
}

@RestController @RequestMapping("/api") @Transactional
class PeerReviewController {
  final Store store; final Access access; final RankService rank;
  PeerReviewController(Store store,Access access,RankService rank) { this.store=store; this.access=access; this.rank=rank; }
  private Map<String,Object> view(PeerReview review) {
    return map("id",review.id,"courseId",review.course.id,"attemptId",review.attempt.id,
        "assessmentTitle",review.attempt.assessment.title,"student",Views.user(review.attempt.student),
        "reviewer",Views.user(review.reviewer),"body",review.body,"status",review.status,
        "decidedBy",review.decidedBy,"decidedAt",review.decidedAt,"createdAt",review.createdAt);
  }
  private boolean moderator(User user,Course course) {
    return ("teacher".equals(user.role)||"admin".equals(user.role)) && !"student".equals(access.role(user,course));
  }
  @GetMapping("/courses/{id}/peer-reviews")
  Object list(HttpServletRequest request,@PathVariable long id) {
    User actor=access.current(request); Course course=access.course(actor,id,false);
    boolean staff=moderator(actor,course);
    var reviews=store.list(PeerReview.class,"where e.course=?1 order by e.id desc",course).stream()
        .filter(review->staff || review.reviewer.id.equals(actor.id) || (review.status.equals("approved")&&review.attempt.student.id.equals(actor.id)))
        .map(this::view).toList();
    // Share identifiers only: private answers, test cases, code and grades remain protected.
    var targets=store.list(Attempt.class,"where e.assessment.course=?1 and e.status='submitted'",course).stream()
        .filter(attempt->staff || !attempt.student.id.equals(actor.id))
        .map(attempt->map("id",attempt.id,"assessmentTitle",attempt.assessment.title,"student",Views.user(attempt.student))).toList();
    return map("reviews",reviews,"targets",targets);
  }
  @PostMapping("/courses/{id}/peer-reviews")
  @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
  Object create(HttpServletRequest request,@PathVariable long id,@RequestBody Map<String,Object> body) {
    User actor=access.current(request); Course course=access.course(actor,id,false);
    require("student".equals(actor.role)&&"student".equals(access.role(actor,course)),"forbidden",403);
    Attempt attempt=store.get(Attempt.class,Long.parseLong(required(body,"attemptId")));
    require(attempt.assessment.course.id.equals(course.id)&&"submitted".equals(attempt.status)
        &&"student".equals(attempt.student.role)&&!attempt.student.id.equals(actor.id),"invalid_peer_review",400);
    String content=required(body,"body").trim(); require(content.length()>=200 && content.length()<=10000,"peer_review_detail_required",400);
    store.lock(attempt);
    require(store.list(PeerReview.class,"where e.attempt=?1 and e.reviewer=?2",attempt,actor).isEmpty(),"peer_review_exists",409);
    PeerReview review=new PeerReview(); review.course=course; review.attempt=attempt; review.reviewer=actor; review.body=content; store.save(review);
    return view(review);
  }
  @PatchMapping("/peer-reviews/{id}")
  Object decide(HttpServletRequest request,@PathVariable long id,@RequestBody Map<String,Object> body) {
    User actor=access.current(request); PeerReview review=store.get(PeerReview.class,id);
    access.course(actor,review.course.id,true); require(moderator(actor,review.course),"forbidden",403);
    store.refreshLocked(review);
    String decision=required(body,"status"); require(Set.of("approved","rejected").contains(decision),"invalid_status",400);
    if(review.status.equals(decision)) return view(review);
    require(review.status.equals("pending"),"review_already_decided",409);
    review.status=decision; review.decidedBy=actor.id; review.decidedAt=Instant.now();
    if(decision.equals("approved")) rank.awardAction(review.reviewer,review.course,"peer_review",review.id,actor,review.decidedAt);
    return view(review);
  }
}
