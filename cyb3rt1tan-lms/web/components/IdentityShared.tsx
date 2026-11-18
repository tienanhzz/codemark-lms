'use client';
import { useEffect, useId, useRef } from 'react';
import { identityMessages, type IdentityKey } from '../lib/identityMessages';
import '../app/expanded-panels.css';

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
  presentation = 'inline',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  locked?: boolean;
  presentation?: 'inline' | 'dialog';
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current;
    if (presentation === 'dialog') element?.showModal();
    else {
      heading.current?.focus();
      heading.current?.scrollIntoView?.({ block: 'start' });
    }
    return () => {
      element?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [presentation]);
  const content = (
    <>
      <div className="panel-heading">
        <h2 ref={heading} id={titleId} tabIndex={-1}>{title}</h2>
        {!locked && (
          <button type="button" className="icon-button" aria-label="Close / Đóng" onClick={onClose}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        )}
      </div>
      {presentation === 'inline' ? <div className="expanded-panel-body">{children}</div> : children}
    </>
  );
  if (presentation === 'inline') {
    return <section className="panel expanded-panel" aria-labelledby={titleId}>{content}</section>;
  }
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
      {content}
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
