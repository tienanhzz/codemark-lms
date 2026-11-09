package com.codemark.lms;
import static com.codemark.lms.Api.*;
import jakarta.servlet.http.*;
import java.net.URI;
import java.time.*;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;

@RestController @RequestMapping("/api") @Transactional
class QuizController {
  final Store store; final Access access; final RankService rank;
  QuizController(Store s,Access a,RankService p) { store=s; access=a; rank=p; }
  Map<String,Object> result(QuizResult t) { return map("id",t.id,"student",Views.user(t.student),"status",t.status,"score",t.score); }
  @GetMapping("/courses/{id}/quiz-links") Object list(HttpServletRequest r,@PathVariable long id) {
    User actor=access.current(r); Course c=access.course(actor,id,false); boolean staff=!"student".equals(access.role(actor,c));
    return map("quizzes",store.list(QuizLink.class,"where e.course=?1 order by e.id desc",c).stream().map(q->map("id",q.id,"title",q.title,"url",q.url,"description",q.description,"dueAt",q.dueAt,"maxScore",q.maxScore,"results",store.list(QuizResult.class,"where e.quiz=?1",q).stream().filter(t->staff || t.student.id.equals(actor.id)).map(this::result).toList())).toList());
  }
  @PostMapping("/courses/{id}/quiz-links") Object create(HttpServletRequest r,@PathVariable long id,@RequestBody Map<String,Object> b) {
    User actor=access.current(r); Course c=access.course(actor,id,true);
    QuizLink q=new QuizLink(); q.course=c; q.title=required(b,"title"); q.url=required(b,"url");
    URI uri=URI.create(q.url); require(Set.of("http","https").contains(Objects.toString(uri.getScheme(),"").toLowerCase()) && uri.getHost()!=null && uri.getUserInfo()==null,"invalid_url",400);
    q.description=text(b,"description",""); require(q.description.length()<=20000,"invalid_description",400); q.dueAt=instant(b,"dueAt",null); require(q.dueAt!=null,"invalid_dates",400);
    q.maxScore=Double.parseDouble(required(b,"maxScore")); require(Double.isFinite(q.maxScore)&&q.maxScore>0&&q.maxScore<=100000,"invalid_score",400);
    store.save(q); return map("id",q.id);
  }
  @PostMapping("/quiz-links/{id}/complete") Object complete(HttpServletRequest r,@PathVariable long id) {
    User actor=access.current(r); QuizLink q=store.get(QuizLink.class,id); Course c=access.course(actor,q.course.id,false);
    require("student".equals(access.role(actor,c)) && actor.role.equals("student"),"forbidden",403);
    require(!Instant.now().isAfter(q.dueAt),"deadline_exceeded",409); store.lock(q);
    QuizResult t=find(q,actor); if(t==null) { t=new QuizResult(); t.quiz=q; t.student=actor; store.save(t); }
    return result(t);
  }
  QuizResult find(QuizLink q,User u) { return store.list(QuizResult.class,"where e.quiz=?1 and e.student=?2",q,u).stream().findFirst().orElse(null); }
  void score(QuizLink q,User student,double score,User actor) {
    require(student.role.equals("student") && !store.list(Enrollment.class,"where e.course=?1 and e.user=?2 and e.courseRole='student'",q.course,student).isEmpty(),"student_not_enrolled",400);
    require(Double.isFinite(score)&&score>=0&&score<=q.maxScore,"invalid_score",400);
    QuizResult t=find(q,student); if(t==null) { t=new QuizResult(); t.quiz=q; t.student=student; store.save(t); }
    t.score=t.score==null?score:Math.max(t.score,score); t.status="confirmed";
    rank.best(student,"quiz_link",q.id,t.score/q.maxScore*100,actor);
  }
  @PostMapping("/quiz-links/{id}/scores") Object scores(HttpServletRequest r,@PathVariable long id,@RequestBody Map<String,Object> b) {
    User actor=access.current(r); QuizLink q=store.get(QuizLink.class,id); access.course(actor,q.course.id,true); store.lock(q);
    User student=store.list(User.class,"where e.studentId=?1",required(b,"studentId")).stream().findFirst().orElseThrow(()->new Failure("not_found",404));
    score(q,student,Double.parseDouble(required(b,"score")),actor); return map("ok",true);
  }
  @PostMapping("/quiz-links/{id}/import") Object importScores(HttpServletRequest r,@PathVariable long id,@RequestBody Map<String,Object> b) {
    User actor=access.current(r); QuizLink q=store.get(QuizLink.class,id); access.course(actor,q.course.id,true); store.lock(q);
    var rows=Csv.read(text(b,"csv","")); var header=rows.get(0);
    int codeCol=header.indexOf(text(b,"studentColumn","studentId")), scoreCol=header.indexOf(text(b,"scoreColumn","score"));
    require(codeCol>=0 && scoreCol>=0,"invalid_csv_header",400);
    var errors=new ArrayList<Map<String,Object>>(); var seen=new HashSet<String>(); int count=0;
    for(int i=1;i<rows.size();i++) {
      var row=rows.get(i); String code=row.size()>codeCol?row.get(codeCol).trim():"";
      try {
        require(code.matches("[0-9]{10}") && seen.add(code),"invalid_student_id",400);
        User student=store.list(User.class,"where e.studentId=?1",code).stream().findFirst().orElseThrow(()->new Failure("not_found",404));
        score(q,student,Double.parseDouble(row.get(scoreCol)),actor); count++;
      } catch(Failure|NumberFormatException|IndexOutOfBoundsException e) { errors.add(map("line",i+1,"studentId",code,"error",e.getMessage())); }
    }
    return map("imported",count,"errors",errors);
  }
}
