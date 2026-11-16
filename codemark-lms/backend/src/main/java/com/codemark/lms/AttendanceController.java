package com.codemark.lms;

import static com.codemark.lms.Api.*;

import jakarta.servlet.http.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
@Transactional
class AttendanceController {
  private final Store store;
  private final Access access;
  private final Views views;
  private final AttendanceTokens tokens;
  private final Path uploads;
  private final RankService rank;

  AttendanceController(
      Store s, Access a, Views v, AttendanceTokens t, @Value("${codemark.upload-dir}") String dir, RankService rank) {
    store = s;
    access = a;
    views = v;
    tokens = t;
    uploads = Path.of(dir).toAbsolutePath().normalize();
    this.rank = rank;
  }

  Map<String, Object> session(AttendanceSession s, User u, boolean details) {
    boolean staff = !"student".equals(access.role(u, s.course));
    var records = store.list(AttendanceRecord.class, "where e.session=?1", s);
    var d =
        map(
            "id",
            s.id,
            "courseId",
            s.course.id,
            "opensAt",
            s.opensAt,
            "closesAt",
            s.closesAt,
            "subnet",
            s.subnet,
            "active",
            s.active,
            "token",
            staff && s.active && s.closesAt.isAfter(Instant.now()) ? tokens.issue(s) : null,
            "checkedIn",
            records.size(),
            "mine",
            records.stream().anyMatch(x -> x.user.id.equals(u.id)));
    if (staff && details)
      d.put(
          "records",
          records.stream()
              .map(
                  x ->
                      map(
                          "id",
                          x.id,
                          "sessionId",
                          s.id,
                          "user",
                          Views.user(x.user),
                          "ip",
                          x.ip,
                          "checkedInAt",
                          x.checkedInAt))
              .toList());
    return d;
  }

  @GetMapping("/courses/{id}/attendance-sessions")
  Object list(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Course c = access.course(u, id, false);
    return map(
        "sessions",
        store.list(AttendanceSession.class, "where e.course=?1 order by e.id desc", c).stream()
            .map(s -> session(s, u, false))
            .toList());
  }

  @PostMapping("/courses/{id}/attendance-sessions")
  @ResponseStatus(HttpStatus.CREATED)
  Object open(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    AttendanceSession s = new AttendanceSession();
    s.course = access.course(u, id, true);
    s.openedBy = u;
    s.closesAt = Instant.now().plusSeconds(integer(b, "durationMinutes", 15, 1, 240) * 60L);
    s.subnet = text(b, "subnet", null);
    if (s.subnet != null && !s.subnet.isBlank())
      require(Access.inNetwork(s.subnet.split("/")[0], s.subnet), "invalid_network", 400);
    store.save(s);
    access.audit(u, "attendance_opened", r.getRemoteAddr(), "sessionId", s.id);
    return session(s, u, true);
  }

  @GetMapping("/attendance-sessions/{id}")
  Object get(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    AttendanceSession s = store.get(AttendanceSession.class, id);
    access.course(u, s.course.id, false);
    return session(s, u, true);
  }

  @PostMapping("/attendance-sessions/{id}/token")
  Object token(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    AttendanceSession s = store.get(AttendanceSession.class, id);
    access.course(u, s.course.id, true);
    require(s.active && s.closesAt.isAfter(Instant.now()), "session_closed", 409);
    return map("token", tokens.issue(s));
  }

  @PostMapping("/attendance-sessions/{id}/close")
  Object close(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    AttendanceSession s = store.get(AttendanceSession.class, id);
    access.course(u, s.course.id, true);
    s.active = false;
    access.audit(u, "attendance_closed", r.getRemoteAddr(), "sessionId", s.id);
    return session(s, u, true);
  }

  @PostMapping("/attendance/check-in")
  @ResponseStatus(HttpStatus.CREATED)
  Object checkin(HttpServletRequest r, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    var payload = tokens.verify(required(b, "token"));
    AttendanceSession s =
        store.get(AttendanceSession.class, ((Number) payload.get("sessionId")).longValue());
    require(
        s.course.id.equals(((Number) payload.get("courseId")).longValue()), "invalid_token", 400);
    require(
        u.role.equals("student") && "student".equals(access.role(u, s.course)), "forbidden", 403);
    require(s.active && s.closesAt.isAfter(Instant.now()), "session_closed", 409);
    require(
        s.subnet == null || s.subnet.isBlank() || Access.inNetwork(r.getRemoteAddr(), s.subnet),
        "network_denied",
        403);
    require(
        store.list(AttendanceRecord.class, "where e.session=?1 and e.user=?2", s, u).isEmpty(),
        "already_checked_in",
        409);
    AttendanceRecord record = new AttendanceRecord();
    record.session = s;
    record.user = u;
    record.ip = r.getRemoteAddr();
    store.save(record);
    if(u.role.equals("student")) rank.awardAction(u,s.course,"attendance",s.id,u,Instant.now());
    access.audit(u, "attendance_checkin", r.getRemoteAddr(), "sessionId", s.id);
    return map(
        "id",
        record.id,
        "sessionId",
        s.id,
        "user",
        Views.user(u),
        "ip",
        record.ip,
        "checkedInAt",
        record.checkedInAt);
  }

  @GetMapping("/courses/{id}/leave-requests")
  Object leaves(HttpServletRequest r, @PathVariable long id) {
    User u = access.current(r);
    Course c = access.course(u, id, false);
    return map(
        "leaveRequests",
        store.list(LeaveRequest.class, "where e.course=?1 order by e.id desc", c).stream()
            .filter(l -> !"student".equals(access.role(u, c)) || l.student.id.equals(u.id))
            .map(views::leave)
            .toList());
  }

  @PostMapping(
      value = "/courses/{id}/leave-requests",
      consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @ResponseStatus(HttpStatus.CREATED)
  Object leave(
      HttpServletRequest r,
      @PathVariable long id,
      @RequestParam String reason,
      @RequestParam(required = false) Long meetingId,
      @RequestParam MultipartFile evidence)
      throws Exception {
    User u = access.current(r);
    Course c = access.course(u, id, false);
    require("student".equals(access.role(u, c)), "only_students_may_request_leave", 403);
    require(!reason.isBlank() && reason.length() <= 20000, "reason_required", 400);
    if (meetingId != null)
      require(store.get(Meeting.class, meetingId).course.id.equals(id), "invalid_meeting", 400);
    require(!evidence.isEmpty(), "evidence_required", 400);
    require(evidence.getSize() <= 5 * 1024 * 1024, "evidence_too_large", 413);
    byte[] bytes = evidence.getBytes();
    String mime = evidence.getContentType();
    String ext;
    if ("application/pdf".equals(mime) && starts(bytes, new byte[] {37, 80, 68, 70})) ext = "pdf";
    else if ("image/png".equals(mime)
        && starts(bytes, new byte[] {(byte) 137, 80, 78, 71, 13, 10, 26, 10})) ext = "png";
    else if ("image/jpeg".equals(mime)
        && starts(bytes, new byte[] {(byte) 255, (byte) 216, (byte) 255})) ext = "jpg";
    else if ("image/webp".equals(mime)
        && bytes.length >= 12
        && new String(bytes, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
        && new String(bytes, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP"))
      ext = "webp";
    else throw new Failure("invalid_evidence_content", 400);
    String filename = UUID.randomUUID() + "." + ext;
    Files.createDirectories(uploads.resolve("leave"));
    Path stored = uploads.resolve("leave").resolve(filename);
    Files.write(stored, bytes, StandardOpenOption.CREATE_NEW);
    // Roll back the filesystem write if the database transaction fails.
    org.springframework.transaction.support.TransactionSynchronizationManager
        .registerSynchronization(
            new org.springframework.transaction.support.TransactionSynchronization() {
              @Override
              public void afterCompletion(int status) {
                if (status != STATUS_COMMITTED)
                  try {
                    Files.deleteIfExists(stored);
                  } catch (Exception ignored) {
                  }
              }
            });
    LeaveRequest l = new LeaveRequest();
    l.course = c;
    l.student = u;
    l.reason = reason;
    l.meetingId = meetingId;
    l.evidenceName =
        Path.of(Objects.requireNonNullElse(evidence.getOriginalFilename(), "evidence." + ext))
            .getFileName()
            .toString();
    l.evidencePath = filename;
    l.evidenceMime = mime;
    l.evidenceSize = bytes.length;
    store.save(l);
    access.audit(u, "leave_requested", r.getRemoteAddr(), "leaveId", l.id);
    return views.leave(l);
  }

  static boolean starts(byte[] data, byte[] prefix) {
    return data.length >= prefix.length
        && Arrays.equals(Arrays.copyOf(data, prefix.length), prefix);
  }

  @PostMapping("/leave-requests/{id}/decision")
  Object decision(HttpServletRequest r, @PathVariable long id, @RequestBody Map<String, Object> b) {
    User u = access.current(r);
    LeaveRequest l = store.get(LeaveRequest.class, id);
    access.course(u, l.course.id, true);
    String status = required(b, "status");
    require(Set.of("approved", "rejected").contains(status), "invalid_status", 400);
    require(l.status.equals("pending"), "already_decided", 409);
    l.status = status;
    l.decidedBy = u;
    l.decidedAt = Instant.now();
    l.decisionNote = text(b, "note", "");
    access.audit(u, "leave_decided", r.getRemoteAddr(), "leaveId", id, "status", status);
    return views.leave(l);
  }

  @GetMapping("/leave-requests/{id}/evidence")
  ResponseEntity<byte[]> evidence(HttpServletRequest r, @PathVariable long id) throws Exception {
    User u = access.current(r);
    LeaveRequest l = store.get(LeaveRequest.class, id);
    access.course(u, l.course.id, false);
    if (!l.student.id.equals(u.id)) access.course(u, l.course.id, true);
    Path file = uploads.resolve("leave").resolve(l.evidencePath).normalize();
    require(
        file.startsWith(uploads.resolve("leave")) && Files.isRegularFile(file), "not_found", 404);
    access.audit(u, "leave_evidence_downloaded", r.getRemoteAddr(), "leaveId", id);
    return ResponseEntity.ok()
        .contentType(MediaType.parseMediaType(l.evidenceMime))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(l.evidenceName, java.nio.charset.StandardCharsets.UTF_8)
                .build()
                .toString())
        .body(Files.readAllBytes(file));
  }
}
