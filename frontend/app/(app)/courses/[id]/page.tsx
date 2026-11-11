"use client";
import { useI18n } from "../../../../components/LanguageProvider";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../../../../lib/api";
import { formatDate } from "../../../../lib/format";
import type { Course } from "../../../../lib/types";
import { useAuth } from "../../../../components/AuthProvider";
import {
  Alert,
  Badge,
  PageHeader,
  Spinner,
  Tabs,
} from "../../../../components/ui";
import { AnnouncementsTab } from "../../../../components/course/AnnouncementsTab";
import { AssessmentsTab } from "../../../../components/course/AssessmentsTab";
import { AttendanceTab } from "../../../../components/course/AttendanceTab";
import { CourseOverview } from "../../../../components/course/CourseOverview";
import { DiscussionsTab } from "../../../../components/course/DiscussionsTab";
import { GradebookTab } from "../../../../components/course/GradebookTab";
import { LeaveTab } from "../../../../components/course/LeaveTab";
import { LessonsTab } from "../../../../components/course/LessonsTab";
import { RosterTab } from "../../../../components/course/RosterTab";
import { QuizLinksTab } from "../../../../components/course/QuizLinksTab";
import { isStaff } from "../../../../components/course/types";

export default function CoursePage() {
  const { tr, locale } = useI18n();
  const params = useParams<{ id: string }>();
  const courseId = Number(params.id);
  const { user } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  const load = useCallback(async () => {
    try {
      const data = await api<Course>(`/api/courses/${courseId}`);
      setCourse(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Spinner label={tr("Đang tải lớp học…")} />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!course || !user) return null;

  const staff = isStaff(course.role);
  const tabs = [
    { id: "quiz-links", label: tr("Quiz link"), icon: "fa-link" },
    { id: "overview", label: tr("Tổng quan"), icon: "fa-circle-info" },
    { id: "lessons", label: tr("Bài học"), icon: "fa-book" },
    { id: "announcements", label: tr("Thông báo"), icon: "fa-bullhorn" },
    { id: "discussions", label: tr("Thảo luận"), icon: "fa-comments" },
    { id: "assessments", label: tr("Bài tập và bài thi"), icon: "fa-file-signature" },
    { id: "attendance", label: tr("Điểm danh"), icon: "fa-qrcode" },
    { id: "leave", label: tr("Nghỉ phép"), icon: "fa-envelope-open-text" },
    ...(staff
      ? [
          { id: "roster", label: tr("Thành viên"), icon: "fa-users" },
          { id: "gradebook", label: tr("Bảng điểm"), icon: "fa-table-list" },
        ]
      : []),
  ];

  const props = { course, role: course.role, user, refreshCourse: load };

  return (
    <div>
      <div className="mb-3">
        <Link href="/courses" className="text-xs font-medium text-slate-500 hover:text-teal-700">
          <i className="fa-solid fa-arrow-left mr-1" />{" " + tr("Tất cả lớp học")}</Link>
      </div>
      <PageHeader
        icon="fa-book-open"
        title={`${course.code} — ${course.title}`}
        description={tr("{0} · {1} to {2} · Owner: {3}", { 0: (course.term), 1: (formatDate(course.startDate, locale)), 2: (formatDate(
          course.endDate, locale,
        )), 3: (course.owner?.name || "—") })}
        actions={
          <>
            <Badge tone={course.role === "teacher" ? "teacher" : course.role || "student"}>
              {course.role}
            </Badge>
            {course.published ? (
              <Badge tone="published">{tr("Đã công bố")}</Badge>
            ) : (
              <Badge tone="draft">{tr("Bản nháp")}</Badge>
            )}
          </>
        }
      />
      <div className="mb-4 overflow-x-auto">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>
      <div className="mt-4">
        {tab === "quiz-links" && <QuizLinksTab {...props} />}
        {tab === "overview" && <CourseOverview {...props} />}
        {tab === "lessons" && <LessonsTab {...props} />}
        {tab === "announcements" && <AnnouncementsTab {...props} />}
        {tab === "discussions" && <DiscussionsTab {...props} />}
        {tab === "assessments" && <AssessmentsTab {...props} />}
        {tab === "attendance" && <AttendanceTab {...props} />}
        {tab === "leave" && <LeaveTab {...props} />}
        {tab === "roster" && staff && <RosterTab {...props} />}
        {tab === "gradebook" && staff && <GradebookTab {...props} />}
      </div>
    </div>
  );
}
