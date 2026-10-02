import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { SchedulerView } from '@/features/scheduler/components/SchedulerView';

export const metadata = {
  title: 'Scheduler | Job Scout',
};

export default function SchedulerPage() {
  return (
    <DashboardLayout>
      <SchedulerView />
    </DashboardLayout>
  );
}
