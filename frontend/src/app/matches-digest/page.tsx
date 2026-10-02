import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MatchesDigestView } from '@/features/matches-digest/components/MatchesDigestView';

export const metadata = {
  title: 'Matches & Digest | Job Scout',
};

export default function MatchesDigestPage() {
  return (
    <DashboardLayout>
      <MatchesDigestView />
    </DashboardLayout>
  );
}
