'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { courseError, translate, type Locale } from '../lib/courseApi';
import './CommunityWorkspace.css';

type Post = {
  id: string;
  topicId: string;
  title: string;
  body: string;
  authorName: string;
  authorRole: string;
  status: string;
  createdAt: string;
  courseId: string | null;
  courseTitle?: string;
  bestAnswerId: string | null;
  canReview: boolean;
  canSelectBest: boolean;
  moderationReason?: string;
  isOwn: boolean;
};
type Page = { items: Post[]; total: number };
type Course = { id: string; title: string; status: string };
type View = 'published' | 'mine' | 'queue';

export function CommunityWorkspace({ locale, roles }: { locale: Locale; roles: string[] }) {
  const t = translate(locale);
  const reviewer = roles.some((role) => role === 'admin' || role === 'teacher');
  const [view, setView] = useState<View>('published');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [feed, setFeed] = useState<Page>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [composer, setComposer] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<'question' | 'discussion'>('question');
  const [body, setBody] = useState('');
  const [courseId, setCourseId] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseCursor, setCourseCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Post | null>(null);
  const [answers, setAnswers] = useState<Page>({ items: [], total: 0 });
  const [answerPage, setAnswerPage] = useState(1);
  const [answerBody, setAnswerBody] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewPost, setReviewPost] = useState<string | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const feedRequest = useRef(0);
  const detailRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++feedRequest.current;
    setLoading(true);
    setError('');
    try {
      const result = await api<Page>(
        `/community/topics?view=${view}&status=${status}&q=${encodeURIComponent(search)}&page=${page}&pageSize=12`,
      );
      if (request === feedRequest.current) setFeed(result);
    } catch (problem) {
      if (request === feedRequest.current) setError(courseError(problem, locale));
    } finally {
      if (request === feedRequest.current) setLoading(false);
    }
  }, [view, status, search, page, locale]);
  useEffect(() => {
    void load();
    return () => {
      feedRequest.current++;
    };
  }, [load]);
  useEffect(() => {
    let active = true;
    void api<{ items: Course[]; nextCursor?: string | null }>('/courses')
      .then((result) => {
        if (active) {
          setCourses(
            result.items.filter((course) => !['archived', 'completed'].includes(course.status)),
          );
          setCourseCursor(result.nextCursor || null);
        }
      })
      .catch(() => {
        /* General community remains available when course lookup fails. */
      });
    const compose = new URLSearchParams(window.location.search).get('compose');
    if (compose === 'poll' || compose === 'question') {
      setKind(compose === 'poll' ? 'discussion' : 'question');
      setComposer(true);
    }
    return () => {
      active = false;
    };
  }, []);

  const open = async (topicId: string, nextPage = 1) => {
    const request = ++detailRequest.current;
    setComposer(false);
    setDetailLoading(true);
    setError('');
    setReviewPost(null);
    try {
      const [topic, replyPage] = await Promise.all([
        api<Post>(`/community/topics/${topicId}`),
        api<Page>(`/community/topics/${topicId}/answers?page=${nextPage}&pageSize=10`),
      ]);
      if (request === detailRequest.current) {
        setSelected(topic);
        setAnswers(replyPage);
        setAnswerPage(nextPage);
      }
    } catch (problem) {
      if (request === detailRequest.current) setError(courseError(problem, locale));
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  };
  const back = () => {
    detailRequest.current++;
    setSelected(null);
    setComposer(false);
    setReviewPost(null);
    setAnswerBody('');
    setDetailLoading(false);
  };
  const changeView = (next: View) => {
    back();
    setView(next);
    setStatus('all');
    setPage(1);
    setNotice('');
  };

  const submitTopic = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Post>('/community/topics', 'POST', {
        title: title.trim(),
        kind,
        body: body.trim(),
        courseId: courseId || null,
      });
      setComposer(false);
      setTitle('');
      setBody('');
      setCourseId('');
      setNotice(
        result.status === 'published'
          ? t('Topic published.', 'Đã đăng chủ đề.')
          : t(
              'Submitted for review. It becomes visible to everyone after approval.',
              'Đã gửi duyệt. Nội dung sẽ hiển thị công khai sau khi được duyệt.',
            ),
      );
      setView('mine');
      setStatus('all');
      setPage(1);
      await load();
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  };
  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<Post>(`/community/topics/${selected.id}/answers`, 'POST', {
        body: answerBody.trim(),
      });
      setAnswerBody('');
      setNotice(
        result.status === 'published'
          ? t('Answer published.', 'Đã đăng câu trả lời.')
          : t('Answer submitted for review.', 'Đã gửi câu trả lời để duyệt.'),
      );
      await open(selected.id, answerPage);
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  };
  const moderate = async (post: Post, decision: 'approve' | 'reject') => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/community/posts/${post.id}/moderation`, 'POST', {
        decision,
        reason: reviewReason.trim(),
      });
      setReviewPost(null);
      setReviewReason('');
      setNotice(t('Review saved.', 'Đã lưu kết quả duyệt.'));
      await Promise.all([load(), ...(selected ? [open(selected.id, answerPage)] : [])]);
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  };
  const selectBest = async (post: Post) => {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      setSelected(
        await api<Post>(`/community/topics/${selected.id}/best-answer`, 'PUT', {
          answerId: post.id,
        }),
      );
      setNotice(t('Best answer selected.', 'Đã chọn câu trả lời hay nhất.'));
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  };
  const moreCourses = async () => {
    if (!courseCursor) return;
    setBusy(true);
    try {
      const result = await api<{ items: Course[]; nextCursor: string | null }>(
        `/courses?cursor=${encodeURIComponent(courseCursor)}`,
      );
      setCourses((current) => [
        ...current,
        ...result.items.filter((course) => !['archived', 'completed'].includes(course.status)),
      ]);
      setCourseCursor(result.nextCursor);
    } catch (problem) {
      setError(courseError(problem, locale));
    } finally {
      setBusy(false);
    }
  };
  const stateLabel = (value: string) =>
    ({
      pending: t('Pending review', 'Chờ duyệt'),
      published: t('Published', 'Đã đăng'),
      rejected: t('Rejected', 'Từ chối'),
    })[value] || value;
  const reviewControls = (post: Post) =>
    post.canReview && (
      <div className="community-review">
        {reviewPost !== post.id ? (
          <button
            className="button secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setReviewPost(post.id);
              setReviewReason('');
            }}
          >
            {t('Review content', 'Duyệt nội dung')}
          </button>
        ) : (
          <div className="community-review-form">
            <label className="course-field">
              <span>{t('Review note', 'Ghi chú duyệt')}</span>
              <textarea
                maxLength={1000}
                value={reviewReason}
                onChange={(event) => setReviewReason(event.target.value)}
              />
            </label>
            <div className="community-actions">
              <button
                type="button"
                className="button primary"
                disabled={busy}
                onClick={() => void moderate(post, 'approve')}
              >
                {t('Approve and publish', 'Duyệt và đăng')}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void moderate(post, 'reject')}
              >
                {t('Reject', 'Từ chối')}
              </button>
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() => setReviewPost(null)}
              >
                {t('Cancel review', 'Hủy duyệt')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  const metadata = (post: Post) => (
    <div className="community-meta">
      <span>{post.authorName}</span>
      <span>{new Date(post.createdAt).toLocaleString(locale)}</span>
      {post.courseTitle && <span>{post.courseTitle}</span>}
      <span className={`state-badge community-status-${post.status}`}>
        {stateLabel(post.status)}
      </span>
    </div>
  );

  return (
    <section className="panel community-workspace" aria-label={t('Community', 'Cộng đồng')}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{t('LEARN TOGETHER', 'CÙNG NHAU HỌC TẬP')}</p>
          <h2>{t('Community discussions', 'Thảo luận cộng đồng')}</h2>
          <p>
            {t(
              'Ask questions, share ideas and help classmates. Student content is reviewed by teachers or admins; teacher content by admins.',
              'Đặt câu hỏi, chia sẻ ý tưởng và giúp bạn học. Nội dung học viên do giáo viên hoặc quản trị viên duyệt; nội dung giáo viên do quản trị viên duyệt.',
            )}
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={busy}
          onClick={() => {
            back();
            setComposer(true);
            setNotice('');
          }}
        >
          {t('Ask a question', 'Đặt câu hỏi')}
        </button>
      </div>
      {error && (
        <p role="alert" className="alert alert-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="alert alert-success">
          {notice}
        </p>
      )}
      <nav className="community-tabs" aria-label={t('Discussion views', 'Chế độ thảo luận')}>
        <button
          className="button secondary"
          aria-pressed={view === 'published' && !selected && !composer}
          type="button"
          onClick={() => changeView('published')}
        >
          {t('Published discussions', 'Thảo luận đã duyệt')}
        </button>
        <button
          className="button secondary"
          aria-pressed={view === 'mine' && !selected && !composer}
          type="button"
          onClick={() => changeView('mine')}
        >
          {t('My posts', 'Bài viết của tôi')}
        </button>
        {reviewer && (
          <button
            className="button secondary"
            aria-pressed={view === 'queue' && !selected && !composer}
            type="button"
            onClick={() => changeView('queue')}
          >
            {t('Review queue', 'Hàng chờ duyệt')}
          </button>
        )}
      </nav>
      {composer ? (
        <form className="community-composer" onSubmit={(event) => void submitTopic(event)}>
          <div className="community-section-heading">
            <h3>{t('New discussion', 'Thảo luận mới')}</h3>
            <button className="button ghost" type="button" disabled={busy} onClick={back}>
              {t('Back to discussions', 'Về danh sách thảo luận')}
            </button>
          </div>
          <label className="course-field">
            <span>{t('Topic type', 'Loại chủ đề')}</span>
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value as 'question' | 'discussion')}
            >
              <option value="question">{t('Question', 'Câu hỏi')}</option>
              <option value="discussion">
                {t('Situation discussion', 'Thảo luận tình huống')}
              </option>
            </select>
          </label>
          <label className="course-field">
            <span>{t('Topic title', 'Tiêu đề chủ đề')}</span>
            <input
              autoFocus
              required
              minLength={3}
              maxLength={180}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="course-field">
            <span>{t('Related course (optional)', 'Khóa học liên quan (không bắt buộc)')}</span>
            <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              <option value="">{t('General community', 'Cộng đồng chung')}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
          {courseCursor && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => void moreCourses()}
            >
              {t('Load more courses', 'Tải thêm khóa học')}
            </button>
          )}
          <p className="service-note">
            {t(
              'Choose a course for your post to count toward that course’s missions. You can post to the general community without a course. Mission progress is verified after approval.',
              'Chọn khóa học để bài đăng được tính vào nhiệm vụ của môn học. Bạn vẫn có thể đăng bài vào cộng đồng chung khi không chọn khóa học. Tiến độ nhiệm vụ được xác minh sau khi duyệt.',
            )}
          </p>
          <label className="course-field">
            <span>{t('Question or discussion', 'Câu hỏi hoặc thảo luận')}</span>
            <textarea
              required
              minLength={50}
              maxLength={10000}
              rows={10}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <span className="service-note">
            {body.trim().length} / 10000 · {t('At least 50 characters', 'Tối thiểu 50 ký tự')}
          </span>
          <button
            className="button primary"
            type="submit"
            disabled={busy || body.trim().length < 50 || title.trim().length < 3}
          >
            {t('Submit topic', 'Gửi chủ đề')}
          </button>
        </form>
      ) : detailLoading ? (
        <p role="status">{t('Loading discussion…', 'Đang tải thảo luận…')}</p>
      ) : selected ? (
        <div className="community-detail">
          <button type="button" className="button ghost" onClick={back}>
            {t('Back to discussions', 'Về danh sách thảo luận')}
          </button>
          <article className="community-topic">
            <h3>{selected.title}</h3>
            {metadata(selected)}
            <p className="community-body">{selected.body}</p>
            {selected.moderationReason && <p className="alert">{selected.moderationReason}</p>}
            {reviewControls(selected)}
          </article>
          <div className="community-section-heading">
            <h3>{t('Answers', 'Câu trả lời')}</h3>
            <span>{answers.total}</span>
          </div>
          {answers.items.length === 0 && (
            <p className="course-empty">
              {t(
                'No visible answers yet. Share a helpful explanation.',
                'Chưa có câu trả lời hiển thị. Hãy chia sẻ lời giải thích hữu ích.',
              )}
            </p>
          )}
          <div className="community-answers">
            {answers.items.map((answer) => (
              <article
                className={`community-answer${selected.bestAnswerId === answer.id ? ' community-best' : ''}`}
                key={answer.id}
              >
                {selected.bestAnswerId === answer.id && (
                  <strong className="community-best-label">
                    {t('Best answer', 'Câu trả lời hay nhất')}
                  </strong>
                )}
                {metadata(answer)}
                <p className="community-body">{answer.body}</p>
                {answer.moderationReason && <p className="alert">{answer.moderationReason}</p>}
                {reviewControls(answer)}
                {selected.canSelectBest &&
                  !selected.bestAnswerId &&
                  answer.status === 'published' && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void selectBest(answer)}
                    >
                      {t('Select as best answer', 'Chọn câu trả lời hay nhất')}
                    </button>
                  )}
              </article>
            ))}
          </div>
          {answers.total > 10 && (
            <div className="community-pagination">
              <button
                type="button"
                className="button secondary"
                disabled={answerPage === 1 || busy}
                onClick={() => void open(selected.id, answerPage - 1)}
              >
                {t('Previous answers', 'Câu trả lời trước')}
              </button>
              <span>
                {answerPage} / {Math.ceil(answers.total / 10)}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={answerPage * 10 >= answers.total || busy}
                onClick={() => void open(selected.id, answerPage + 1)}
              >
                {t('More answers', 'Câu trả lời tiếp')}
              </button>
            </div>
          )}
          {selected.status === 'published' && (
            <form className="community-composer" onSubmit={(event) => void submitAnswer(event)}>
              <h3>{t('Write an answer', 'Viết câu trả lời')}</h3>
              <label className="course-field">
                <span>{t('Your answer', 'Câu trả lời của bạn')}</span>
                <textarea
                  required
                  minLength={80}
                  maxLength={10000}
                  rows={7}
                  value={answerBody}
                  onChange={(event) => setAnswerBody(event.target.value)}
                />
              </label>
              <span className="service-note">
                {answerBody.trim().length} / 10000 ·{' '}
                {t(
                  'At least 80 characters. Answers follow the same approval rules as topics.',
                  'Tối thiểu 80 ký tự. Câu trả lời tuân theo cùng quy trình duyệt như chủ đề.',
                )}
              </span>
              <button
                type="submit"
                className="button primary"
                disabled={busy || answerBody.trim().length < 80}
              >
                {t('Submit answer', 'Gửi câu trả lời')}
              </button>
            </form>
          )}
        </div>
      ) : (
        <>
          <form
            className="community-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(query.trim());
              setPage(1);
            }}
          >
            <label className="course-field">
              <span>{t('Search discussions', 'Tìm thảo luận')}</span>
              <input
                type="search"
                maxLength={200}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {view === 'mine' && (
              <label className="course-field">
                <span>{t('Post status', 'Trạng thái bài viết')}</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">{t('All statuses', 'Tất cả trạng thái')}</option>
                  {['pending', 'published', 'rejected'].map((state) => (
                    <option key={state} value={state}>
                      {stateLabel(state)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="button secondary" type="submit">
              {t('Search', 'Tìm kiếm')}
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={loading}
              onClick={() => void load()}
            >
              {t('Refresh', 'Tải lại')}
            </button>
          </form>
          {loading ? (
            <p role="status">{t('Loading discussions…', 'Đang tải thảo luận…')}</p>
          ) : feed.items.length === 0 ? (
            <p className="course-empty">
              {t('No discussions match this view.', 'Không có thảo luận phù hợp.')}
            </p>
          ) : (
            <div className="community-feed">
              {feed.items.map((post) => (
                <article className="community-feed-post" key={post.id}>
                  {post.topicId !== post.id && (
                    <span className="eyebrow">{t('Answer', 'Câu trả lời')}</span>
                  )}
                  <button
                    type="button"
                    className="community-title"
                    onClick={() => void open(post.topicId)}
                  >
                    {post.title}
                  </button>
                  {metadata(post)}
                  <p className="community-excerpt">{post.body}</p>
                  {post.moderationReason && <p className="alert">{post.moderationReason}</p>}
                  {reviewControls(post)}
                </article>
              ))}
            </div>
          )}
          <div className="community-pagination">
            <span>
              {feed.total} {t('posts', 'bài viết')}
            </span>
            <button
              className="button secondary"
              type="button"
              disabled={page === 1 || loading}
              onClick={() => setPage(page - 1)}
            >
              {t('Previous', 'Trước')}
            </button>
            <span>
              {page} / {Math.max(1, Math.ceil(feed.total / 12))}
            </span>
            <button
              className="button secondary"
              type="button"
              disabled={page * 12 >= feed.total || loading}
              onClick={() => setPage(page + 1)}
            >
              {t('Next', 'Tiếp')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
