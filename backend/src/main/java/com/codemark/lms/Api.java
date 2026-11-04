package com.codemark.lms;

import java.time.*;
import java.util.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

final class Api {
  private Api() {}

  static Map<String, Object> map(Object... pairs) {
    var result = new LinkedHashMap<String, Object>();
    for (int i = 0; i < pairs.length; i += 2) result.put((String) pairs[i], pairs[i + 1]);
    return result;
  }

  static String text(Map<String, Object> b, String key, String fallback) {
    return b.get(key) == null ? fallback : String.valueOf(b.get(key));
  }

  static String required(Map<String, Object> b, String key) {
    String v = text(b, key, "").trim();
    require(!v.isEmpty() && v.length() <= 20000, key + "_required", 400);
    return v;
  }

  static int integer(Map<String, Object> b, String k, int d, int min, int max) {
    try {
      int v = b.containsKey(k) ? Integer.parseInt(b.get(k).toString()) : d;
      require(v >= min && v <= max, "invalid_" + k, 400);
      return v;
    } catch (NumberFormatException e) {
      throw new Failure("invalid_" + k, 400);
    }
  }

  static boolean bool(Map<String, Object> b, String k, boolean d) {
    if (!b.containsKey(k)) return d;
    require(b.get(k) instanceof Boolean, "invalid_" + k, 400);
    return (Boolean) b.get(k);
  }

  static Instant instant(Map<String, Object> b, String k, Instant d) {
    try {
      return b.containsKey(k) ? OffsetDateTime.parse(b.get(k).toString()).toInstant() : d;
    } catch (RuntimeException e) {
      throw new Failure("invalid_" + k, 400);
    }
  }

  static void require(boolean condition, String error, int status) {
    if (!condition) throw new Failure(error, status);
  }

  static final class Failure extends RuntimeException {
    final int status;

    Failure(String error, int status) {
      super(error);
      this.status = status;
    }
  }
}

@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(Api.Failure.class)
  ResponseEntity<?> failure(Api.Failure e) {
    return ResponseEntity.status(e.status).body(Api.map("error", e.getMessage()));
  }

  @ExceptionHandler({
    IllegalArgumentException.class,
    org.springframework.http.converter.HttpMessageNotReadableException.class
  })
  ResponseEntity<?> invalid(Exception e) {
    return ResponseEntity.badRequest().body(Api.map("error", "invalid_request"));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  ResponseEntity<?> conflict(Exception e) {
    return ResponseEntity.status(409).body(Api.map("error", "conflict"));
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<?> tooLarge(Exception e) {
    return ResponseEntity.status(413).body(Api.map("error", "evidence_too_large"));
  }
}
