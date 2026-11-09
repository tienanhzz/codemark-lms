package com.codemark.lms;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Map;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/home/announcements")
@Transactional
class HomeController {
  private final Store store;
  private final Access access;
  @PersistenceContext private EntityManager em;

  HomeController(Store store, Access access) {
    this.store = store;
    this.access = access;
  }

  @GetMapping
  Object list(@RequestParam(defaultValue = "1") int page) {
    Api.require(page >= 1 && page <= 100000, "invalid_page", 400);
    var rows = em.createQuery("select a from HomeAnnouncement a order by a.id desc", HomeAnnouncement.class)
        .setFirstResult((page - 1) * 10).setMaxResults(10).getResultList();
    long total = em.createQuery("select count(a) from HomeAnnouncement a", Long.class).getSingleResult();
    return Api.map("items", rows.stream().map(this::view).toList(), "total", total);
  }

  @PostMapping
  Object create(HttpServletRequest request, @RequestBody Map<String, Object> body) {
    User user = publisher(request);
    HomeAnnouncement item = new HomeAnnouncement();
    item.authorId = user.id;
    item.authorName = user.name;
    item.authorRole = user.role;
    fill(item, body);
    store.save(item);
    return view(item);
  }

  @PutMapping("/{id}")
  Object update(HttpServletRequest request, @PathVariable long id, @RequestBody Map<String, Object> body) {
    User user = publisher(request);
    HomeAnnouncement item = store.get(HomeAnnouncement.class, id);
    canEdit(user, item);
    fill(item, body);
    return view(item);
  }

  @DeleteMapping("/{id}")
  Object delete(HttpServletRequest request, @PathVariable long id) {
    User user = publisher(request);
    HomeAnnouncement item = store.get(HomeAnnouncement.class, id);
    canEdit(user, item);
    store.delete(item);
    return Api.map("ok", true);
  }

  private User publisher(HttpServletRequest request) {
    User user = access.current(request);
    Api.require(user.role.equals("admin") || user.role.equals("teacher"), "forbidden", 403);
    return user;
  }

  private void canEdit(User user, HomeAnnouncement item) {
    Api.require(user.role.equals("admin") || user.id.equals(item.authorId), "forbidden", 403);
  }

  private void fill(HomeAnnouncement item, Map<String, Object> body) {
    String title = Api.text(body, "title", "").trim();
    String content = Api.text(body, "body", "").trim();
    Api.require(!title.isEmpty() && title.length() <= 180 && !content.isEmpty() && content.length() <= 10000,
        "Tiêu đề cần 1–180 ký tự và nội dung cần 1–10.000 ký tự.", 400);
    item.title = title;
    item.body = content;
  }

  private Object view(HomeAnnouncement item) {
    return Api.map("id", item.id, "title", item.title, "body", item.body,
        "createdAt", item.createdAt, "authorId", item.authorId,
        "authorName", item.authorName, "authorRole", item.authorRole);
  }
}
