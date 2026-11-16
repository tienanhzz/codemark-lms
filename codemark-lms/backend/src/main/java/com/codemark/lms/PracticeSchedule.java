package com.codemark.lms;

import static com.codemark.lms.Api.require;
import jakarta.persistence.LockModeType;
import java.time.*;
import java.time.temporal.TemporalAdjusters;
import java.util.*;

/** One shared calendar slot for internal practices and external quizzes. */
final class PracticeSchedule {
  static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
  private PracticeSchedule() {}

  static void lock(Store store, Course course) {
    store.refreshLocked(course);
  }

  static LocalDate slot(Instant opensAt, String cadence) {
    LocalDate date = opensAt.atZone(ZONE).toLocalDate();
    return "daily".equals(cadence) ? date : date.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
  }

  // Caller holds the course lock before mutating a practice or its cadence.
  static void validate(Store store, Course course, String kind, boolean published,
      Instant opensAt, Long assessmentId, Long quizId) {
    if (!published || "exam".equals(kind)) return;
    LocalDate target = slot(opensAt, course.practiceCadence);
    for (Assessment a : store.list(Assessment.class, "where e.course=?1", course))
      if (a.published && !"exam".equals(a.kind) && !Objects.equals(a.id, assessmentId))
        require(!target.equals(slot(a.opensAt, course.practiceCadence)), "practice_slot_occupied", 409);
    for (QuizLink q : store.list(QuizLink.class, "where e.course=?1", course))
      if (!Objects.equals(q.id, quizId))
        require(!target.equals(slot(q.opensAt == null ? q.createdAt : q.opensAt, course.practiceCadence)), "practice_slot_occupied", 409);
  }

  static void validateCadenceChange(Store store, Course course, String cadence) {
    // Retain historical legacy records; a change must not collide in current/future slots.
    var seen = new HashSet<LocalDate>();
    LocalDate current = slot(Instant.now(), cadence);
    var times = new ArrayList<Instant>();
    for (Assessment a : store.list(Assessment.class, "where e.course=?1", course))
      if (a.published && !"exam".equals(a.kind)) times.add(a.opensAt);
    for (QuizLink q : store.list(QuizLink.class, "where e.course=?1", course))
      times.add(q.opensAt == null ? q.createdAt : q.opensAt);
    for (Instant time : times) {
      LocalDate period = slot(time, cadence);
      if (!period.isBefore(current)) require(seen.add(period), "practice_cadence_conflict", 409);
    }
  }
}
