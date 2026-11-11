"use client";
import { useI18n } from "../LanguageProvider";

import { useEffect, useState } from "react";
import { api, errorMessage } from "../../lib/api";
import type { User } from "../../lib/types";
import { Alert, Avatar, Card, EmptyState, Spinner } from "../ui";
import { type CourseTabProps } from "./types";

type Gradebook = {
  assessments: Array<{ id: number; title: string; kind: string; published: boolean }>;
  rows: Array<{
    student: User;
    scores: Record<
      string,
      { best: number | null; maxScore: number; attempts: number }
    >;
    attendance: { checkedIn: number; sessions: number };
  }>;
};

export function GradebookTab({ course }: CourseTabProps) {
  const { tr } = useI18n();
  const [data, setData] = useState<Gradebook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Gradebook>(`/api/courses/${course.id}/gradebook`)
      .then(setData)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [course.id]);

  if (loading) return <Spinner label={tr("Đang tạo bảng điểm…")} />;
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return null;

  return (
    <Card
      title={tr("Bảng điểm")}
      subtitle={tr("Điểm cao nhất của từng bài kiểm tra và tổng điểm danh")}
    >
      {data.rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="sticky left-0 bg-white py-2">{tr("Sinh viên")}</th>
                {data.assessments.map((assessment) => (
                  <th key={assessment.id} className="py-2 text-center">
                    <span className="block max-w-28 truncate">{assessment.title}</span>
                    {!assessment.published && (
                      <span className="text-[10px] normal-case text-amber-600">{tr("Bản nháp")}</span>
                    )}
                  </th>
                ))}
                <th className="py-2 text-center">{tr("Điểm danh")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data.rows.map((row) => (
                <tr key={row.student.id}>
                  <td className="sticky left-0 bg-white py-2">
                    <div className="flex items-center gap-2">
                      <Avatar name={row.student.name} role={row.student.role} />
                      <div>
                        <p className="font-medium text-slate-700">{row.student.name}</p>
                        <p className="text-xs text-slate-400">{row.student.studentId}</p>
                      </div>
                    </div>
                  </td>
                  {data.assessments.map((assessment) => {
                    const score = row.scores[String(assessment.id)];
                    return (
                      <td key={assessment.id} className="py-2 text-center">
                        {score?.best === null || score === undefined ? (
                          <span className="text-xs text-slate-300">—</span>
                        ) : (
                          <div>
                            <p className="font-semibold text-slate-700">
                              {score.best} / {score.maxScore}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {score.attempts}{" " + tr("lượt làm(s)")}</p>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 text-center text-xs text-slate-600">
                    {row.attendance.checkedIn} / {row.attendance.sessions}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="fa-table-list" title={tr("Chưa có sinh viên tham gia")} />
      )}
    </Card>
  );
}
