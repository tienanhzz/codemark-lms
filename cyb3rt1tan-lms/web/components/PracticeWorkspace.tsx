'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';
import { AnswerQuestion } from './AssessmentWorkspace';

type PracticeQuestion = { questionVersionId: string; questionType: string; title: string; prompt: string; content: Record<string, unknown> };
type PracticeResult = { attemptId: string; score: number; maxPoints: number; isCorrect: boolean };
type PracticeHistoryItem = { attemptId: string; questionVersionId: string; score: number; maxPoints: number; createdAt: string };

export function PracticeWorkspace({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [history, setHistory] = useState<PracticeHistoryItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<unknown>();
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadPractice = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setIndex(0); setAnswer(undefined); setResult(null);
    try {
      const [questionResult, historyResult] = await Promise.all([
        api<{ items: PracticeQuestion[] }>(`/courses/${id}/practice/questions?pageSize=100`),
        api<{ items: PracticeHistoryItem[] }>(`/courses/${id}/practice/history?pageSize=10`),
      ]);
      setQuestions(questionResult.items);
      setHistory(historyResult.items);
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((response) => {
      const visible = response.items.filter((course) => course.permissions.includes('course.read'));
      if (!cancelled) { setCourses(visible); if (visible[0]) setCourseId(visible[0].id); else setLoading(false); }
    }).catch((problem) => { if (!cancelled) { setError(courseError(problem, locale)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [locale]);
  useEffect(() => { void loadPractice(courseId); }, [courseId, loadPractice]);

  async function submit() {
    const question = questions[index];
    if (!question || answer === undefined) return;
    setBusy(true); setError('');
    try {
      const response = await api<PracticeResult>(`/courses/${courseId}/practice/attempts`, 'POST', {
        questionVersionId: question.questionVersionId, answer,
      });
      setResult(response);
      const latest = await api<{ items: PracticeHistoryItem[] }>(`/courses/${courseId}/practice/history?pageSize=10`);
      setHistory(latest.items);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  function next() { setIndex((value) => (value + 1) % Math.max(questions.length, 1)); setAnswer(undefined); setResult(null); }
  const question = questions[index];
  return <section className="panel practice-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-029</p><h2>{t('Practice', 'Luyện tập')}</h2><p>{t('Your answers are scored by the server and saved in your practice history.', 'Câu trả lời được máy chủ chấm và lưu vào lịch sử luyện tập.')}</p></div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {courses.length > 0 && <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}</select></label>}
    {loading ? <p role="status">{t('Loading practice questions…', 'Đang tải câu hỏi luyện tập…')}</p> : !question ? <p className="course-empty">{t('No objective practice questions are published for this course.', 'Khóa học chưa có câu hỏi luyện tập khách quan đã công bố.')}</p> : <div className="practice-card">
      <p className="practice-progress">{t('Question', 'Câu hỏi')} {index + 1} / {questions.length}</p>
      <AnswerQuestion question={{ ...question, points: 1 }} value={answer} onChange={setAnswer} locale={locale} readOnly={Boolean(result)} />
      {result && <div className={result.isCorrect ? 'alert alert-success' : 'alert alert-error'} role="status">{result.isCorrect ? t('Correct', 'Chính xác') : t('Not correct yet', 'Chưa chính xác')} · {result.score} / {result.maxPoints} {t('points', 'điểm')}</div>}
      <div className="practice-actions">{result ? <button className="button primary" onClick={next}>{t('Next question', 'Câu tiếp theo')}</button> : <button className="button primary" disabled={busy || answer === undefined} onClick={() => void submit()}>{busy ? t('Checking…', 'Đang chấm…') : t('Check answer', 'Kiểm tra đáp án')}</button>}</div>
    </div>}
    <div className="practice-history"><h3>{t('Recent practice', 'Luyện tập gần đây')}</h3>{history.length === 0 ? <p className="course-empty">{t('Your attempts will appear here.', 'Các lần làm sẽ hiện ở đây.')}</p> : <ul>{history.map((item) => <li key={item.attemptId}><span>{new Date(item.createdAt).toLocaleString(locale)}</span><strong>{item.score} / {item.maxPoints}</strong></li>)}</ul>}</div>
  </section>;
}
