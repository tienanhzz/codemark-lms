'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';

type Question = { questionVersionId: string; questionType: string; title: string; prompt: string; content: Record<string, unknown>; points: number; childQuestions?: Question[] };
type PublishedAssessment = { id: string; courseId: string; kind: string; title: string; instructions: string; status: string; version: number; opensAt: string | null; closesAt: string | null; durationMinutes: number | null; questionCount: number; totalPoints: number; questionItems?: Question[] };
type Attempt = { attemptId: string; attemptNumber: number; status: string; revision: number; deadline: string | null; answers: Record<string, unknown>; assessment: PublishedAssessment };
type AssessmentListItem = PublishedAssessment;
type ReleasedGrade = { attemptId: string; title: string; kind: string; revision: number; score: number; grossScore: number; maxPoints: number; penaltyPercent: number; releasedAt: string; breakdown: { questionVersionId: string; score: number; maxPoints: number; feedback?: string }[] };

export function AnswerQuestion({ question, value, onChange, locale, readOnly }: { question: Question; value: unknown; onChange: (value: unknown) => void; locale: Locale; readOnly?: boolean }) {
  const t = translate(locale);
  const content = question.content;
  const choices = Array.isArray(content.choices) ? content.choices as { choiceId: string; text: string }[] : [];
  const options = Array.isArray(content.items) ? content.items as { itemId: string; text: string }[] : [];
  const leftItems = Array.isArray(content.leftItems) ? content.leftItems as { itemId: string; text: string }[] : [];
  const rightItems = Array.isArray(content.rightItems) ? content.rightItems as { itemId: string; text: string }[] : [];
  const childValue = (questionId: string) => value && typeof value === 'object' ? (value as Record<string, unknown>)[questionId] : undefined;
  const setChild = (key: string, next: unknown) => onChange({ ...(value && typeof value === 'object' ? value as Record<string, unknown> : {}), [key]: next });
  return <fieldset className="assessment-question">
    <legend><strong>{question.title}</strong><span>{question.points ?? 1} {t('points', 'điểm')}</span></legend>
    {question.prompt && <p>{question.prompt}</p>}
    {question.questionType === 'multipleChoice' && choices.map((choice) => <label className="assessment-answer-option" key={choice.choiceId}><input type="radio" disabled={readOnly} name={question.questionVersionId} checked={value === choice.choiceId} onChange={() => onChange(choice.choiceId)} />{choice.text}</label>)}
    {question.questionType === 'multipleSelect' && choices.map((choice) => { const selected = Array.isArray(value) ? value as string[] : []; return <label className="assessment-answer-option" key={choice.choiceId}><input type="checkbox" disabled={readOnly} checked={selected.includes(choice.choiceId)} onChange={(event) => onChange(event.target.checked ? [...selected, choice.choiceId] : selected.filter((id) => id !== choice.choiceId))} />{choice.text}</label>; })}
    {['shortAnswer', 'sentenceRewriting'].includes(question.questionType) && <label className="course-field"><span>{t('Your answer', 'Câu trả lời')}</span><input disabled={readOnly} maxLength={4000} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} /></label>}
    {question.questionType === 'writing' && <label className="course-field"><span>{t('Your response', 'Bài làm')}</span><textarea disabled={readOnly} rows={8} maxLength={Number(content.maximumResponseLength) || 4000} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} /></label>}
    {question.questionType === 'trueFalseNotGiven' && <label className="course-field"><span>{t('Choose an answer', 'Chọn câu trả lời')}</span><select disabled={readOnly} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}><option value="">{t('Select…', 'Chọn…')}</option>{[['true', 'True', 'Đúng'], ['false', 'False', 'Sai'], ['notGiven', 'Not given', 'Không có thông tin']].map(([id, en, vi]) => <option key={id} value={id}>{locale === 'vi' ? vi : en}</option>)}</select></label>}
    {question.questionType === 'fillInTheBlank' && Array.isArray(content.blankIds) && (content.blankIds as string[]).map((id) => <label className="course-field" key={id}><span>{t('Blank', 'Chỗ trống')} {id}</span><input disabled={readOnly} maxLength={1000} value={typeof childValue(id) === 'string' ? childValue(id) as string : ''} onChange={(event) => setChild(id, event.target.value)} /></label>)}
    {question.questionType === 'ordering' && options.length > 0 && <ol className="assessment-order-list">{options.map((item, index) => <li key={item.itemId}><label className="course-field"><span>{t('Position', 'Vị trí')} {index + 1}</span><select disabled={readOnly} value={Array.isArray(value) ? (value as string[])[index] || '' : ''} onChange={(event) => { const next = Array.isArray(value) ? [...value as string[]] : Array(options.length).fill(''); next[index] = event.target.value; onChange(next); }}><option value="">{t('Select item…', 'Chọn mục…')}</option>{options.map((option) => <option key={option.itemId} value={option.itemId}>{option.text}</option>)}</select></label></li>)}</ol>}
    {question.questionType === 'matching' && leftItems.map((left) => <label className="course-field" key={left.itemId}><span>{left.text}</span><select disabled={readOnly} value={typeof childValue(left.itemId) === 'string' ? childValue(left.itemId) as string : ''} onChange={(event) => setChild(left.itemId, event.target.value)}><option value="">{t('Select match…', 'Chọn cặp…')}</option>{rightItems.map((right) => <option key={right.itemId} value={right.itemId}>{right.text}</option>)}</select></label>)}
    {question.questionType === 'readingSet' && typeof content.passage === 'string' && <div className="assessment-passage">{content.passage}</div>}
    {question.questionType === 'listeningSet' && typeof content.audioAssetId === 'string' && <audio controls preload="none" src={`/v1/question-assets/${content.audioAssetId}`}>{t('Audio is unavailable.', 'Không thể phát âm thanh.')}</audio>}
    {question.childQuestions?.map((child) => <AnswerQuestion key={child.questionVersionId} question={child} value={childValue(child.questionVersionId)} onChange={(next) => setChild(child.questionVersionId, next)} locale={locale} readOnly={readOnly} />)}
    {question.questionType === 'code' && <p className="alert alert-error">{t('Code questions are not available for delivery.', 'Câu hỏi lập trình chưa được mở để làm bài.')}</p>}
  </fieldset>;
}

export function AssessmentWorkspace({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [releasedGrades, setReleasedGrades] = useState<ReleasedGrade[] | null>(null);
  const [gradesLoading, setGradesLoading] = useState(false);
  const generation = useRef(0);

  const loadAssessments = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const result = await api<{ items: AssessmentListItem[] }>(`/courses/${id}/assessments`);
      setAssessments(result.items);
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
      const visible = result.items.filter((course) => course.permissions.includes('course.read'));
      if (!cancelled) { setCourses(visible); if (visible[0]) setCourseId(visible[0].id); else setLoading(false); }
    }).catch((problem) => { if (!cancelled) { setError(courseError(problem, locale)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [locale]);
  useEffect(() => { void loadAssessments(courseId); }, [courseId, loadAssessments]);

  useEffect(() => {
    if (!attempt || attempt.status !== 'inProgress' || !dirty) return;
    const attemptSnapshot = attempt;
    const answerSnapshot = attempt.answers;
    const saveGeneration = generation.current;
    const timer = window.setTimeout(() => {
      setSaveState('saving');
      void api<Attempt>(`/courses/${courseId}/assessments/${attemptSnapshot.assessment.id}/attempts/${attemptSnapshot.attemptId}/answers`, 'PUT', { answers: answerSnapshot }, { 'If-Match': `"${attemptSnapshot.revision}"` })
        .then((result) => {
          setAttempt((current) => current?.attemptId === result.attemptId ? { ...result, answers: generation.current === saveGeneration ? result.answers : current.answers } : current);
          if (generation.current === saveGeneration) { setDirty(false); setSaveState('saved'); }
        })
        .catch((problem) => { setError(courseError(problem, locale)); setSaveState('unsaved'); });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [attempt, courseId, dirty, locale]);

  async function start(item: PublishedAssessment) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api<Attempt>(`/courses/${courseId}/assessments/${item.id}/attempts`, 'POST');
      setAttempt(result); setDirty(false); setSaveState('saved');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  function setAnswer(questionId: string, answer: unknown) {
    generation.current += 1;
    setAttempt((current) => current ? { ...current, answers: { ...current.answers, [questionId]: answer } } : current);
    setDirty(true); setSaveState('unsaved');
  }
  async function submit() {
    if (!attempt) return;
    setBusy(true); setError('');
    try {
      const result = await api<Attempt>(`/courses/${courseId}/assessments/${attempt.assessment.id}/attempts/${attempt.attemptId}/submit`, 'POST', undefined, { 'If-Match': `"${attempt.revision}"` });
      setAttempt(result); setDirty(false); setSaveState('saved');
      setNotice(result.status === 'forceSubmitted' ? t('The deadline passed and your saved answers were submitted.', 'Đã quá hạn; hệ thống đã nộp các câu trả lời đã lưu.') : t('Your attempt was submitted.', 'Bài làm đã được nộp.'));
      await loadAssessments(courseId);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  const displayedAttempt = attempt?.assessment.courseId === courseId ? attempt : null;
  async function loadReleasedGrades() {
    setGradesLoading(true);
    try {
      const result = await api<{ items: ReleasedGrade[] }>(`/courses/${courseId}/released-grades`);
      setReleasedGrades(result.items);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setGradesLoading(false); }
  }
  return <section className="panel assessment-workspace">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-029</p><h2>{t('Assignments and assessments', 'Bài tập và bài kiểm tra')}</h2><p>{t('Your work is saved to your account and can be resumed on another session.', 'Bài làm được lưu vào tài khoản và có thể tiếp tục ở phiên khác.')}</p></div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {courses.length > 0 && <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setAttempt(null); }}>
      {courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}
    </select></label>}
    {courses.length > 0 && <section className="released-grades"><div className="assessment-attempt-heading"><h3>{t('Released grades', 'Điểm đã công bố')}</h3><button type="button" className="button secondary" disabled={gradesLoading} onClick={() => void loadReleasedGrades()}>{gradesLoading ? t('Loading…', 'Đang tải…') : t('View released grades', 'Xem điểm')}</button></div>{releasedGrades && (releasedGrades.length ? <div className="assessment-list">{releasedGrades.map((grade) => <details className="released-grade" key={grade.attemptId}><summary><strong>{grade.title}</strong><span>{grade.score} / {grade.maxPoints} · {grade.penaltyPercent}% {t('late deduction', 'trừ muộn')}</span></summary><small>{t('Released', 'Công bố lúc')} {new Date(grade.releasedAt).toLocaleString(locale)}</small>{grade.breakdown.map((item) => <div className="released-grade-item" key={item.questionVersionId}><span>{item.score} / {item.maxPoints}</span>{item.feedback && <p>{item.feedback}</p>}</div>)}</details>)}</div> : <p className="course-empty">{t('No grades have been released yet.', 'Chưa có điểm được công bố.')}</p>)}</section>}
    {!displayedAttempt && (loading ? <p role="status">{t('Loading assignments…', 'Đang tải bài tập…')}</p> : assessments.length === 0 ? <p className="course-empty">{t('No assigned work is available yet.', 'Hiện chưa có bài được giao.')}</p> : <div className="assessment-list">{assessments.map((item) => <article className="assessment-row" key={item.id}>
      <div><strong>{item.title}</strong><span>{item.kind} · v{item.version} · {item.questionCount} {t('questions', 'câu hỏi')} · {item.totalPoints} {t('points', 'điểm')}</span>{item.closesAt && <small>{t('Closes', 'Đóng')}: {new Date(item.closesAt).toLocaleString(locale)}</small>}</div>
      <button className="button primary" type="button" disabled={busy} onClick={() => void start(item)}>{t('Start or resume', 'Bắt đầu hoặc tiếp tục')}</button>
    </article>)}</div>)}
    {displayedAttempt && <div className="assessment-attempt">
      <div className="assessment-attempt-heading"><div><h3>{displayedAttempt.assessment.title}</h3><p>{displayedAttempt.assessment.instructions}</p><span>{t('Attempt', 'Lần làm')} {displayedAttempt.attemptNumber} · {displayedAttempt.status}</span></div>{displayedAttempt.deadline && <time dateTime={displayedAttempt.deadline}>{t('Deadline', 'Hạn chót')}: {new Date(displayedAttempt.deadline).toLocaleString(locale)}</time>}</div>
      {(displayedAttempt.assessment.questionItems || []).map((question) => <AnswerQuestion key={question.questionVersionId} question={question} value={displayedAttempt.answers[question.questionVersionId]} onChange={(value) => setAnswer(question.questionVersionId, value)} locale={locale} readOnly={displayedAttempt.status !== 'inProgress'} />)}
      <div className="assessment-submit-row"><span role="status">{saveState === 'saving' ? t('Saving…', 'Đang lưu…') : saveState === 'unsaved' ? t('Unsaved changes', 'Thay đổi chưa lưu') : t('All changes saved', 'Đã lưu thay đổi')}</span>
        {displayedAttempt.status === 'inProgress' && <button className="button primary" type="button" disabled={busy || dirty || saveState !== 'saved'} onClick={() => void submit()}>{busy ? t('Submitting…', 'Đang nộp…') : t('Submit attempt', 'Nộp bài')}</button>}
        {displayedAttempt.status !== 'inProgress' && <button className="button secondary" type="button" onClick={() => setAttempt(null)}>{t('Back to assignments', 'Quay lại danh sách')}</button>}
      </div>
    </div>}
  </section>;
}
