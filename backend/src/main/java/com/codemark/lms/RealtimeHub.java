package com.codemark.lms;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.ConcurrentWebSocketSessionDecorator;

/** Concurrent room registry. No persistence or authorization decisions live here. */
@Component
class RealtimeHub {
  private final ObjectMapper json;
  private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();
  private final Map<String, Set<String>> rooms = new ConcurrentHashMap<>();

  RealtimeHub(ObjectMapper j) {
    json = j;
  }

  void add(WebSocketSession session) {
    sessions.put(session.getId(), new ConcurrentWebSocketSessionDecorator(session, 5000, 65536));
  }

  void join(String id, String room) {
    rooms.computeIfAbsent(room, k -> ConcurrentHashMap.newKeySet()).add(id);
  }

  void remove(String id) {
    sessions.remove(id);
    rooms.values().forEach(s -> s.remove(id));
  }

  void send(String id, String event, Object data) {
    if (org.springframework.transaction.support.TransactionSynchronizationManager
        .isSynchronizationActive()) {
      org.springframework.transaction.support.TransactionSynchronizationManager
          .registerSynchronization(
              new org.springframework.transaction.support.TransactionSynchronization() {
                @Override
                public void afterCommit() {
                  deliver(id, event, data);
                }
              });
    } else deliver(id, event, data);
  }

  private void deliver(String id, String event, Object data) {
    WebSocketSession s = sessions.get(id);
    if (s == null || !s.isOpen()) return;
    try {
      s.sendMessage(
          new TextMessage(json.writeValueAsString(Api.map("event", event, "data", data))));
    } catch (Exception e) {
      remove(id);
      try {
        s.close();
      } catch (Exception ignored) {
      }
    }
  }

  void room(String room, String event, Object data) {
    for (String id : rooms.getOrDefault(room, Set.of())) send(id, event, data);
  }

  void monitor(long assessmentId, String event, Object data) {
    room("monitor:" + assessmentId, event, data);
  }

  void user(long userId, String event, Object data) {
    room("user:" + userId, event, data);
  }
}
