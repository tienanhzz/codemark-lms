package com.codemark.lms;

import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class DemoSeed {
  private final Store store;
  private final Access access;
  private final ObjectMapper json;

  DemoSeed(Store s, Access a, ObjectMapper j) {
    store = s;
    access = a;
    json = j;
  }

  @Transactional
  public void seed() throws Exception {
    User teacher = user("teacher@demo.local", "Demo Teacher", "teacher");
    User ta = user("ta@demo.local", "Demo TA", "ta");
    user("admin@demo.local", "Demo Admin", "admin");
    var students = new ArrayList<User>();
    for (int i = 1; i <= 3; i++)
      students.add(user("student" + i + "@demo.local", "Demo Student " + i, "student"));
    try (var input = getClass().getResourceAsStream("/demo-questions.json")) {
      for (JsonNode subject : json.readTree(input)) {
        String code = subject.get("code").asText();
        Course c =
            store.list(Course.class, "where e.code=?1", code).stream().findFirst().orElse(null);
        if (c != null) {
          c.title = subject.get("title").asText();
          updateMeeting(c, subject.get("meeting"));
          continue;
        }
        c = new Course();
        c.code = code;
        c.title = subject.get("title").asText();
        c.owner = teacher;
        c.term = "Demo " + LocalDate.now().getYear();
        c.startDate = LocalDate.now().minusDays(7);
        c.endDate = LocalDate.now().plusMonths(4);
        c.published = true;
        store.save(c);
        enroll(c, teacher, "teacher");
        enroll(c, ta, "ta");
        for (User s : students) enroll(c, s, "student");
        updateMeeting(c, subject.get("meeting"));
        Lesson l = new Lesson();
        l.course = c;
        l.title = "Getting started";
        l.content = "Welcome to " + c.title + ". Review this lesson, then open the practice quiz.";
        store.save(l);
        Assessment a = new Assessment();
        a.course = c;
        a.createdBy = teacher;
        a.title = subject.get("quiz").asText();
        a.opensAt = Instant.now().minusSeconds(86400);
        a.closesAt = Instant.now().plusSeconds(30L * 86400);
        a.durationMinutes = 30;
        a.maxAttempts = 3;
        a.published = true;
        store.save(a);
        int position = 0;
        for (JsonNode question : subject.get("questions")) {
          Question q = new Question();
          q.assessment = a;
          q.prompt = question.get("prompt").asText();
          q.options =
              json.convertValue(
                  question.get("options"),
                  new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
          q.answer = question.get("answer").asText();
          q.points = question.path("points").asDouble(1);
          q.position = position++;
          store.save(q);
        }
      }
    }
  }

  private void updateMeeting(Course course, JsonNode settings) {
    // Keep the existing meeting ID so leave requests still reference it.
    Meeting meeting =
        store.list(Meeting.class, "where e.course=?1 order by e.id", course).stream()
            .findFirst()
            .orElse(null);
    if (meeting == null) {
      meeting = new Meeting();
      meeting.course = course;
      store.save(meeting);
    }
    meeting.weekday = settings.get("weekday").asInt();
    meeting.startTime = LocalTime.parse(settings.get("start").asText());
    meeting.endTime = LocalTime.parse(settings.get("end").asText());
    meeting.location = settings.get("location").asText();
  }

  User user(String email, String name, String role) {
    return store.list(User.class, "where e.email=?1", email).stream()
        .findFirst()
        .orElseGet(
            () -> {
              User u = new User();
              u.email = email;
              u.name = name;
              u.role = role;
              u.passwordHash = access.hash("DemoPass123!");
              return store.save(u);
            });
  }

  void enroll(Course c, User u, String role) {
    Enrollment e = new Enrollment();
    e.course = c;
    e.user = u;
    e.courseRole = role;
    store.save(e);
  }
}
