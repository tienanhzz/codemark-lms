package com.codemark.lms;

import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;

/** Strategy separates answer comparison from attempt lifecycle and persistence. */
interface AnswerGrader {
  boolean supports(String kind);

  double score(Question question, String answer);
}

@Service
class TextAnswerGrader implements AnswerGrader {
  public boolean supports(String kind) {
    return !kind.equals("code");
  }

  public double score(Question q, String response) {
    if (response == null || q.answer == null) return 0;
    boolean correct =
        q.kind.equals("mcq")
            ? response.trim().equals(q.answer.trim())
            : Arrays.stream(q.answer.split("\\|"))
                .anyMatch(a -> normalize(a).equals(normalize(response)));
    return correct ? q.points : 0;
  }

  private String normalize(String s) {
    return s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
  }
}

@Service
class CodeAnswerGrader implements AnswerGrader {
  private final Store store;
  private final ContainerRunner runner;

  CodeAnswerGrader(Store s, ContainerRunner r) {
    store = s;
    runner = r;
  }

  public boolean supports(String kind) {
    return kind.equals("code");
  }

  public double score(Question q, String response) {
    if (response == null || response.isBlank()) return 0;
    var cases = store.list(TestCase.class, "where e.question=?1 order by e.id", q);
    if (cases.isEmpty()) return 0;
    Api.require(runner.available(), "runner_unavailable", 503);
    var results = runner.runCases(q.language, response, cases);
    double total = 0, passed = 0;
    for (int i = 0; i < cases.size(); i++) {
      Api.require(!"runner_unavailable".equals(results.get(i).error()), "runner_unavailable", 503);
      double w = cases.get(i).points;
      total += w;
      if (results.get(i).passed()) passed += w;
    }
    return total == 0 ? 0 : q.points * passed / total;
  }
}

@Service
class GradingService {
  private final RankService rank;
  private final Store store;
  private final List<AnswerGrader> graders;

  GradingService(Store s, List<AnswerGrader> g, RankService rank) {
    this.rank = rank;
    store = s;
    graders = g;
  }

  void submit(Attempt attempt) {
    if (!attempt.status.equals("in_progress")) return;
    Instant submittedAt=Instant.now();
    double score = 0, max = 0;
    for (Question q :
        store.list(
            Question.class, "where e.assessment=?1 order by e.position,e.id", attempt.assessment)) {
      max += q.points;
      score +=
          graders.stream()
              .filter(g -> g.supports(q.kind))
              .findFirst()
              .orElseThrow()
              .score(q, attempt.answers.get(q.id.toString()));
    }
    attempt.score = Math.round(score * 1000) / 1000.0;
    attempt.maxScore = max;
    attempt.status = "submitted";
    attempt.submittedAt = submittedAt;
    if (max > 0) rank.awardSubmission(attempt,attempt.assessment.createdBy,submittedAt);
  }

  void quizPublished(Assessment assessment) {
    if(assessment.published && "quiz".equals(assessment.kind) && assessment.createdBy!=null && "teacher".equals(assessment.createdBy.role)
        && !store.list(Question.class,"where e.assessment=?1",assessment).isEmpty())
      rank.awardAction(assessment.createdBy,assessment.course,"teacher_quiz",assessment.id,assessment.createdBy,Instant.now());
  }

  void checkOpen(Attempt attempt) {
    Api.require(attempt.status.equals("in_progress"), "attempt_closed", 409);
    Api.require(attempt.deadline.isAfter(Instant.now()), "deadline_exceeded", 409);
  }
}
