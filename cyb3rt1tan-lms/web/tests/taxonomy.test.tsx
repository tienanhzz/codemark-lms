import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TaxonomyManager } from '../components/TaxonomyManager';
import source from '../public/learning-taxonomy.example.json';

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: transport.api,
}));
const catalog = (scope = 'question') => ({
  scope,
  catalogVersion: 1,
  categories: source.categories.map(({ name, ...node }) => ({ ...node, names: { ...name } })),
  tags: source.tags.map(({ name, ...node }) => ({
    ...node,
    names: { ...name },
    applicability: [] as string[],
  })),
});

describe('Taxonomy management', () => {
  it('shows canonical counts and searches bilingual names and IDs with parent context', async () => {
    transport.api.mockResolvedValue(catalog());
    const user = userEvent.setup();
    render(<TaxonomyManager locale="en" roles={['admin']} />);
    await screen.findByText('6 categories · 67 tags');
    const search = screen.getByRole('searchbox', { name: 'Search taxonomy' });
    await user.type(search, 'nested-loops');
    const child = screen.getByRole('row', { name: /Nested Loops/ });
    expect(within(child).getByText('Loops')).toBeTruthy();
    expect(screen.getByRole('row', { name: /^Loops/ })).toBeTruthy();
    expect(screen.queryByRole('row', { name: /Variables and Data Types/ })).toBeNull();
    await user.clear(search);
    await user.type(search, 'Biến và kiểu dữ liệu');
    expect(screen.getByRole('row', { name: /Variables and Data Types/ })).toBeTruthy();
    expect(screen.queryByRole('row', { name: /Nested Loops/ })).toBeNull();
    expect(screen.getByText('6 categories · 67 tags')).toBeTruthy();
    await user.clear(search);
    await user.type(search, 'not-a-catalog-entry');
    expect(screen.queryByRole('row')).toBeNull();
    expect(screen.getByText('6 categories · 67 tags')).toBeTruthy();
  });

  it('keeps the latest scope visible when an earlier request completes late', async () => {
    let resolveQuestion!: (value: ReturnType<typeof catalog>) => void;
    const question = new Promise<ReturnType<typeof catalog>>((resolve) => {
      resolveQuestion = resolve;
    });
    const content = catalog('content');
    content.categories[0].names.en = 'Lesson-only category';
    transport.api.mockImplementation((path: string) =>
      path.startsWith('/question-taxonomy') ? question : Promise.resolve(content),
    );
    const user = userEvent.setup();
    render(<TaxonomyManager locale="en" roles={['admin']} />);
    await user.click(screen.getByRole('button', { name: 'Lesson taxonomy' }));
    await screen.findByText('Lesson-only category');
    await act(async () => {
      resolveQuestion(catalog());
    });
    expect(screen.getByText('Lesson-only category')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Lesson taxonomy' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('explains applicability and preserves navigation-only tags when editing', async () => {
    const data = catalog();
    data.tags[0].selectable = false;
    data.tags[0].applicability = ['code'];
    transport.api.mockResolvedValue(data);
    const user = userEvent.setup();
    render(<TaxonomyManager locale="en" roles={['admin']} />);
    const row = await screen.findByRole('row', { name: /Variables and Data Types/ });
    expect(within(row).getByText('Code')).toBeTruthy();
    expect(within(row).getByText('Navigation only')).toBeTruthy();
    await user.click(within(row).getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('Selectable for tagging') as HTMLInputElement).checked).toBe(
      false,
    );
    await user.clear(screen.getByLabelText('English name'));
    await user.type(screen.getByLabelText('English name'), 'Renamed topic');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(
        '/admin/question-taxonomy/tags/variables-data-types',
        'PATCH',
        expect.objectContaining({
          names: expect.objectContaining({ en: 'Renamed topic' }),
          selectable: false,
          applicability: ['code'],
        }),
      ),
    );
  });

  it('does not display the previous scope after the next scope fails to load', async () => {
    transport.api.mockImplementation(async (path: string) => {
      if (path.startsWith('/question-taxonomy')) return catalog();
      throw new Error('connection_error');
    });
    const user = userEvent.setup();
    render(<TaxonomyManager locale="en" roles={['admin']} />);
    await screen.findByText('6 categories · 67 tags');
    await user.click(screen.getByRole('button', { name: 'Lesson taxonomy' }));
    await screen.findByRole('alert');
    expect(screen.queryByRole('row', { name: /Variables and Data Types/ })).toBeNull();
  });

  it('keeps merge and retirement scoped to the lesson catalog', async () => {
    const data = catalog('content');
    transport.api.mockResolvedValue(data);
    const user = userEvent.setup();
    render(<TaxonomyManager locale="en" roles={['admin']} />);
    await user.click(screen.getByRole('button', { name: 'Lesson taxonomy' }));
    const row = await screen.findByRole('row', { name: /Variables and Data Types/ });
    await user.click(within(row).getByRole('button', { name: 'Merge' }));
    await user.selectOptions(screen.getByLabelText('Surviving entry'), 'operators-expressions');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(
        '/admin/taxonomy/tags/variables-data-types/merge',
        'POST',
        { targetId: 'operators-expressions' },
      ),
    );
    await screen.findByText(
      'Entry merged. Historical IDs now resolve through an audited redirect.',
    );
    const target = await screen.findByRole('row', { name: /Operators and Expressions/ });
    await user.click(within(target).getByRole('button', { name: 'Retire' }));
    await waitFor(() =>
      expect(transport.api).toHaveBeenCalledWith(
        '/admin/taxonomy/tags/operators-expressions',
        'PATCH',
        { status: 'retired' },
      ),
    );
  });

  it('localizes hierarchy and unrestricted applicability in Vietnamese', async () => {
    transport.api.mockResolvedValue(catalog());
    const user = userEvent.setup();
    render(<TaxonomyManager locale="vi" roles={['admin']} />);
    await screen.findByText('6 danh mục · 67 thẻ');
    await user.type(screen.getByRole('searchbox', { name: 'Tìm phân loại' }), 'nested-loops');
    const child = screen.getByRole('row', { name: /Vòng lặp lồng nhau/ });
    expect(within(child).getByRole('link', { name: 'Vòng lặp' })).toBeTruthy();
    expect(within(child).getByText('Mọi loại câu hỏi')).toBeTruthy();
  });
});
