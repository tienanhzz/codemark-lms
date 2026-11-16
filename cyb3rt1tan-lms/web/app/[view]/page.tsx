import { notFound } from 'next/navigation';
import { Workspace } from '../../components/Workspace';
import { PasswordRecovery } from '../../components/PasswordRecovery';
import { previewPages } from '../../lib/workspaceCatalog';
const views = [
  'activity',
  'courses',
  'academic-catalogs',
  'course-rules',
  'profile',
  'security',
  'settings',
  'accounts',
  'imports',
  'profile-support',
  'mfa-policy',
  'accept-invitation',
  'forgot-password',
  'reset-password',
  ...previewPages.map((page) => page.id),
];
export async function generateStaticParams() {
  return views.map((view) => ({ view }));
}
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  if (view === 'forgot-password' || view === 'reset-password')
    return <PasswordRecovery reset={view === 'reset-password'} />;
  return <Workspace initialView={view} />;
}
