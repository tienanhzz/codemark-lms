package com.codemark.lms;

import jakarta.annotation.PreDestroy;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Submitted source is only executed in a disposable, unprivileged container. */
@Service
class ContainerRunner {
  record Result(boolean ok, boolean passed, String stdout, String stderr, String error) {}

  record Job(String input, String expected, int time, int memory) {}

  private final boolean enabled;
  private final String image;
  private final int concurrency;
  private final ExecutorService pool;
  private final Semaphore slots;
  private volatile long checkedAt;
  private volatile boolean ready;

  ContainerRunner(
      @Value("${codemark.runner-enabled}") boolean enabled,
      @Value("${codemark.runner-image}") String image,
      @Value("${codemark.runner-concurrency}") int concurrency) {
    this.enabled = enabled;
    this.image = image;
    this.concurrency = Math.max(1, Math.min(concurrency, 8));
    pool = Executors.newFixedThreadPool(this.concurrency);
    slots = new Semaphore(this.concurrency);
  }

  boolean enabled() {
    return enabled;
  }

  synchronized boolean available() {
    if (!enabled) return false;
    if (System.currentTimeMillis() - checkedAt < 5000) return ready;
    checkedAt = System.currentTimeMillis();
    try {
      Process p =
          new ProcessBuilder("docker", "image", "inspect", image)
              .redirectErrorStream(true)
              .redirectOutput(ProcessBuilder.Redirect.DISCARD)
              .start();
      ready = p.waitFor(3, TimeUnit.SECONDS) && p.exitValue() == 0;
      if (p.isAlive()) p.destroyForcibly();
    } catch (Exception e) {
      ready = false;
    }
    return ready;
  }

  Map<String, Object> status() {
    return Api.map(
        "enabled",
        enabled,
        "available",
        available(),
        "engine",
        "docker",
        "image",
        image,
        "maxConcurrency",
        concurrency);
  }

  @PreDestroy
  void shutdown() {
    pool.shutdownNow();
  }

  List<Result> runCases(String language, String source, List<TestCase> cases) {
    var jobs =
        cases.stream()
            .map(c -> new Job(c.input, c.expectedOutput, c.timeLimitMs, c.memoryMb))
            .toList();
    var futures = jobs.stream().map(j -> pool.submit(() -> run(language, source, j))).toList();
    return futures.stream()
        .map(
            f -> {
              try {
                return f.get();
              } catch (Exception e) {
                Thread.currentThread().interrupt();
                throw new Api.Failure("runner_unavailable", 503);
              }
            })
        .toList();
  }

  private Result run(String language, String source, Job j) {
    String file, compile, run;
    switch (language == null ? "" : language) {
      case "python" -> {
        file = "main.py";
        compile = "cp /src/main.py /work/main.py";
        run = "python3 /work/main.py < /src/input.txt";
      }
      case "c" -> {
        file = "main.c";
        compile = "gcc -O2 -o /work/main /src/main.c";
        run = "/work/main < /src/input.txt";
      }
      case "cpp" -> {
        file = "main.cpp";
        compile = "g++ -O2 -std=c++17 -o /work/main /src/main.cpp";
        run = "/work/main < /src/input.txt";
      }
      case "java" -> {
        file = "Main.java";
        compile = "javac -d /work /src/Main.java";
        run = "java -XX:MaxRAMPercentage=60 -cp /work Main < /src/input.txt";
      }
      case "sql" -> {
        file = "main.sql";
        compile = "true";
        run = "cat /src/input.txt /src/main.sql | sqlite3 :memory:";
      }
      default -> {
        return new Result(false, false, "", "", "unsupported_language");
      }
    }
    if (!enabled) return new Result(false, false, "", "", "runner_unavailable");
    String name = "codemark-" + UUID.randomUUID();
    Path dir = null;
    boolean acquired = false;
    Process process = null;
    try {
      slots.acquire();
      acquired = true;
      dir = Files.createTempDirectory("codemark-runner-");
      Files.writeString(dir.resolve(file), source);
      Files.writeString(dir.resolve("input.txt"), j.input());
      // Linux needs the mapped files readable by uid 65534.
      try {
        Files.setPosixFilePermissions(
            dir, java.nio.file.attribute.PosixFilePermissions.fromString("rwxr-xr-x"));
        for (Path p : List.of(dir.resolve(file), dir.resolve("input.txt")))
          Files.setPosixFilePermissions(
              p, java.nio.file.attribute.PosixFilePermissions.fromString("rw-r--r--"));
      } catch (UnsupportedOperationException ignored) {
      }
      double seconds = (j.time() + (language.equals("java") ? 1000 : 0)) / 1000.0;
      var cmd =
          List.of(
              "docker",
              "run",
              "--rm",
              "--name",
              name,
              "--network",
              "none",
              "--read-only",
              "--cap-drop",
              "ALL",
              "--security-opt",
              "no-new-privileges",
              "--pids-limit",
              "64",
              "--cpus",
              "0.5",
              "--memory",
              Math.max(32, Math.min(j.memory(), 1024)) + "m",
              "--user",
              "65534:65534",
              "--tmpfs",
              "/tmp:rw,exec,nosuid,size=64m",
              "--tmpfs",
              "/work:rw,exec,nosuid,size=128m",
              "-v",
              dir.toAbsolutePath() + ":/src:ro",
              image,
              "sh",
              "-c",
              compile
                  + " && timeout -k 1 "
                  + String.format(Locale.ROOT, "%.3f", seconds)
                  + " sh -c '"
                  + run
                  + "'");
      process = new ProcessBuilder(cmd).start();
      final Process active = process;
      try (var readers = Executors.newVirtualThreadPerTaskExecutor()) {
        Future<String> stdout = readers.submit(() -> bounded(active.getInputStream()));
        Future<String> stderr = readers.submit(() -> bounded(active.getErrorStream()));
        if (!process.waitFor((long) Math.ceil(seconds) + 20, TimeUnit.SECONDS)) {
          process.destroyForcibly();
          stop(name);
          return new Result(false, false, "", "", "time_limit_exceeded");
        }
        String out = stdout.get(5, TimeUnit.SECONDS), err = stderr.get(5, TimeUnit.SECONDS);
        boolean ok = process.exitValue() == 0;
        return new Result(
            ok,
            ok && normalize(out).equals(normalize(j.expected())),
            out,
            err,
            ok ? null : process.exitValue() == 124 ? "time_limit_exceeded" : "runtime_error");
      }
    } catch (Exception e) {
      if (e instanceof InterruptedException) Thread.currentThread().interrupt();
      return new Result(false, false, "", "", "runner_unavailable");
    } finally {
      if (process != null && process.isAlive()) process.destroyForcibly();
      if (acquired) {
        stop(name);
        slots.release();
      }
      if (dir != null)
        try {
          try (var paths = Files.walk(dir)) {
            for (Path p : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(p);
          }
        } catch (IOException ignored) {
        }
    }
  }

  private void stop(String name) {
    try {
      Process p =
          new ProcessBuilder("docker", "rm", "-f", name)
              .redirectErrorStream(true)
              .redirectOutput(ProcessBuilder.Redirect.DISCARD)
              .start();
      if (!p.waitFor(10, TimeUnit.SECONDS)) p.destroyForcibly();
    } catch (Exception ignored) {
    }
  }

  private String bounded(InputStream stream) throws IOException {
    var output = new ByteArrayOutputStream();
    byte[] buffer = new byte[4096];
    for (int n; (n = stream.read(buffer)) != -1; )
      if (output.size() < 20000) output.write(buffer, 0, Math.min(n, 20000 - output.size()));
    return output.toString(java.nio.charset.StandardCharsets.UTF_8);
  }

  static String normalize(String s) {
    return s.replace("\r\n", "\n").replaceAll("(?m)[ \\t]+$", "").strip();
  }
}
