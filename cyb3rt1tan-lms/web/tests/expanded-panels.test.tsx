import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from '../components/IdentityShared';
import { WorkspacePreview } from '../components/WorkspacePreview';
import { previewPages } from '../lib/workspaceCatalog';

describe('Expanded workspaces', () => {
  it('opens long content in the page and restores focus when closed', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const view = render(<Modal title="Question editor" onClose={onClose}><label>Prompt<textarea /></label></Modal>);
    const panel = screen.getByRole('region', { name: 'Question editor' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(within(panel).getByRole('heading', { name: 'Question editor' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Close / Đóng' }));
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('keeps short confirmations modal and prevents closing a locked confirmation', () => {
    const onClose = vi.fn();
    render(<Modal presentation="dialog" title="Remove image" locked onClose={onClose}><button>Confirm</button></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Remove image' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole('button', { name: 'Close / Đóng' })).toBeNull();
  });

  it('expands the question workspace inside its record without stacking overlays', async () => {
    const user = userEvent.setup();
    const page = previewPages.find((item) => item.id === 'assessments')!;
    render(<WorkspacePreview page={page} locale="en" roles={['student']} />);
    await user.click(screen.getAllByRole('button', { name: 'Open preview' })[0]);
    const record = screen.getByRole('region', { name: page.rows[0].name[0] });
    await user.click(within(record).getByRole('button', { name: 'Explore question workspace' }));
    const question = within(record).getByRole('region', { name: 'Sample question workspace' });
    expect(within(question).getByRole('heading', { name: 'Sample question workspace' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(within(question).getByRole('button', { name: 'Close / Đóng' }));
    expect(screen.queryByRole('region', { name: 'Sample question workspace' })).toBeNull();
    expect(document.activeElement).toBe(within(record).getByRole('button', { name: 'Explore question workspace' }));
  });
});
