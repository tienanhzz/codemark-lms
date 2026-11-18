'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { translate, type Locale } from '../lib/courseApi';
import { questError } from '../lib/questApi';

type Document = { id: string; courseTitle: string; title: string; url: string };
type View = { id: string; url: string; title: string; openedAt: string; minimumSeconds: number };
export function QuestDocumentReader({ locale, busy, execute }: { locale: Locale; busy: boolean; execute: (operation: () => Promise<unknown>, message: string) => Promise<void> }) {
  const t = translate(locale);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void api<{ items: Document[] }>('/quests/resources').then((result) => { if (active) setDocuments(result.items); }).catch((problem) => { if (active) setError(questError(problem, locale)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [locale]);
  useEffect(() => {
    if (!view) return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil(view.minimumSeconds - (Date.now() - Date.parse(view.openedAt)) / 1000)));
    update(); const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [view]);
  return <div className="quest-action-panel"><h3>{t('Read course documents', 'Đọc tài liệu khóa học')}</h3><p>{t('Open a document here and read for at least 30 seconds. Each document counts once.', 'Mở tài liệu tại đây và đọc tối thiểu 30 giây. Mỗi tài liệu chỉ được tính một lần.')}</p>{error && <p role="alert">{error}</p>}{loading ? <p role="status">{t('Loading documents…', 'Đang tải tài liệu…')}</p> : documents.length ? <div className="quest-documents">{documents.map((document) => <button className="button secondary" type="button" key={document.id} onClick={() => void execute(async () => setView(await api<View>(`/quests/resources/${document.id}/views`, 'POST')), t('Document opened. Read for at least 30 seconds.', 'Đã mở tài liệu. Đọc tối thiểu 30 giây.'))} disabled={busy}>{document.courseTitle} · {document.title}</button>)}</div> : <p>{t('No course documents are available for your enrolled courses.', 'Chưa có tài liệu trong các khóa học bạn tham gia.')}</p>}
    {view && <div className="quest-reader"><h4>{view.title}</h4><iframe title={view.title} src={view.url} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin" /><a className="text-link" href={view.url} target="_blank" rel="noreferrer">{t('Open document in another tab', 'Mở tài liệu trong thẻ mới')}</a><p role="status">{secondsLeft > 0 ? t(`Read for ${secondsLeft} more seconds.`, `Đọc thêm ${secondsLeft} giây.`) : t('Reading time reached. Confirm to record your progress.', 'Đã đủ thời gian đọc. Xác nhận để ghi nhận tiến độ.')}</p><button className="button primary" type="button" disabled={busy || secondsLeft > 0} onClick={() => void execute(() => api(`/quests/resource-views/${view.id}/finish`, 'POST'), t('Document reading verified.', 'Đã xác minh lượt đọc tài liệu.'))}>{t('Record reading progress', 'Ghi nhận lượt đọc')}</button></div>}
  </div>;
}
