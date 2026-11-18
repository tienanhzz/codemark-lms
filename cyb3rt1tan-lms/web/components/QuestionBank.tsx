'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiQuestionAsset } from '../lib/api';
import { courseError, translate, type Course, type Locale } from '../lib/courseApi';
import { IdentityAlert, Modal } from './IdentityShared';
import { Empty, Field, FormActions } from './CourseShared';

type QuestionType = 'multipleChoice' | 'multipleSelect' | 'shortAnswer' | 'sentenceRewriting' | 'fillInTheBlank' | 'matching' | 'ordering' | 'trueFalseNotGiven' | 'writing' | 'code' | 'readingSet' | 'listeningSet';
type QuestionRow = {
  questionId: string;
  questionVersionId: string;
  versionNumber: number;
  questionType: QuestionType;
  title: string;
  prompt: string;
  categoryId: string;
  difficulty: string;
  language: string;
  usageTypes: string[];
  tags: { id: string; names: Record<string, string> }[];
  content: Record<string, unknown>;
  authoringConfig?: Record<string, unknown> | null;
  status: string;
};
type CatalogNode = { id: string; names: Record<string, string>; status: string; selectable?: boolean };
type Taxonomy = { categories: CatalogNode[]; tags: CatalogNode[] };

const typeOptions: [QuestionType, string, string][] = [
  ['multipleChoice', 'Multiple choice', 'Trắc nghiệm một đáp án'],
  ['multipleSelect', 'Multiple select', 'Trắc nghiệm nhiều đáp án'],
  ['shortAnswer', 'Short answer', 'Trả lời ngắn'],
  ['sentenceRewriting', 'Sentence rewriting', 'Viết lại câu'],
  ['fillInTheBlank', 'Fill in the blank', 'Điền vào chỗ trống'],
  ['matching', 'Matching', 'Nối cặp'],
  ['ordering', 'Ordering', 'Sắp xếp'],
  ['trueFalseNotGiven', 'True / False / Not Given', 'Đúng / Sai / Không có thông tin'],
  ['writing', 'Writing', 'Tự luận'],
  ['code', 'Code', 'Lập trình'],
  ['readingSet', 'Reading set', 'Bài đọc'],
  ['listeningSet', 'Listening set', 'Bài nghe'],
];
const starter = (type: QuestionType) => {
  const pair = (content: object, config: object) => [content, config] as const;
  switch (type) {
    case 'multipleChoice': return pair({ contentType: type, choices: [{ choiceId: 'a', text: 'Answer A' }, { choiceId: 'b', text: 'Answer B' }] }, { configType: type, correctChoiceIds: ['a'] });
    case 'multipleSelect': return pair({ contentType: type, choices: [{ choiceId: 'a', text: 'Answer A' }, { choiceId: 'b', text: 'Answer B' }] }, { configType: type, correctChoiceIds: ['a'], scoringMode: 'allOrNothing' });
    case 'shortAnswer': return pair({ contentType: type }, { configType: type, acceptedAnswers: ['sample answer'], normalization: ['trimWhitespace', 'ignoreCase'] });
    case 'sentenceRewriting': return pair({ contentType: type, sourceText: 'Write the sentence in another way.' }, { configType: type, acceptedAnswers: ['Alternative answer'], normalization: ['trimWhitespace', 'collapseWhitespace', 'ignoreCase'] });
    case 'fillInTheBlank': return pair({ contentType: type, text: 'The answer is ___.', blankIds: ['blank-1'] }, { configType: type, blanks: [{ blankId: 'blank-1', acceptedAnswers: ['sample'], points: 1 }], scoringMode: 'perBlank' });
    case 'matching': return pair({ contentType: type, leftItems: [{ itemId: 'left-1', text: 'Left item' }, { itemId: 'left-2', text: 'Another left item' }], rightItems: [{ itemId: 'right-1', text: 'Right item' }, { itemId: 'right-2', text: 'Another right item' }] }, { configType: type, pairs: [{ leftItemId: 'left-1', rightItemId: 'right-1', points: 1 }], scoringMode: 'perPair' });
    case 'ordering': return pair({ contentType: type, items: [{ itemId: 'first', text: 'First' }, { itemId: 'second', text: 'Second' }] }, { configType: type, correctItemIds: ['first', 'second'], scoringMode: 'perPosition' });
    case 'trueFalseNotGiven': return pair({ contentType: type, statement: 'A statement to assess.' }, { configType: type, correctValue: 'true', explanation: '' });
    case 'writing': return pair({ contentType: type, responseMode: 'plainText', maximumResponseLength: 4000 }, { configType: type, rubric: { rubricId: 'writing-rubric', version: 1, maximumPoints: 5, criteria: [{ criterionId: 'clarity', title: 'Clarity', points: 5, position: 1 }] }, graderNotePolicy: 'private' });
    case 'code': return pair({ contentType: type, submissionModes: ['editor'], wrapperKind: 'program', runtimeProfileId: 'draft-profile' }, { configType: type, referenceSolutionAssetId: 'protected-asset-required', testCases: [{ testCaseId: 'case-1', position: 1, representation: 'inputOutput', input: '', expectedOutput: '', display: 'hide', points: 1 }], scoring: { mode: 'allOrNothing', maximumPoints: 1, showCheckButton: false, wrongCheckPenalty: 0, scoreFloor: 0 } });
    case 'readingSet': return pair({ contentType: type, passage: 'Add the passage here.', childQuestionVersionIds: ['published-child-version-id'] }, { configType: type, children: [{ questionVersionId: 'published-child-version-id', questionType: 'multipleChoice', points: 1 }] });
    case 'listeningSet': return pair({ contentType: type, audioAssetId: 'protected-audio-asset-required', childQuestionVersionIds: ['published-child-version-id'], playLimit: 2 }, { configType: type, children: [{ questionVersionId: 'published-child-version-id', questionType: 'multipleChoice', points: 1 }] });
  }
};

export function QuestionBank({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale),
    [courses, setCourses] = useState<Course[]>([]),
    [courseId, setCourseId] = useState(''),
    [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null),
    [items, setItems] = useState<QuestionRow[]>([]),
    [query, setQuery] = useState(''),
    [categoryId, setCategoryId] = useState(''),
    [includeSubcategories, setIncludeSubcategories] = useState(false),
    [difficulty, setDifficulty] = useState(''),
    [questionType, setQuestionType] = useState(''),
    [selectedTags, setSelectedTags] = useState<string[]>([]),
    [tagMatch, setTagMatch] = useState<'any' | 'all'>('any'),
    [page, setPage] = useState(1),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editor, setEditor] = useState<QuestionRow | 'new' | null>(null),
    [draftType, setDraftType] = useState<QuestionType>('multipleChoice'),
    [workflow, setWorkflow] = useState<{ questionId: string; version: QuestionRow } | null>(null),
    [validation, setValidation] = useState<{ valid: boolean; errors: { path: string; message: string }[] } | null>(null),
    [detail, setDetail] = useState<QuestionRow | null>(null);
  const selectedCourse = courses.find((course) => course.id === courseId);
  const editable = Boolean(selectedCourse?.permissions.includes('content.author'));
  const allowedRole = roles.some((role) => ['student', 'teacher', 'teachingAssistant', 'admin'].includes(role));

  async function loadCourses() {
    try {
      const result = await api<{ items: Course[] }>('/courses?pageSize=100');
      setCourses(result.items);
      if (!courseId && result.items[0]) setCourseId(result.items[0].id);
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
  }
  const loadQuestions = useCallback(async (nextPage = 1) => {
    if (!courseId) { setItems([]); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '20', tagMatch });
      if (query.trim()) params.set('q', query.trim());
      if (categoryId) params.set('categoryId', categoryId);
      if (categoryId && includeSubcategories) params.set('includeSubcategories', 'true');
      if (difficulty) params.set('difficulty', difficulty);
      if (questionType) params.set('questionType', questionType);
      for (const tag of selectedTags) params.append('tagIds', tag);
      const result = await api<{ items: QuestionRow[]; hasMore: boolean }>(`/courses/${courseId}/questions?${params}`);
      setItems((current) => nextPage === 1 ? result.items : [...current, ...result.items]);
      setHasMore(result.hasMore);
      setPage(nextPage);
      setError('');
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setLoading(false); }
  }, [courseId, query, categoryId, includeSubcategories, difficulty, questionType, selectedTags, tagMatch, locale]);

  useEffect(() => { void loadCourses(); }, []);
  useEffect(() => {
    if (!courseId) { setTaxonomy(null); return; }
    let cancelled = false;
    void api<Taxonomy>('/question-taxonomy').then((result) => { if (!cancelled) setTaxonomy(result); }).catch((problem) => { if (!cancelled) setError(courseError(problem, locale)); });
    return () => { cancelled = true; };
  }, [courseId, locale]);
  useEffect(() => { void loadQuestions(1); }, [loadQuestions]);

  function openNew() {
    setDraftType('multipleChoice'); setWorkflow(null); setValidation(null); setEditor('new'); setError('');
  }
  async function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourse || !editor) return;
    const form = new FormData(event.currentTarget);
    let content: Record<string, unknown>, authoringConfig: Record<string, unknown>;
    try {
      content = JSON.parse(String(form.get('content'))) as Record<string, unknown>;
      authoringConfig = JSON.parse(String(form.get('authoringConfig'))) as Record<string, unknown>;
    } catch { setError(t('Content and scoring configuration must be valid JSON.', 'Nội dung và cấu hình chấm điểm phải là JSON hợp lệ.')); return; }
    const payload = {
      questionType: draftType,
      title: form.get('title'), prompt: form.get('prompt'), categoryId: form.get('categoryId'),
      difficulty: form.get('difficulty'), language: form.get('language'),
      usageTypes: form.getAll('usageTypes'), tagIds: form.getAll('tagIds'), content, authoringConfig,
    };
    setBusy(true); setError(''); setValidation(null);
    try {
      const result = editor === 'new'
        ? await api<QuestionRow>(`/courses/${courseId}/questions`, 'POST', payload)
        : await api<QuestionRow>(`/questions/${editor.questionId}/versions`, 'POST', payload);
      setWorkflow({ questionId: result.questionId, version: result });
      setNotice(t('Draft version saved. Validate it before publishing.', 'Đã lưu bản nháp. Hãy xác thực trước khi công bố.'));
      await loadQuestions(1);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  async function validateDraft() {
    if (!workflow) return;
    setBusy(true); setError('');
    try {
      const result = await api<typeof validation>(`/questions/${workflow.questionId}/versions/${workflow.version.questionVersionId}/validate`, 'POST');
      setValidation(result);
      if (result?.valid) setWorkflow((current) => current ? { ...current, version: { ...current.version, status: 'validated' } } : current);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  async function publishDraft() {
    if (!workflow) return;
    setBusy(true); setError('');
    try {
      await api(`/questions/${workflow.questionId}/versions/${workflow.version.questionVersionId}/publish`, 'POST');
      setNotice(t('Question version published.', 'Đã công bố phiên bản câu hỏi.'));
      setWorkflow(null); setEditor(null); setValidation(null); await loadQuestions(1);
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); }
  }
  async function openDetails(item: QuestionRow) {
    try {
      const result = await api<QuestionRow>(`/questions/${item.questionId}/versions/${item.questionVersionId}`);
      setDetail(result);
    } catch (problem) { setError(courseError(problem, locale)); }
  }
  async function uploadAuthoringAsset(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const form = input.form;
    if (!file || !form || !selectedCourse) return;
    const kind = draftType === 'listeningSet' ? 'audio' : 'referenceSolution';
    setBusy(true); setError(''); setNotice('');
    try {
      const asset = await apiQuestionAsset<{ assetId: string; digest: string; size: number }>(
        `/courses/${selectedCourse.id}/question-assets`, file, kind,
      );
      const fieldName = kind === 'audio' ? 'content' : 'authoringConfig';
      const field = form.elements.namedItem(fieldName) as HTMLTextAreaElement | null;
      if (field) {
        const value = JSON.parse(field.value) as Record<string, unknown>;
        value[kind === 'audio' ? 'audioAssetId' : 'referenceSolutionAssetId'] = asset.assetId;
        field.value = JSON.stringify(value, null, 2);
      }
      setNotice(t(`Protected asset uploaded (${asset.size} bytes, SHA-256 ${asset.digest.slice(0, 12)}…). Its ID was added to the JSON below.`, `Đã tải tài nguyên bảo vệ (${asset.size} byte, SHA-256 ${asset.digest.slice(0, 12)}…). ID đã được thêm vào JSON bên dưới.`));
    } catch (problem) { setError(courseError(problem, locale)); }
    finally { setBusy(false); input.value = ''; }
  }

  if (!allowedRole) return <div className="alert alert-error" role="alert">{t('This workspace is not available to your role.', 'Không gian này không dành cho vai trò của bạn.')}</div>;
  return (
    <div className="identity-screen">
      <IdentityAlert text={error} />
      {notice && <IdentityAlert text={notice} success />}
      <section className="panel question-bank-header">
        <div className="panel-heading"><div>
          <span className="eyebrow">{t('Live course question bank', 'Ngân hàng câu hỏi theo khóa học')}</span>
          <h2>{t('Question bank', 'Ngân hàng câu hỏi')}</h2>
          <p>{t('Students see published questions only. Private scoring keys are shown only to course authors.', 'Sinh viên chỉ thấy câu hỏi đã công bố. Đáp án và cấu hình chấm chỉ dành cho người soạn có quyền.')}</p>
        </div>{editable && <button className="button primary" onClick={openNew}>{t('Create question', 'Tạo câu hỏi')}</button>}</div>
        <div className="course-form-grid">
          <Field label={t('Course', 'Khóa học')}><select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.courseCode} · {course.title}</option>)}
          </select></Field>
          <Field label={t('Search', 'Tìm kiếm')}><input value={query} maxLength={200} onChange={(event) => setQuery(event.target.value)} placeholder={t('Title or prompt', 'Tiêu đề hoặc nội dung')} /></Field>
        </div>
        <div className="course-form-grid question-filter-grid">
          <Field label={t('Category', 'Danh mục')}><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}><option value="">{t('All categories', 'Tất cả danh mục')}</option>{taxonomy?.categories.filter((node) => node.status === 'active').map((node) => <option key={node.id} value={node.id}>{node.names[locale] || node.names.en || node.id}</option>)}</select></Field>
          <label><input type="checkbox" checked={includeSubcategories} disabled={!categoryId} onChange={(event) => setIncludeSubcategories(event.target.checked)} /> {t('Include subcategories', 'Bao gồm danh mục con')}</label>
          <Field label={t('Question type', 'Loại câu hỏi')}><select value={questionType} onChange={(event) => setQuestionType(event.target.value)}><option value="">{t('All types', 'Tất cả loại')}</option>{typeOptions.map(([value, en, vi]) => <option key={value} value={value}>{locale === 'vi' ? vi : en}</option>)}</select></Field>
          <Field label={t('Difficulty', 'Độ khó')}><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="">{t('All levels', 'Tất cả mức')}</option>{['newbie', 'noob', 'wannabe', 'gatekeeper', 'legendary'].map((value, index) => <option key={value} value={value}>{index + 1} · {value}</option>)}</select></Field>
          <Field label={t('Match selected tags', 'Khớp thẻ đã chọn')}><select value={tagMatch} onChange={(event) => setTagMatch(event.target.value as 'any' | 'all')}><option value="any">{t('Any', 'Bất kỳ')}</option><option value="all">{t('All', 'Tất cả')}</option></select></Field>
        </div>
        <Field label={t('Tags', 'Thẻ')}><select multiple value={selectedTags} onChange={(event) => setSelectedTags(Array.from(event.target.selectedOptions, (option) => option.value))} aria-label={t('Filter tags', 'Lọc thẻ')} className="question-tag-select">{taxonomy?.tags.filter((tag) => tag.status === 'active' && tag.selectable !== false).map((tag) => <option key={tag.id} value={tag.id}>{tag.names[locale] || tag.names.en || tag.id}</option>)}</select></Field>
      </section>
      <section className="panel question-bank-list">
        {loading ? <p role="status">{t('Loading questions…', 'Đang tải câu hỏi…')}</p> : !items.length ? <Empty locale={locale} /> : <div className="table-scroll"><table className="identity-table"><thead><tr><th>{t('Question', 'Câu hỏi')}</th><th>{t('Type / difficulty', 'Loại / độ khó')}</th><th>{t('Category / tags', 'Danh mục / thẻ')}</th><th>{t('Status', 'Trạng thái')}</th><th>{t('Actions', 'Thao tác')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.questionVersionId}><td><strong>{item.title}</strong><small>{item.prompt}</small></td><td>{typeOptions.find(([value]) => value === item.questionType)?.[locale === 'vi' ? 2 : 1]}<small>{item.difficulty} · {item.language}</small></td><td>{taxonomy?.categories.find((node) => node.id === item.categoryId)?.names[locale] || item.categoryId}<small>{item.tags.map((tag) => tag.names[locale] || tag.id).join(', ') || '—'}</small></td><td><span className="state-badge">{item.status} · v{item.versionNumber}</span></td><td><div className="taxonomy-actions"><button className="button secondary" onClick={() => void openDetails(item)}>{t('Open', 'Mở')}</button>{editable && <button className="button secondary" onClick={() => { setEditor(item); setDraftType(item.questionType); setWorkflow(null); setValidation(null); }}>{t('New version', 'Phiên bản mới')}</button>}</div></td></tr>)}</tbody></table></div>}
        {hasMore && <button className="button secondary" disabled={loading} onClick={() => void loadQuestions(page + 1)}>{t('Load more', 'Tải thêm')}</button>}
      </section>
      {editor && selectedCourse && taxonomy && (
        <Modal title={t(editor === 'new' ? 'Create question draft' : `Create version ${editor.versionNumber + 1}`, editor === 'new' ? 'Tạo bản nháp câu hỏi' : `Tạo phiên bản ${editor.versionNumber + 1}`)} onClose={() => { if (!busy) { setEditor(null); setWorkflow(null); setValidation(null); } }} locked={busy}>
          <form className="course-form question-author-form" onSubmit={saveDraft}>
            <IdentityAlert text={error} />
            {editor === 'new' && <Field label={t('Question type', 'Loại câu hỏi')}><select value={draftType} onChange={(event) => setDraftType(event.target.value as QuestionType)}>{typeOptions.map(([value, en, vi]) => <option key={value} value={value}>{locale === 'vi' ? vi : en}</option>)}</select></Field>}
            {editor !== 'new' && <p className="service-note">{t('Published versions remain unchanged. Saving creates a new numbered Draft.', 'Phiên bản đã công bố được giữ nguyên. Lưu sẽ tạo bản nháp có số phiên bản mới.')}</p>}
            {!workflow ? <>
              <Field label={t('Title', 'Tiêu đề')}><input name="title" required maxLength={240} defaultValue={editor === 'new' ? '' : editor.title} /></Field>
              <Field label={t('Prompt / instructions', 'Câu hỏi / hướng dẫn')}><textarea name="prompt" required maxLength={20000} rows={4} defaultValue={editor === 'new' ? '' : editor.prompt} /></Field>
              <div className="course-form-grid">
                <Field label={t('Category', 'Danh mục')}><select name="categoryId" required defaultValue={editor === 'new' ? '' : editor.categoryId}><option value="" disabled>{t('Select a category', 'Chọn danh mục')}</option>{taxonomy.categories.filter((node) => node.status === 'active').map((node) => <option key={node.id} value={node.id}>{node.names[locale] || node.names.en || node.id}</option>)}</select></Field>
                <Field label={t('Difficulty', 'Độ khó')}><select name="difficulty" defaultValue={editor === 'new' ? 'newbie' : editor.difficulty}>{['newbie', 'noob', 'wannabe', 'gatekeeper', 'legendary'].map((value) => <option key={value}>{value}</option>)}</select></Field>
                <Field label={t('Language', 'Ngôn ngữ')}><input name="language" defaultValue={editor === 'new' ? 'en' : editor.language} pattern="[a-z]{2}(-[A-Z]{2})?" /></Field>
              </div>
              <Field label={t('Usage', 'Mục đích sử dụng')}><div className="question-check-list">{(['practice', 'practical', 'exam'] as const).map((value) => <label key={value}><input type="checkbox" name="usageTypes" value={value} defaultChecked={editor === 'new' ? value === 'practice' : editor.usageTypes.includes(value)} />{value}</label>)}</div></Field>
              <Field label={t('Tags', 'Thẻ')}><select multiple name="tagIds" defaultValue={editor === 'new' ? [] : editor.tags.map((tag) => tag.id)} className="question-tag-select">{taxonomy.tags.filter((tag) => tag.status === 'active' && tag.selectable !== false).map((tag) => <option key={tag.id} value={tag.id}>{tag.names[locale] || tag.id}</option>)}</select></Field>
              {['code', 'listeningSet'].includes(draftType) && <Field label={t(draftType === 'listeningSet' ? 'Protected audio (up to 2 MB)' : 'Protected reference solution (up to 2 MB)', draftType === 'listeningSet' ? 'Âm thanh bảo vệ (tối đa 2 MB)' : 'Lời giải tham khảo bảo vệ (tối đa 2 MB)')}><input type="file" accept={draftType === 'listeningSet' ? 'audio/mpeg,audio/wav,audio/ogg,audio/mp4' : 'text/plain'} onChange={(event) => void uploadAuthoringAsset(event)} disabled={busy} /><small>{t('Assets are immutable and restricted to this course. Code execution stays disabled.', 'Tài nguyên không thể sửa và chỉ dùng trong khóa học này. Thực thi mã vẫn tắt.')}</small></Field>}
              <button type="button" className="button secondary" onClick={(event) => { const form = event.currentTarget.form; if (!form) return; const [content, config] = starter(draftType); (form.elements.namedItem('content') as HTMLTextAreaElement).value = JSON.stringify(content, null, 2); (form.elements.namedItem('authoringConfig') as HTMLTextAreaElement).value = JSON.stringify(config, null, 2); }}>{t('Load starter structure', 'Tải cấu trúc mẫu')}</button>
              <Field label={t('Student-visible content JSON', 'JSON nội dung người học xem')}><textarea name="content" required rows={8} defaultValue={JSON.stringify(editor === 'new' ? starter(draftType)[0] : editor.content, null, 2)} /></Field>
              <Field label={t('Private answer / scoring JSON', 'JSON đáp án / chấm điểm riêng tư')}><textarea name="authoringConfig" required rows={8} defaultValue={JSON.stringify(editor === 'new' ? starter(draftType)[1] : editor.authoringConfig || {}, null, 2)} /></Field>
              <FormActions locale={locale} busy={busy} onClose={() => setEditor(null)} />
            </> : <>
              <div className="question-version-summary"><span className="eyebrow">{t('Saved draft', 'Bản nháp đã lưu')} · v{workflow.version.versionNumber}</span><h3>{workflow.version.title}</h3><p>{workflow.version.status}</p></div>
              {validation && <div className={validation.valid ? 'alert alert-success' : 'alert alert-error'} role={validation.valid ? 'status' : 'alert'}>{validation.valid ? t('Schema and answer references are valid.', 'Schema và đáp án đã hợp lệ.') : <ul>{validation.errors.map((issue, index) => <li key={index}><code>{issue.path}</code> · {issue.message}</li>)}</ul>}</div>}
              <div className="question-workflow-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => void validateDraft()}>{t('Validate draft', 'Xác thực bản nháp')}</button>{validation?.valid && workflow.version.questionType !== 'code' && <button type="button" className="button primary" disabled={busy} onClick={() => void publishDraft()}>{t('Publish version', 'Công bố phiên bản')}</button>}</div>
              {workflow.version.questionType === 'code' && <p className="service-note">{t('Code questions remain drafts while offline test validation and an isolated execution service are unavailable.', 'Câu hỏi lập trình vẫn là bản nháp khi chưa có xác thực bộ kiểm thử và dịch vụ thực thi cô lập.')}</p>}
              <button type="button" className="button secondary" disabled={busy} onClick={() => { setWorkflow(null); setValidation(null); }}>{t('Edit saved metadata', 'Sửa metadata đã lưu')}</button>
            </>}
          </form>
        </Modal>
      )}
      {detail && <Modal title={detail.title} onClose={() => setDetail(null)}><div className="question-detail"><span className="state-badge">{detail.status} · v{detail.versionNumber}</span><p className="plain-text">{detail.prompt}</p>{Array.isArray(detail.content.choices) && <ul>{(detail.content.choices as { choiceId: string; text: string }[]).map((choice) => <li key={choice.choiceId}>{choice.text}</li>)}</ul>}<p>{t('Category', 'Danh mục')}: {detail.categoryId} · {detail.difficulty} · {detail.language}</p></div></Modal>}
    </div>
  );
}
