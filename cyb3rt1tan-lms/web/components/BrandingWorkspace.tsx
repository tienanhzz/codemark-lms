'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { Locale } from '../lib/workspaceCatalog';

type LogoVersion = {
  id: string;
  version: number;
  digest: string;
  isActive: boolean;
  createdAt: string;
  url: string;
};

export function BrandingWorkspace({ locale }: { locale: Locale }) {
  const [versions, setVersions] = useState<LogoVersion[]>([]);
  const [source, setSource] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const vi = locale === 'vi';
  const activeVersion = versions.find((version) => version.isActive);

  const refresh = useCallback(async () => {
    try {
      const result = await api<{ items: LogoVersion[] }>('/admin/branding/logos');
      setVersions(result.items);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!source || !canvasRef.current) return;
    let disposed = false;
    void createImageBitmap(source).then((image) => {
      if (disposed) { image.close(); return; }
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d', { alpha: true });
      if (canvas && context) {
        const side = canvas.width;
        const scale = Math.max(side / image.width, side / image.height) * zoom;
        const width = image.width * scale;
        const height = image.height * scale;
        const rangeX = Math.max(0, (width - side) / 2);
        const rangeY = Math.max(0, (height - side) / 2);
        const x = (side - width) / 2 + rangeX * offsetX / 100;
        const y = (side - height) / 2 + rangeY * offsetY / 100;
        context.clearRect(0, 0, side, side);
        context.drawImage(image, x, y, width, height);
      }
      image.close();
    }).catch(() => setError(vi ? 'Không thể đọc ảnh này.' : 'This image could not be decoded.'));
    return () => { disposed = true; };
  }, [source, zoom, offsetX, offsetY, vi]);

  async function publish() {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (image) => image ? resolve(image) : reject(new Error('crop_export_failed')), 'image/png',
      ));
      const csrf = document.cookie.split('; ').find((value) => value.startsWith('lms_csrf='))?.split('=')[1] || '';
      const response = await fetch('/v1/admin/branding/logos', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store', body: blob,
        headers: { 'Content-Type': 'image/png', 'X-CSRF-Token': csrf },
      });
      const payload = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      if (!response.ok) throw new Error(payload?.error?.code || 'connection_error');
      setNotice(vi ? 'Đã lưu và kích hoạt logo mới.' : 'The new logo is saved and active.');
      setSource(null); setZoom(1); setOffsetX(0); setOffsetY(0);
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally { setBusy(false); }
  }

  async function activate(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/admin/branding/logos/${id}/activation`, 'POST');
      setNotice(vi ? 'Đã khôi phục phiên bản logo.' : 'Logo version restored.');
      await refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'connection_error');
    } finally { setBusy(false); }
  }

  return <section className="mission-card clan-detail">
    <div className="assessment-attempt-heading"><div><span className="eyebrow">{vi ? 'Thiết lập nền tảng' : 'Platform settings'}</span><h2>{vi ? 'Logo CodeMark' : 'CodeMark logo'}</h2></div></div>
    <p>{vi ? 'Chọn PNG, JPEG hoặc WebP. Ảnh được cắt vuông ngay trên trình duyệt; chỉ PNG 1024 × 1024 đã cắt được gửi lên.' : 'Choose a PNG, JPEG, or WebP image. Cropping happens in your browser; only the cropped 1024 × 1024 PNG is uploaded.'}</p>
    <div className="course-form-grid">
      <div>
        {source ? <canvas ref={canvasRef} width={1024} height={1024} aria-label={vi ? 'Xem trước vùng logo đã cắt' : 'Cropped logo preview'} style={{ display: 'block', width: '100%', maxWidth: 320, aspectRatio: '1', borderRadius: 20, border: '1px solid var(--line)', background: 'var(--surface)' }} /> : <div style={{ width: '100%', maxWidth: 320, aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: 20, border: '1px dashed var(--line)' }}>{activeVersion ? <img src={activeVersion.url} alt={vi ? `Logo nền tảng đang hoạt động, phiên bản ${activeVersion.version}` : `Active platform logo, version ${activeVersion.version}`} style={{ maxWidth: '72%', maxHeight: '72%', objectFit: 'contain' }} /> : <span aria-hidden="true" style={{ fontSize: 42 }}>◈</span>}</div>}
      </div>
      <div className="course-form-grid">
        <label className="course-field"><span>{vi ? 'Ảnh nguồn' : 'Source image'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0] || null; setError(''); setSource(file); }} /></label>
        {source && <>
          <label className="course-field"><span>{vi ? 'Thu phóng' : 'Zoom'} · {Math.round(zoom * 100)}%</span><input aria-label={vi ? 'Thu phóng vùng cắt' : 'Crop zoom'} type="range" min={100} max={300} value={Math.round(zoom * 100)} onChange={(event) => setZoom(Number(event.target.value) / 100)} /></label>
          <label className="course-field"><span>{vi ? 'Dịch trái/phải' : 'Move left/right'}</span><input aria-label={vi ? 'Dịch ngang vùng cắt' : 'Crop horizontal position'} type="range" min={-100} max={100} value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} /></label>
          <label className="course-field"><span>{vi ? 'Dịch lên/xuống' : 'Move up/down'}</span><input aria-label={vi ? 'Dịch dọc vùng cắt' : 'Crop vertical position'} type="range" min={-100} max={100} value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} /></label>
          <div className="assessment-action-row"><button type="button" className="button primary" disabled={busy} onClick={() => void publish()}>{busy ? (vi ? 'Đang lưu…' : 'Saving…') : (vi ? 'Cắt và kích hoạt logo' : 'Crop and activate logo')}</button><button type="button" className="button secondary" disabled={busy} onClick={() => setSource(null)}>{vi ? 'Hủy' : 'Cancel'}</button></div>
        </>}
      </div>
    </div>
    {error && <p className="alert alert-error" role="alert">{error}</p>}{notice && <p className="alert alert-success" role="status">{notice}</p>}
    <h3>{vi ? 'Lịch sử logo' : 'Logo history'}</h3>
    {versions.length ? versions.map((version) => <div className="assessment-attempt-heading" key={version.id}>
      <span><strong>v{version.version}</strong> · {version.isActive ? (vi ? 'Đang dùng' : 'Active') : new Date(version.createdAt).toLocaleString(vi ? 'vi-VN' : 'en-US')}<small style={{ display: 'block' }}>{version.digest.slice(0, 16)}…</small></span>
      {!version.isActive && <button type="button" className="button secondary" disabled={busy} onClick={() => void activate(version.id)}>{vi ? 'Khôi phục' : 'Restore'}</button>}
    </div>) : <p className="course-empty">{vi ? 'Chưa có logo tùy chỉnh.' : 'No custom logo has been uploaded.'}</p>}
  </section>;
}
