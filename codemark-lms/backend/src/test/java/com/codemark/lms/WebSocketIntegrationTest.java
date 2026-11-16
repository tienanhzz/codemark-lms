package com.codemark.lms;

import static org.junit.jupiter.api.Assertions.*;

import com.fasterxml.jackson.databind.*;
import java.net.*;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.datasource.url=jdbc:h2:mem:socket;DB_CLOSE_DELAY=-1",
      "codemark.token-key=a2tra2tra2tra2tra2tra2tra2tra2tra2tra2tra2s="
    })
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WebSocketIntegrationTest {
  @LocalServerPort int port;
  @Autowired DemoSeed seed;
  @Autowired ObjectMapper json;

  @BeforeAll
  void setup() throws Exception {
    seed.seed();
  }

  HttpClient client(String studentId) throws Exception {
    var cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    var client = HttpClient.newBuilder().cookieHandler(cookies).build();
    var response =
        client.send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/login"))
                .header("Content-Type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        json.writeValueAsString(
                            Api.map("studentId", studentId, "password", "CodeMark@2026"))))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertEquals(200, response.statusCode());
    return client;
  }

  JsonNode get(HttpClient client, String path) throws Exception {
    return json.readTree(
        client
            .send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build(),
                HttpResponse.BodyHandlers.ofString())
            .body());
  }

  JsonNode post(HttpClient client, String path, Object data) throws Exception {
    var response =
        client.send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(data)))
                .build(),
            HttpResponse.BodyHandlers.ofString());
    assertTrue(response.statusCode() < 300, response.body());
    return json.readTree(response.body());
  }

  class Inbox implements WebSocket.Listener {
    final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
    final StringBuilder buffer = new StringBuilder();

    @Override
    public CompletionStage<?> onText(WebSocket ws, CharSequence text, boolean last) {
      buffer.append(text);
      if (last) {
        try {
          messages.add(json.readTree(buffer.toString()));
        } catch (Exception e) {
          throw new RuntimeException(e);
        }
        buffer.setLength(0);
      }
      ws.request(1);
      return null;
    }

    JsonNode await(String event) throws Exception {
      long end = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
      while (System.nanoTime() < end) {
        JsonNode next = messages.poll(1, TimeUnit.SECONDS);
        if (next != null && next.path("event").asText().equals(event)) return next.get("data");
      }
      throw new AssertionError("No WebSocket event: " + event);
    }
  }

  WebSocket open(HttpClient client, Inbox listener) throws Exception {
    return client
        .newWebSocketBuilder()
        .header("Origin", "http://localhost:3000")
        .buildAsync(URI.create("ws://localhost:" + port + "/ws"), listener)
        .get(10, TimeUnit.SECONDS);
  }

  void send(WebSocket ws, String event, Object data) throws Exception {
    ws.sendText(json.writeValueAsString(Api.map("event", event, "data", data)), true).join();
  }

  @Test
  void authenticatedMonitorTelemetryAlertAndForceSubmit() throws Exception {
    HttpClient teacher = client("1000000001"), student = client("2025000001");
    long course = get(teacher, "/api/courses").path("courses").get(0).path("id").asLong();
    long assessment =
        get(teacher, "/api/courses/" + course + "/assessments")
            .path("assessments")
            .get(0)
            .path("id")
            .asLong();
    long attempt =
        post(student, "/api/assessments/" + assessment + "/start", Map.of()).path("id").asLong();
    long studentId = get(student, "/api/auth/me").path("id").asLong();
    Inbox monitor = new Inbox(), learner = new Inbox();
    WebSocket staffSocket = open(teacher, monitor), studentSocket = open(student, learner);
    try {
      monitor.await("connected");
      learner.await("connected");
      send(staffSocket, "join_monitor", Api.map("assessmentId", assessment));
      monitor.await("monitor_joined");
      send(studentSocket, "telemetry", Api.map("attemptId", attempt, "event", "blur"));
      assertEquals("blur", monitor.await("proctor_event").path("kind").asText());
      send(
          staffSocket,
          "teacher_action",
          Api.map(
              "assessmentId",
              assessment,
              "targetUserId",
              studentId,
              "action",
              "alert",
              "message",
              "Please focus"));
      assertEquals("Please focus", learner.await("teacher_alert").path("message").asText());
      assertTrue(monitor.await("teacher_action_ack").path("ok").asBoolean());
      send(
          staffSocket,
          "teacher_action",
          Api.map(
              "assessmentId",
              assessment,
              "targetUserId",
              studentId,
              "action",
              "adjust_time",
              "seconds",
              60));
      assertEquals(60, learner.await("deadline_adjusted").path("seconds").asInt());
      monitor.await("teacher_action_ack");
      send(
          staffSocket,
          "teacher_action",
          Api.map("assessmentId", assessment, "targetUserId", studentId, "action", "force_submit"));
      assertEquals(attempt, learner.await("forced_submission").path("attemptId").asLong());
      monitor.await("teacher_action_ack");
      assertEquals("submitted", get(student, "/api/attempts/" + attempt).path("status").asText());
    } finally {
      staffSocket.abort();
      studentSocket.abort();
    }
  }

  @Test
  void studentCannotJoinMonitor() throws Exception {
    var client = client("2025000002");
    Inbox inbox = new Inbox();
    WebSocket ws = open(client, inbox);
    try {
      inbox.await("connected");
      send(ws, "join_monitor", Api.map("assessmentId", 1));
      assertEquals("forbidden", inbox.await("monitor_denied").path("reason").asText());
    } finally {
      ws.abort();
    }
  }

  @Test
  void unauthenticatedHandshakeRejected() {
    var client = HttpClient.newHttpClient();
    assertThrows(Exception.class, () -> open(client, new Inbox()));
  }
}
