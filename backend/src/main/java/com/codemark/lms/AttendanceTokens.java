package com.codemark.lms;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
class AttendanceTokens {
  private final byte[] key;
  private final ObjectMapper json;
  private final SecureRandom random = new SecureRandom();

  AttendanceTokens(ObjectMapper json, @Value("${codemark.token-key}") String encoded)
      throws Exception {
    this.json = json;
    if (!encoded.isBlank()) key = Base64.getUrlDecoder().decode(encoded);
    else {
      Path path = Path.of("instance", "attendance.key");
      Files.createDirectories(path.getParent());
      if (Files.notExists(path)) {
        byte[] generated = new byte[32];
        random.nextBytes(generated);
        Files.write(path, generated, StandardOpenOption.CREATE_NEW);
      }
      key = Files.readAllBytes(path);
    }
    if (key.length != 32)
      throw new IllegalStateException(
          "TOKEN_ENCRYPTION_KEY must be base64url for exactly 32 bytes");
  }

  String issue(AttendanceSession session) {
    try {
      byte[] nonce = new byte[12];
      random.nextBytes(nonce);
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
      cipher.updateAAD("attendance:v1".getBytes(StandardCharsets.UTF_8));
      byte[] encrypted =
          cipher.doFinal(
              json.writeValueAsBytes(
                  Api.map(
                      "sessionId",
                      session.id,
                      "courseId",
                      session.course.id,
                      "expiresAt",
                      Instant.now().plusSeconds(30).getEpochSecond())));
      byte[] payload = new byte[nonce.length + encrypted.length];
      System.arraycopy(nonce, 0, payload, 0, nonce.length);
      System.arraycopy(encrypted, 0, payload, nonce.length, encrypted.length);
      return "v1." + Base64.getUrlEncoder().withoutPadding().encodeToString(payload);
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }

  Map<String, Object> verify(String token) {
    try {
      if (!token.startsWith("v1.")) throw new IllegalArgumentException();
      byte[] raw = Base64.getUrlDecoder().decode(token.substring(3));
      if (raw.length < 28) throw new IllegalArgumentException();
      Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
      cipher.init(
          Cipher.DECRYPT_MODE,
          new SecretKeySpec(key, "AES"),
          new GCMParameterSpec(128, Arrays.copyOf(raw, 12)));
      cipher.updateAAD("attendance:v1".getBytes(StandardCharsets.UTF_8));
      Map<String, Object> payload =
          json.readValue(
              cipher.doFinal(Arrays.copyOfRange(raw, 12, raw.length)), new TypeReference<>() {});
      if (((Number) payload.get("expiresAt")).longValue() < Instant.now().getEpochSecond())
        throw new IllegalArgumentException();
      return payload;
    } catch (Exception e) {
      throw new Api.Failure("invalid_token", 400);
    }
  }
}
