import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PortalsView } from '@/features/portals/components/PortalsView';

export const metadata = {
  title: 'Portals | Job Scout',
};

export default function PortalsPage() {
  return (
    <DashboardLayout>
      <PortalsView />
    </DashboardLayout>
  );
}
