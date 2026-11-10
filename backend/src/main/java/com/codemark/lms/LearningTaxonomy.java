package com.codemark.lms;

import static com.codemark.lms.Api.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@Entity
@Table(name="cf_learning_tag", uniqueConstraints=@UniqueConstraint(columnNames="tag_id"))
class LearningTag extends BaseEntity {
  String tagId;
  String label;
  String parentId;
  boolean lesson;
  boolean codingQuestion;
  boolean assignable=true;
  boolean active=true;
  int position;
}

@Component
@org.springframework.core.annotation.Order(1)
class LearningTaxonomyBootstrap implements ApplicationRunner {
  final Store store;
  final ObjectMapper json;
  LearningTaxonomyBootstrap(Store store,ObjectMapper json) { this.store=store; this.json=json; }
  @Override @Transactional public void run(ApplicationArguments args) throws Exception {
    if(!store.all(LearningTag.class).isEmpty()) return;
    JsonNode catalog=json.readTree(new ClassPathResource("learning-taxonomy.json").getInputStream());
    for(JsonNode row:catalog.path("tags")) {
      LearningTag tag=new LearningTag();
      tag.tagId=row.path("id").asText();
      tag.label=row.path("name").path("vi").asText(row.path("name").path("en").asText());
      tag.parentId=row.path("parentId").isNull()?null:row.path("parentId").asText(null);
      JsonNode applies=row.path("appliesTo");
      tag.lesson=false; tag.codingQuestion=false;
      for(JsonNode item:applies) { tag.lesson|=item.asText().equals("lesson"); tag.codingQuestion|=item.asText().equals("codingQuestion"); }
      tag.assignable=row.path("assignable").asBoolean(true);
      tag.active=row.path("status").asText("active").equals("active");
      tag.position=row.path("sortOrder").asInt();
      store.save(tag);
    }
  }
}

@RestController
@RequestMapping("/api/taxonomy")
@Transactional
class LearningTaxonomyController {
  final Store store;
  final Access access;
  final Views views;
  LearningTaxonomyController(Store store, Access access, Views views) { this.store=store; this.access=access; this.views=views; }

  @GetMapping
  Object list(HttpServletRequest request, @RequestParam(defaultValue="false") boolean includeInactive) {
    User user=access.current(request);
    boolean staff=user.role.equals("admin") || user.role.equals("teacher") || user.role.equals("ta");
    return map("tags", store.list(LearningTag.class, "order by e.position,e.id").stream()
      .filter(t -> (t.active || (includeInactive && user.role.equals("admin"))) && (staff || t.active))
      .map(LearningTaxonomyController::view).toList());
  }

  @PostMapping
  Object create(HttpServletRequest request, @RequestBody Map<String,Object> body) {
    User actor=access.admin(request);
    LearningTag tag=new LearningTag(); fields(tag,body,true); store.save(tag);
    access.audit(actor,"taxonomy_tag_created",request.getRemoteAddr(),"tagId",tag.tagId);
    return view(tag);
  }

  @PutMapping("/{id}")
  Object update(HttpServletRequest request, @PathVariable long id, @RequestBody Map<String,Object> body) {
    User actor=access.admin(request); LearningTag tag=store.get(LearningTag.class,id);
    fields(tag,body,false); access.audit(actor,"taxonomy_tag_updated",request.getRemoteAddr(),"tagId",tag.tagId);
    return view(tag);
  }

  @GetMapping("/questions")
  Object filterQuestions(HttpServletRequest request, @RequestParam long courseId,
      @RequestParam List<String> tagIds, @RequestParam String match) {
    User actor=access.current(request); Course course=access.course(actor,courseId,true);
    require(!tagIds.isEmpty() && tagIds.size()<=20 && new HashSet<>(tagIds).size()==tagIds.size(),"invalid_tag_ids",400);
    require(Set.of("any","all").contains(match),"invalid_match",400);
    for(String id:tagIds) {
      LearningTag tag=store.list(LearningTag.class,"where e.tagId=?1",id).stream().findFirst().orElseThrow(()->new Failure("invalid_tag",400));
      require(tag.active && tag.assignable && tag.codingQuestion,"invalid_tag",400);
    }
    List<Map<String,Object>> results=store.list(Question.class,"where e.assessment.course=?1 order by e.assessment.id,e.position,e.id",course).stream()
      .filter(q -> match.equals("any") ? q.tagIds.stream().anyMatch(tagIds::contains) : q.tagIds.containsAll(tagIds))
      .map(q -> views.question(q,true)).toList();
    return map("match",match,"tagIds",tagIds,"questions",results);
  }

  private void fields(LearningTag tag, Map<String,Object> body, boolean create) {
    if (create || body.containsKey("tagId")) {
      String id=required(body,"tagId").trim();
      require(id.matches("[a-z][a-z0-9-]{0,63}"),"invalid_tag_id",400);
      require(store.list(LearningTag.class,"where e.tagId=?1",id).stream().allMatch(t->t.id.equals(tag.id)),"duplicate_tag_id",409);
      tag.tagId=id;
    }
    if(create || body.containsKey("label")) {
      tag.label=required(body,"label").trim(); require(!tag.label.isBlank() && tag.label.length()<=100,"invalid_label",400);
    }
    if(body.containsKey("parentId")) tag.parentId=body.get("parentId")==null || body.get("parentId").toString().isBlank()?null:body.get("parentId").toString();
    if(create || body.containsKey("lesson")) tag.lesson=bool(body,"lesson",false);
    if(create || body.containsKey("codingQuestion")) tag.codingQuestion=bool(body,"codingQuestion",false);
    if(create || body.containsKey("assignable")) tag.assignable=bool(body,"assignable",true);
    if(create || body.containsKey("active")) tag.active=bool(body,"active",true);
    if(create || body.containsKey("position")) tag.position=integer(body,"position",tag.position,0,100000);
    require(tag.lesson || tag.codingQuestion,"tag_applicability_required",400);
    if(tag.parentId!=null) {
      LearningTag parent=store.list(LearningTag.class,"where e.tagId=?1",tag.parentId).stream().findFirst().orElseThrow(()->new Failure("invalid_parent",400));
      require(!parent.tagId.equals(tag.tagId),"taxonomy_cycle",400);
      Set<String> seen=new HashSet<>(); LearningTag node=parent;
      while(node!=null) {
        require(seen.add(node.tagId) && !node.tagId.equals(tag.tagId),"taxonomy_cycle",400);
        String next=node.parentId; node=next==null?null:store.list(LearningTag.class,"where e.tagId=?1",next).stream().findFirst().orElse(null);
      }
    }
  }

  static Map<String,Object> view(LearningTag t) { return map("id",t.id,"tagId",t.tagId,"label",t.label,"parentId",t.parentId,"lesson",t.lesson,"codingQuestion",t.codingQuestion,"assignable",t.assignable,"active",t.active,"position",t.position); }

  static List<String> validatedTagIds(Store store, Object value, boolean forLesson) {
    if(value==null) return new ArrayList<>();
    require(value instanceof List<?>,"invalid_tag_ids",400);
    List<String> ids=((List<?>)value).stream().map(Object::toString).toList();
    require(ids.size()<=20 && new HashSet<>(ids).size()==ids.size(),"invalid_tag_ids",400);
    for(String id:ids) {
      LearningTag tag=store.list(LearningTag.class,"where e.tagId=?1",id).stream().findFirst().orElseThrow(()->new Failure("invalid_tag",400));
      require(tag.active && tag.assignable && (forLesson?tag.lesson:tag.codingQuestion),"invalid_tag",400);
    }
    return new ArrayList<>(ids);
  }
}
