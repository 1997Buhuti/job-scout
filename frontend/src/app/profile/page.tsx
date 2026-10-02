import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { ProfileView } from '@/features/profile/components/ProfileView';

export const metadata = {
  title: 'Profile & CV Management | Job Scout',
  description: 'Manage master resume, target roles, and automated recruiter preferences.',
};

export default function ProfilePage() {
  return (
    <DashboardLayout>
      <ProfileView />
    </DashboardLayout>
  );
}
