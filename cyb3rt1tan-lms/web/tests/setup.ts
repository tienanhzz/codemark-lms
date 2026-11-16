import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  },
});
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value(this: HTMLDialogElement) {
    this.removeAttribute('open');
  },
});
vi.stubGlobal('crypto', webcrypto);
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});
