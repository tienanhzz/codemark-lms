package com.codemark.lms;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpSession;
import java.util.*;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.server.*;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

@Configuration
@EnableWebSocket
class RealtimeConfig implements WebSocketConfigurer {
  private final RealtimeHub hub;
  private final RealtimeService service;
  private final ObjectMapper json;
  private final List<String> origins;

  RealtimeConfig(RealtimeHub h, RealtimeService s, ObjectMapper j, List<String> allowedOrigins) {
    hub = h;
    service = s;
    json = j;
    origins = allowedOrigins;
  }

  @Override
  public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
    var handshake =
        new HttpSessionHandshakeInterceptor() {
          @Override
          public boolean beforeHandshake(
              ServerHttpRequest req,
              ServerHttpResponse res,
              WebSocketHandler handler,
              Map<String, Object> attrs)
              throws Exception {
            if (!(req instanceof ServletServerHttpRequest servlet)) return false;
            HttpSession session = servlet.getServletRequest().getSession(false);
            if (session == null || session.getAttribute("uid") == null) {
              res.setStatusCode(org.springframework.http.HttpStatus.UNAUTHORIZED);
              return false;
            }
            attrs.put("session", session);
            attrs.put("ip", servlet.getServletRequest().getRemoteAddr());
            return true;
          }
        };
    registry
        .addHandler(
            new TextWebSocketHandler() {
              @Override
              public void afterConnectionEstablished(WebSocketSession s) throws Exception {
                hub.add(s);
                try {
                  service.connect(
                      s.getId(),
                      (HttpSession) s.getAttributes().get("session"),
                      (String) s.getAttributes().get("ip"));
                } catch (RuntimeException e) {
                  hub.remove(s.getId());
                  s.close(CloseStatus.POLICY_VIOLATION);
                }
              }

              @Override
              protected void handleTextMessage(WebSocketSession s, TextMessage text)
                  throws Exception {
                String event = "";
                Map<String, Object> data = Map.of();
                try {
                  Map<String, Object> frame =
                      json.readValue(text.getPayload(), new TypeReference<>() {});
                  event = Api.text(frame, "event", "");
                  Object raw = frame.get("data");
                  if (raw instanceof Map<?, ?>)
                    data = json.convertValue(raw, new TypeReference<>() {});
                  service.message(
                      s.getId(),
                      (HttpSession) s.getAttributes().get("session"),
                      (String) s.getAttributes().get("ip"),
                      event,
                      data);
                } catch (Api.Failure e) {
                  hub.send(
                      s.getId(),
                      event.equals("teacher_action")
                          ? "teacher_action_ack"
                          : event.equals("join_monitor") ? "monitor_denied" : "error",
                      Api.map("ok", false, "action", data.get("action"), "reason", e.getMessage()));
                  if (e.status == 401) {
                    s.close(CloseStatus.POLICY_VIOLATION);
                  }
                } catch (RuntimeException e) {
                  hub.send(s.getId(), "error", Api.map("reason", "invalid_message"));
                }
              }

              @Override
              public void afterConnectionClosed(WebSocketSession s, CloseStatus status) {
                hub.remove(s.getId());
              }
            },
            "/ws")
        .addInterceptors(handshake)
        .setAllowedOrigins(origins.toArray(String[]::new));
  }
}
