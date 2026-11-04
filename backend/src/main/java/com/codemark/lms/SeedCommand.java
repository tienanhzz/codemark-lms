package com.codemark.lms;

import org.springframework.boot.*;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

/** Explicit command; normal startup never creates demonstration accounts. */
@Component
class SeedCommand implements ApplicationRunner {
  private final DemoSeed seed;
  private final ConfigurableApplicationContext context;

  SeedCommand(DemoSeed seed, ConfigurableApplicationContext context) {
    this.seed = seed;
    this.context = context;
  }

  @Override
  public void run(ApplicationArguments args) throws Exception {
    if (args.containsOption("seed")) {
      seed.seed();
      System.out.println(
          "Seed completed: 4 courses, 40 questions. Existing demo accounts are preserved.");
      context.close();
    }
  }
}
