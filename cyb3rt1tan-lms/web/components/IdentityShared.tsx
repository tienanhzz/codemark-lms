'use client';
import { useEffect, useRef } from 'react';
import { identityMessages, type IdentityKey } from '../lib/identityMessages';

export const roles = [
  'student',
  'teacher',
  'teachingAssistant',
  'admin',
  'administrativeAssistant',
  'researchAssistant',
] as const;
export function IdentityAlert({ text, success = false }: { text: string; success?: boolean }) {
  return text ? (
    <div
      role={success ? 'status' : 'alert'}
      className={`alert ${success ? 'alert-success' : 'alert-error'}`}
    >
      {text}
    </div>
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  locked = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  locked?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="identity-modal"
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!locked) onClose();
      }}
    >
      <div className="panel-heading">
        <h2>{title}</h2>
        {!locked && (
          <button className="icon-button" aria-label="Close / Đóng" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
export function StateBadge({ value, locale }: { value: string; locale: 'en' | 'vi' }) {
  return (
    <span className={`state-badge state-${value}`}>
      {identityMessages[locale][value as IdentityKey] || value}
    </span>
  );
}
export function downloadText(filename: string, text: string): void {
  downloadBlob(filename, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
