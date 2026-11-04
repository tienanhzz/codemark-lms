package com.codemark.lms;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ClassFlowApplication {
  public static void main(String[] args) {
    SpringApplication.run(ClassFlowApplication.class, args);
  }
}
