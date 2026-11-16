import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsWorkspace } from '../components/NotificationsWorkspace';
import { CriticalNoticePrompt } from '../components/CriticalNoticePrompt';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
const realtime = vi.hoisted(() => ({ connected: false, subscriber: null as null | { onChange: () => void; onStatus: (connected: boolean) => void } }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
}));
vi.mock('../lib/realtime', () => ({
  subscribeRealtime: (subscriber: typeof realtime.subscriber) => {
    realtime.subscriber = subscriber;
    subscriber?.onStatus(realtime.connected);
    return () => { if (realtime.subscriber === subscriber) realtime.subscriber = null; };
  },
}));

beforeEach(() => { realtime.connected = false; realtime.subscriber = null; });

describe('NotificationsWorkspace', () => {
  it('lets a student acknowledge required notices and save optional email preferences', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/me/notifications')) return { items: [{
        id: 'recipient-1', notificationId: 'notice-1', eventKey: 'exam.window', severity: 'critical',
        mandatory: true, requireAcknowledgement: true, channels: ['inApp', 'realtime'], locale: 'en',
        subject: 'Exam window changed', body: 'Review the new window.', createdAt: '2026-11-16T10:00:00Z',
        readAt: null, acknowledgedAt: null,
      }] };
      if (path === '/me/notification-preferences') return { emailNonessential: true, inApp: true, locale: 'en' };
      if (path === '/courses?pageSize=100') return { items: [] };
      return undefined;
    });
    render(<NotificationsWorkspace locale="en" roles={['student']} />);
    const user = userEvent.setup();
    await screen.findByText('Exam window changed');
    await user.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/me/notifications/recipient-1/acknowledgements', 'POST'));
    await user.click(screen.getByLabelText('Nonessential email'));
    await user.selectOptions(screen.getByLabelText('Notification language'), 'vi');
    await user.click(screen.getByRole('button', { name: 'Save preferences' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/me/notification-preferences', 'PUT', {
      emailNonessential: false, inApp: true, locale: 'vi',
    }));
  });

  it('lets Admin publish a template and send a system notice', async () => {
    let templates: { templateId: string; version: number; eventKey: string; locale: string; mandatory: boolean; channels: string[]; subject: string; body: string }[] = [];
    transport.api.mockImplementation(async (path: string, method?: string, body?: Record<string, unknown>) => {
      if (path.startsWith('/me/notifications')) return { items: [] };
      if (path === '/me/notification-preferences') return { emailNonessential: true, inApp: true, locale: 'en' };
      if (path === '/admin/notification-templates' && (!method || method === 'GET')) return { items: templates };
      if (path === '/admin/notification-templates' && method === 'POST') {
        templates = [...templates, body as (typeof templates)[number]];
        return body;
      }
      if (path === '/courses?pageSize=100') return { items: [] };
      if (path === '/admin/notifications' && method === 'POST') return { id: 'sent-1', recipientCount: 2 };
      if (path === '/notifications/sent-1/delivery-status') return { recipientCount: 2, readCount: 0, acknowledgedCount: 0, emailQueued: 0, emailDelivered: 0, emailFailed: 0, emailSuppressed: 0 };
      return undefined;
    });
    render(<NotificationsWorkspace locale="en" roles={['admin']} />);
    const user = userEvent.setup();
    await screen.findByText('Notification templates');
    await user.type(screen.getByLabelText('Subject'), 'System maintenance');
    await user.type(screen.getByLabelText('Body'), 'The service will be updated tonight.');
    await user.click(screen.getByRole('button', { name: 'Create template version' }));
    await screen.findByText('Notification template version created.');
    await user.selectOptions(screen.getByLabelText('Template', { selector: 'select' }), 'general-notice');
    await user.click(screen.getByRole('button', { name: 'Send notice' }));
    await screen.findByText(/Sent to 2 recipients/);
    await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/admin/notifications', 'POST', expect.objectContaining({ templateId: 'general-notice' }), { 'Idempotency-Key': expect.any(String) }));
  });

  it('refreshes the authoritative inbox on a generic realtime invalidation', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/me/notifications')) return { items: [] };
      if (path === '/me/notification-preferences') return { emailNonessential: true, inApp: true, locale: 'en' };
      if (path === '/courses?pageSize=100') return { items: [] };
      return undefined;
    });
    render(<NotificationsWorkspace locale="en" roles={['student']} />);
    await screen.findByText('Notification inbox');
    const before = transport.api.mock.calls.filter(([path]) => path.startsWith('/me/notifications')).length;
    realtime.connected = true;
    realtime.subscriber?.onStatus(true);
    await screen.findByText('Live updates connected');
    realtime.subscriber?.onChange();
    await waitFor(() => expect(transport.api.mock.calls.filter(([path]) => path.startsWith('/me/notifications')).length).toBeGreaterThan(before));
  });

  it('blocks the workspace with a required critical notice until acknowledged', async () => {
    let acknowledged = false;
    transport.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/me/notifications')) return { items: acknowledged ? [] : [{
        id: 'required-1', severity: 'critical', subject: 'Exam room changed', body: 'Check your new exam room.',
        createdAt: '2026-11-16T10:00:00Z', requireAcknowledgement: true, acknowledgedAt: null,
      }] };
      if (path === '/me/notifications/required-1/acknowledgements') { acknowledged = true; return undefined; }
      return undefined;
    });
    render(<CriticalNoticePrompt locale="en" />);
    await screen.findByRole('dialog', { name: 'Exam room changed' });
    expect(screen.getByText('Acknowledgement is required to continue.')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'I have read and acknowledge' }));
    await waitFor(() => expect(transport.api).toHaveBeenCalledWith('/me/notifications/required-1/acknowledgements', 'POST'));
  });
});
