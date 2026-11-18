'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';

type Tag = { id: string; names: Record<string, string>; status: string; selectable: boolean; applicability: string[] };
type Selection = { mode: 'manual' } | { mode: 'tags'; tagIds: string[]; match: 'any' | 'all' };
type Question = { questionVersionId: string; title: string; questionType: string; usageTypes: string[]; status: string };
type Assessment = { id: string; kind: 'assignment' | 'exam'; status: string; version: number; draft: null | { title: string; instructions: string; status: string; selection?: Selection; questionItems: { questionVersionId: string; title: string; points: number }[] } };

export function AssessmentBuilder({ locale }: { locale: Locale }) {
  const t = translate(locale);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseId, setCourseId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [kind, setKind] = useState<'assignment' | 'exam'>('exam');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState<'manual' | 'tags'>('manual');
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagMatch, setTagMatch] = useState<'any' | 'all'>('any');
  const [duration, setDuration] = useState('60');
  const [attemptLimit, setAttemptLimit] = useState('1');
  const [lateTiers, setLateTiers] = useState<{ afterMinutes: string; penaltyPercent: string }[]>([{ afterMinutes: '', penaltyPercent: '' }]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCourseData = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [questionResult, assessmentResult] = await Promise.all([
        api<{ items: Question[] }>(`/courses/${id}/questions?status=published&pageSize=100`),
        api<{ items: Assessment[] }>(`/courses/${id}/assessments`),
      ]);
      setQuestions(questionResult.items.filter((item) => item.status === 'published' && item.questionType !== 'code'));
      setAssessments(assessmentResult.items);
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void api<{ items: Course[] }>('/courses?pageSize=100').then((result) => {
      if (!cancelled) {
        const editable = result.items.filter((course) => course.permissions.includes('assessment.manage'));
        setCourses(editable);
        if (editable[0]) setCourseId(editable[0].id);
        else setLoading(false);
      }
    }).catch((problem) => { if (!cancelled) { setError(courseError(problem, locale)); setLoading(false); } });
    return () => { cancelled = true; };
  }, [locale]);
  useEffect(() => { void loadCourseData(courseId); }, [courseId, loadCourseData]);

  useEffect(() => {
    if (selectionMode !== 'tags') return;
    let cancelled = false;
    void api<{ tags: Tag[] }>('/question-taxonomy').then((catalog) => {
      if (!cancelled) setTags(catalog.tags.filter((tag) => tag.status === 'active' && tag.selectable && (!tag.applicability.length || tag.applicability.some((type) => type !== 'code'))));
    }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    return () => { cancelled = true; };
  }, [selectionMode, locale]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!courseId || (selectionMode === 'manual' ? questionIds.length === 0 : tagIds.length === 0)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/courses/${courseId}/assessments`, 'POST', {
        kind, title, instructions, timezone: courses.find((item) => item.id === courseId)?.timezone || 'Asia/Bangkok',
        durationMinutes: duration ? Number(duration) : null, attemptLimit: Number(attemptLimit),
        ...(selectionMode === 'tags' ? { selection: { mode: 'tags', tagIds, match: tagMatch } } : { questionVersionIds: questionIds }),
        latePenaltyTiers: kind === 'assignment' ? lateTiers.filter((tier) => tier.afterMinutes && tier.penaltyPercent).map((tier) => ({ afterMinutes: Number(tier.afterMinutes), penaltyPercent: Number(tier.penaltyPercent) })) : [],
      });
      setTitle(''); setInstructions(''); setQuestionIds([]); setTagIds([]);
      setNotice(t('Draft saved. Review it before publishing.', 'Đã lưu bản nháp. Hãy kiểm tra trước khi công bố.'));
      await loadCourseData(courseId);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }

  async function publish(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/courses/${courseId}/assessments/${id}/publish`, 'POST');
      setNotice(t('Published version is now fixed. A revision creates a new version.', 'Phiên bản đã công bố được cố định. Chỉnh sửa sẽ tạo phiên bản mới.'));
      await loadCourseData(courseId);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }

  const available = questions.filter((item) => item.usageTypes.includes(kind === 'assignment' ? 'practical' : 'exam'));
  return <section className="panel assessment-builder">
    <div className="panel-heading"><div><p className="eyebrow">BUILD-029</p><h2>{t('Assessment authoring', 'Soạn bài kiểm tra')}</h2><p>{t('Build an assignment or exam from published question versions.', 'Tạo bài tập hoặc bài kiểm tra từ các phiên bản câu hỏi đã công bố.')}</p></div></div>
    {error && <div className="alert alert-error" role="alert">{error}</div>}
    {notice && <div className="alert alert-success" role="status">{notice}</div>}
    {courses.length > 0 && <label className="course-field"><span>{t('Course', 'Khóa học')}</span><select value={courseId} onChange={(event) => { setCourseId(event.target.value); setQuestionIds([]); }}>
      {courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}
    </select></label>}
    {!loading && courses.length === 0 && <p className="course-empty">{t('You do not have assessment authoring access to a course.', 'Bạn chưa có quyền soạn bài kiểm tra trong khóa học nào.')}</p>}
    {courses.length > 0 && <>
      <form className="assessment-form" onSubmit={create}>
        <div className="assessment-fields">
          <label className="course-field"><span>{t('Type', 'Loại bài')}</span><select value={kind} onChange={(event) => { setKind(event.target.value as typeof kind); setQuestionIds([]); }}><option value="exam">{t('Exam', 'Bài kiểm tra')}</option><option value="assignment">{t('Assignment', 'Bài tập')}</option></select></label>
          <label className="course-field"><span>{t('Title', 'Tiêu đề')}</span><input required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="course-field"><span>{t('Duration (minutes)', 'Thời lượng (phút)')}</span><input type="number" min={1} max={1440} value={duration} onChange={(event) => setDuration(event.target.value)} /></label>
          <label className="course-field"><span>{t('Attempt limit', 'Số lần làm tối đa')}</span><input type="number" min={1} max={20} required value={attemptLimit} onChange={(event) => setAttemptLimit(event.target.value)} /></label>
        </div>
        <label className="course-field"><span>{t('Instructions', 'Hướng dẫn')}</span><textarea maxLength={10000} rows={3} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label>
        {kind === 'assignment' && <fieldset className="assessment-late-policy"><legend>{t('Late penalty tiers', 'Mức trừ điểm nộp muộn')}</legend><p>{t('Deduct a percentage from the grade after the stated number of minutes late.', 'Trừ phần trăm điểm sau số phút trễ được đặt.')}</p>
          {lateTiers.map((tier, index) => <div className="assessment-late-tier" key={index}>
            <label className="course-field"><span>{t('After minutes late', 'Số phút trễ')}</span><input type="number" min={1} max={43200} value={tier.afterMinutes} onChange={(event) => setLateTiers((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, afterMinutes: event.target.value } : row))} /></label>
            <label className="course-field"><span>{t('Penalty percent', 'Phần trăm trừ')}</span><input type="number" min={0} max={100} step="0.1" value={tier.penaltyPercent} onChange={(event) => setLateTiers((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, penaltyPercent: event.target.value } : row))} /></label>
            {lateTiers.length > 1 && <button className="button secondary" type="button" onClick={() => setLateTiers((current) => current.filter((_, rowIndex) => rowIndex !== index))}>{t('Remove tier', 'Xóa mức')}</button>}
          </div>)}
          <button className="button secondary" type="button" onClick={() => setLateTiers((current) => [...current, { afterMinutes: '', penaltyPercent: '' }])}>{t('Add penalty tier', 'Thêm mức trừ')}</button>
        </fieldset>}
        <label className="course-field"><span>{t('Question selection', 'Chọn câu hỏi')}</span><select value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as typeof selectionMode)}><option value="manual">{t('Choose manually', 'Chọn thủ công')}</option><option value="tags">{t('Filter by tags', 'Lọc theo thẻ')}</option></select></label>
        {selectionMode === 'tags' ? <fieldset className="assessment-question-picker"><legend>{t('Tag filters', 'Lọc thẻ')}</legend>
          <p>{t('Tags match directly; child tags are not included. Eligible questions are fixed when you publish.', 'Khớp thẻ trực tiếp; không bao gồm thẻ con. Câu hỏi phù hợp được cố định khi công bố.')}</p>
          <label className="course-field"><span>{t('Tag matching', 'Cách khớp thẻ')}</span><select value={tagMatch} onChange={(event) => setTagMatch(event.target.value as typeof tagMatch)}><option value="any">{t('Any selected tag', 'Bất kỳ thẻ đã chọn')}</option><option value="all">{t('All selected tags', 'Tất cả thẻ đã chọn')}</option></select></label>
          {tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={(event) => setTagIds((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} /><span>{tag.names[locale] || tag.names.en || tag.id}</span></label>)}
        </fieldset> : <fieldset className="assessment-question-picker"><legend>{t('Eligible published questions', 'Câu hỏi đã công bố phù hợp')}</legend>
          {available.length === 0 ? <p className="course-empty">{t('No eligible published questions for this type yet.', 'Chưa có câu hỏi đã công bố phù hợp với loại bài này.')}</p> : available.map((question) => <label key={question.questionVersionId}>
            <input type="checkbox" checked={questionIds.includes(question.questionVersionId)} onChange={(event) => setQuestionIds((current) => event.target.checked ? [...current, question.questionVersionId] : current.filter((id) => id !== question.questionVersionId))} />
            <span><strong>{question.title}</strong><small>{question.questionType} · {question.questionVersionId.slice(0, 8)}</small></span>
          </label>)}
        </fieldset>}
        <button className="button primary" type="submit" disabled={busy || !title.trim() || (selectionMode === 'manual' ? questionIds.length === 0 : tagIds.length === 0)}>{busy ? t('Saving…', 'Đang lưu…') : t('Save draft', 'Lưu bản nháp')}</button>
      </form>
      <div className="assessment-list"><h3>{t('Course assessments', 'Bài đã soạn')}</h3>
        {loading ? <p role="status">{t('Loading assessments…', 'Đang tải bài kiểm tra…')}</p> : assessments.length === 0 ? <p className="course-empty">{t('No assessments yet.', 'Chưa có bài kiểm tra nào.')}</p> : assessments.map((item) => <article className="assessment-row" key={item.id}>
          <div><strong>{item.draft?.title || item.kind}</strong><span>{item.kind} · v{item.version} · {item.status} · {item.draft?.selection?.mode === 'tags' && item.draft.status === 'draft' ? t('Resolved when published', 'Xác định khi công bố') : `${item.draft?.questionItems.length ?? 0} ${t('questions', 'câu hỏi')}`}</span></div>
          {item.status === 'draft' && <button className="button secondary" type="button" disabled={busy} onClick={() => void publish(item.id)}>{t('Publish', 'Công bố')}</button>}
        </article>)}
      </div>
    </>}
  </section>;
}
