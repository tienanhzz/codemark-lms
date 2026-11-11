package com.codemark.lms;

import org.springframework.boot.*;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

/** Explicit command; normal startup never creates demonstration accounts. */
@Component
class SeedCommand implements ApplicationRunner {
  private final DemoSeed seed;
  private final RankDemoSeed rankDemo;
  private final ConfigurableApplicationContext context;

  SeedCommand(DemoSeed seed, RankDemoSeed rankDemo, ConfigurableApplicationContext context) {
    this.seed = seed;
    this.rankDemo = rankDemo;
    this.context = context;
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    if (args.containsOption("refresh-announcements")) {
      System.out.println("Rank announcements refreshed: Gold and above, fantasy wording.");
      context.close();
      return;
    }
    if (args.containsOption("seed-rank")) {
      rankDemo.seed();
      System.out.println("Rank seed completed: 25 students and 4 teachers per class with sample EXP/Reputation; existing records preserved.");
      context.close();
      return;
    }
    if (args.containsOption("seed-teachers")) {
      rankDemo.seedTeachersOnly();
      System.out.println("Teacher seed completed: 4 teachers per class with random names and 0–130 Reputation; other records preserved.");
      context.close();
      return;
    }
    if (args.containsOption("seed")) {
      seed.seed();
      System.out.println(
          "Seed completed: 4 courses, 40 questions. Existing demo accounts are preserved.");
      context.close();
    }
  }
}
