'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { HomeCarousel } from './HomeCarousel';

type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorName: string;
  authorRole: string;
  canManage: boolean;
};
type Bulletin = { items: Announcement[]; total: number; page: number; pageSize: number };
type Highlight = {
  id: string;
  kind: 'rank_change' | 'congratulations' | 'study_tip';
  title: Record<'en' | 'vi', string>;
  body: Record<'en' | 'vi', string>;
  createdAt: string | null;
  href: string;
};
type Highlights = { items: Highlight[] };

const highlightIcons = {
  rank_change: 'fa-ranking-star',
  congratulations: 'fa-trophy',
  study_tip: 'fa-book-open-reader',
};

const copy = {
  en: {
    headline: 'Every day, go further.',
    latest: 'Latest announcements',
    courses: 'Your courses',
    coursesText: 'Lessons, materials and assignments',
    calendar: 'Weekly timetable',
    calendarText: 'Take charge of your learning week',
    rankText: 'Recognizing every step forward',
    footer: 'CodeMark · Learn together, grow together.',
    announcements: 'Announcements',
    refresh: 'Refresh',
    publish: 'Publish announcement',
    newPost: 'Publish a new announcement',
    editPost: 'Edit announcement',
    publicHelp:
      'This announcement is visible to everyone, including visitors. Keep private class notices on the course page.',
    title: 'Title',
    body: 'Body',
    save: 'Save announcement',
    saving: 'Saving…',
    cancel: 'Cancel',
    loading: 'Loading announcements…',
    empty: 'No public announcements yet.',
    emptyHelp: 'News from teachers and administrators will appear here.',
    loadError: 'Announcements could not be loaded. Please try again.',
    saveError: 'The announcement could not be saved. Please try again.',
    forbidden: 'You do not have permission to change this announcement.',
    deleted: 'Announcement deleted.',
    saved: 'Public announcement saved.',
    delete: 'Delete',
    edit: 'Edit',
    deleteQuestion: 'Delete this announcement?',
    confirm: 'Confirm deletion',
    deleteError: 'The announcement could not be deleted. Please try again.',
    admin: 'Administrator',
    teacher: 'Teacher',
    previous: 'Previous page',
    next: 'Next page',
    page: 'Page',
    learningUpdates: 'Learning updates',
    highlightsLoading: 'Loading learning updates…',
    highlightsError: 'Learning updates could not be loaded. Try Refresh again.',
    rank_change: 'Rank movement',
    congratulations: 'Congratulations',
    study_tip: 'System guidance',
  },
  vi: {
    headline: 'Mỗi ngày, tiến xa hơn.',
    latest: 'Bảng tin mới nhất',
    courses: 'Lớp học của bạn',
    coursesText: 'Bài học, tài liệu và bài tập',
    calendar: 'Thời khóa biểu tuần',
    calendarText: 'Chủ động sắp xếp việc học',
    rankText: 'Ghi nhận từng bước tiến bộ',
    footer: 'CodeMark · Cùng học tập, cùng phát triển.',
    announcements: 'Thông báo',
    refresh: 'Làm mới',
    publish: 'Đăng thông báo',
    newPost: 'Đăng thông báo mới',
    editPost: 'Sửa thông báo',
    publicHelp:
      'Thông báo này hiển thị cho mọi người, kể cả người chưa đăng nhập. Thông báo riêng của lớp vẫn đăng trong trang lớp học.',
    title: 'Tiêu đề',
    body: 'Nội dung',
    save: 'Lưu thông báo',
    saving: 'Đang lưu…',
    cancel: 'Hủy',
    loading: 'Đang tải bảng tin…',
    empty: 'Chưa có thông báo công khai.',
    emptyHelp: 'Tin mới từ giảng viên và quản trị viên sẽ xuất hiện tại đây.',
    loadError: 'Chưa tải được bảng tin. Vui lòng thử lại.',
    saveError: 'Chưa lưu được thông báo. Vui lòng thử lại.',
    forbidden: 'Bạn không có quyền thay đổi thông báo này.',
    deleted: 'Đã xóa thông báo.',
    saved: 'Đã lưu thông báo công khai.',
    delete: 'Xóa',
    edit: 'Sửa',
    deleteQuestion: 'Xóa thông báo này?',
    confirm: 'Xác nhận xóa',
    deleteError: 'Chưa xóa được thông báo. Vui lòng thử lại.',
    admin: 'Quản trị viên',
    teacher: 'Giảng viên',
    previous: 'Trang trước',
    next: 'Trang sau',
    page: 'Trang',
    learningUpdates: 'Cập nhật học tập',
    highlightsLoading: 'Đang tải cập nhật học tập…',
    highlightsError: 'Chưa tải được cập nhật học tập. Hãy chọn Làm mới để thử lại.',
    rank_change: 'Thay đổi thứ hạng',
    congratulations: 'Chúc mừng',
    study_tip: 'Hướng dẫn từ hệ thống',
  },
};

export function HomePage({ locale, roles = [] }: { locale: 'en' | 'vi'; roles?: string[] }) {
  const c = copy[locale];
  return (
    <div className="home-page">
      <div className="home-heading">
        <h1>{c.headline}</h1>
        <a href="#announcements">
          {c.latest} <span aria-hidden="true">↓</span>
        </a>
      </div>
      <HomeCarousel locale={locale} />
      <nav
        className="home-quicklinks"
        aria-label={locale === 'vi' ? 'Truy cập nhanh' : 'Quick links'}
      >
        {[
          { href: '/courses', icon: 'fa-book-open', title: c.courses, text: c.coursesText },
          { href: '/calendar', icon: 'fa-calendar-days', title: c.calendar, text: c.calendarText },
          { href: '/leaderboard', icon: 'fa-trophy', title: 'Player Rank', text: c.rankText },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <i aria-hidden="true" className={`fa-solid ${item.icon}`} />
            <div>
              <p>{item.title}</p>
              <small>{item.text}</small>
            </div>
          </Link>
        ))}
      </nav>
      <HomeAnnouncements
        locale={locale}
        canPublish={roles.includes('admin') || roles.includes('teacher')}
        authenticated={roles.length > 0}
      />
      <footer className="home-footer">{c.footer}</footer>
    </div>
  );
}

function HomeAnnouncements({
  locale,
  canPublish,
  authenticated,
}: {
  locale: 'en' | 'vi';
  canPublish: boolean;
  authenticated: boolean;
}) {
  const c = copy[locale];
  const [items, setItems] = useState<Announcement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<keyof typeof c | ''>('');
  const [notice, setNotice] = useState<keyof typeof c | ''>('');
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState(false);
  const highlightSequence = useRef(0);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const data = await api<Bulletin>(`/home/announcements?page=${page}`);
      if (request !== sequence.current) return;
      if (page > 1 && data.items.length === 0) {
        setPage(page - 1);
        return;
      }
      setItems(data.items);
      setTotal(data.total);
    } catch {
      if (request === sequence.current) setError('loadError');
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [page]);

  const loadHighlights = useCallback(async () => {
    const request = ++highlightSequence.current;
    if (!authenticated) {
      setHighlights([]);
      setHighlightsError(false);
      setHighlightsLoading(false);
      return;
    }
    setHighlightsLoading(true);
    setHighlightsError(false);
    try {
      const data = await api<Highlights>('/home/highlights');
      if (request === highlightSequence.current) setHighlights(data.items);
    } catch {
      if (request === highlightSequence.current) setHighlightsError(true);
    } finally {
      if (request === highlightSequence.current) setHighlightsLoading(false);
    }
  }, [authenticated]);

  useEffect(() => {
    void loadHighlights();
    return () => {
      highlightSequence.current++;
    };
  }, [loadHighlights]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load, canPublish]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || saving) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(
        editing === 'new' ? '/home/announcements' : `/home/announcements/${editing.id}`,
        editing === 'new' ? 'POST' : 'PUT',
        { title: data.get('title'), body: data.get('body') },
      );
      setEditing(null);
      setNotice('saved');
      if (page !== 1) setPage(1);
      else await load();
    } catch (err) {
      setError(err instanceof Error && err.message === 'forbidden' ? 'forbidden' : 'saveError');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api(`/home/announcements/${id}`, 'DELETE');
      setDeleting(null);
      setNotice('deleted');
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message === 'forbidden' ? 'forbidden' : 'deleteError');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="announcements" className="home-announcements" aria-label={c.announcements}>
      <div className="home-announcements-toolbar">
        <button
          className="home-button secondary"
          type="button"
          disabled={loading || highlightsLoading || saving}
          onClick={() => {
            void load();
            void loadHighlights();
          }}
        >
          {c.refresh}
        </button>
        {canPublish ? (
          <button
            className="home-button"
            type="button"
            disabled={saving}
            onClick={() => {
              setEditing('new');
              setNotice('');
              setDeleting(null);
            }}
          >
            {c.publish}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="home-alert error" role="alert">
          {c[error]}
        </p>
      ) : null}
      {notice ? (
        <p className="home-alert success" role="status">
          {c[notice]}
        </p>
      ) : null}
      {editing && canPublish ? (
        <form
          className="home-announcement-form"
          key={editing === 'new' ? 'new' : editing.id}
          onSubmit={save}
        >
          <h2>{editing === 'new' ? c.newPost : c.editPost}</h2>
          <p className="home-public-help">{c.publicHelp}</p>
          <label>
            {c.title}
            <input
              name="title"
              required
              maxLength={180}
              disabled={saving}
              defaultValue={editing === 'new' ? '' : editing.title}
            />
          </label>
          <label>
            {c.body}
            <textarea
              name="body"
              required
              maxLength={10000}
              rows={5}
              disabled={saving}
              defaultValue={editing === 'new' ? '' : editing.body}
            />
          </label>
          <div className="home-form-actions">
            <button type="submit" className="home-button" disabled={saving}>
              {saving ? c.saving : c.save}
            </button>
            <button
              type="button"
              className="home-button secondary"
              disabled={saving}
              onClick={() => setEditing(null)}
            >
              {c.cancel}
            </button>
          </div>
        </form>
      ) : null}
      <img
        className="home-announcements-banner"
        src="/announcements.png"
        alt={c.announcements}
        width={689}
        height={268}
      />
      <div className="home-bulletin" aria-busy={loading}>
        {authenticated ? (
          <div
            className="home-highlights"
            aria-label={c.learningUpdates}
            aria-busy={highlightsLoading}
          >
            <h2 className="home-highlights-heading">{c.learningUpdates}</h2>
            {highlightsError ? (
              <p className="home-alert error" role="alert">
                {c.highlightsError}
              </p>
            ) : null}
            {highlightsLoading && highlights.length === 0 ? (
              <p role="status">{c.highlightsLoading}</p>
            ) : null}
            {highlights.map((item) => (
              <article key={item.id} className={`home-highlight home-highlight-${item.kind}`}>
                <i className={`fa-solid ${highlightIcons[item.kind]}`} aria-hidden="true" />
                <div className="home-highlight-content">
                  <div className="home-post-meta">
                    <span className="home-highlight-kind">{c[item.kind]}</span>
                    {item.createdAt ? (
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleDateString(
                          locale === 'vi' ? 'vi-VN' : 'en-GB',
                        )}
                      </time>
                    ) : null}
                  </div>
                  <h3>
                    <Link href={item.href}>{item.title[locale]}</Link>
                  </h3>
                  <p>{item.body[locale]}</p>
                </div>
              </article>
            ))}
          </div>
        ) : null}
        {loading ? (
          <p className="home-bulletin-state" role="status">
            {c.loading}
          </p>
        ) : items.length === 0 ? (
          <div className="home-bulletin-state">
            <i className="fa-solid fa-scroll" aria-hidden="true" />
            <h2>{error ? c.loadError : c.empty}</h2>
            {!error ? <p>{c.emptyHelp}</p> : null}
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="home-bulletin-post">
              <div className="home-post-meta">
                <span className="home-post-role">
                  <i aria-hidden="true" className="fa-solid fa-scroll" />{' '}
                  {item.authorRole === 'admin' ? c.admin : c.teacher}
                </span>
                <span>{item.authorName}</span>
                <time dateTime={item.createdAt}>
                  {new Date(item.createdAt).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-GB')}
                </time>
              </div>
              <h2>{item.title}</h2>
              <p className="home-post-body">{item.body}</p>
              {canPublish && item.canManage ? (
                <div className="home-post-actions">
                  {deleting === item.id ? (
                    <>
                      <span>{c.deleteQuestion}</span>
                      <button
                        className="home-button danger"
                        type="button"
                        disabled={saving}
                        onClick={() => void remove(item.id)}
                      >
                        {c.confirm}
                      </button>
                      <button
                        className="home-button secondary"
                        type="button"
                        disabled={saving}
                        onClick={() => setDeleting(null)}
                      >
                        {c.cancel}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="home-button secondary"
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setEditing(item);
                          setDeleting(null);
                        }}
                      >
                        {c.edit}
                      </button>
                      <button
                        className="home-button ghost"
                        type="button"
                        disabled={saving}
                        onClick={() => setDeleting(item.id)}
                      >
                        {c.delete}
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
      {total > 10 ? (
        <nav className="home-pagination" aria-label={c.announcements}>
          <button
            className="home-button secondary"
            type="button"
            disabled={page === 1 || loading || saving}
            onClick={() => setPage((value) => value - 1)}
          >
            {c.previous}
          </button>
          <span>
            {c.page} {page} / {Math.ceil(total / 10)}
          </span>
          <button
            className="home-button secondary"
            type="button"
            disabled={page * 10 >= total || loading || saving}
            onClick={() => setPage((value) => value + 1)}
          >
            {c.next}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
