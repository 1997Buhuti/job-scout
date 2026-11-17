'use client';

import { useState } from 'react';
import { CvUploadCard } from './CvUploadCard';
import { TargetRolesCard } from './TargetRolesCard';
import { PreferencesCard } from './PreferencesCard';
import { ScheduleSettingsCard } from './ScheduleSettingsCard';
import { useUserProfile } from '@/features/profile/context/UserProfileContext';
import { updateProfile, type UserProfileData } from '@/lib/api/profileService';

export function ProfileView() {
  const { profile, refresh } = useUserProfile();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (updatedSkills?: string[]) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      // Build profile update payload
      const payload: Partial<UserProfileData> = {
        targetRoles: profile?.targetRoles || [],
      };
      
      // Include cvProfile with skills if provided
      if (updatedSkills !== undefined) {
        payload.cvProfile = {
          skills: updatedSkills,
          experience: profile?.cvProfile?.experience || [],
          education: profile?.cvProfile?.education || [],
          extractedAt: profile?.cvProfile?.extractedAt || new Date().toISOString(),
          sourceCvS3Key: profile?.cvProfile?.sourceCvS3Key || '',
        };
      }

      // Call PUT /me/profile endpoint
      await updateProfile(payload);
      await refresh(true);
      setToastMessage(updatedSkills ? 'Skills saved successfully' : 'Profile updated successfully');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 4000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setSaveError(err instanceof Error ? err.message : 'Save failed. Please try again.');
      setToastMessage(saveError || 'Save failed. Please try again.');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 4000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-12">
      {/* Header Section */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-surface-container-high px-2 py-1 font-mono text-[11px] font-medium text-secondary">
              AWS COGNITO & S3 SYNC
            </span>
            <span className="font-mono text-[11px] text-outline">
              ID: us-east-1_x9f87a
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-on-surface sm:text-3xl md:text-4xl">
            User Profile & CV Management
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Manage your master resume data, AI parsing metrics, target roles, and automated recruiter preferences.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => alert('Version history modal placeholder')}
            className="flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-bright transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              history
            </span>
            Version History
          </button>

          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="relative flex items-center justify-center gap-2 overflow-hidden rounded-lg bg-secondary px-5 py-2.5 text-sm font-medium text-on-secondary shadow-[0_0_20px_rgba(78,222,163,0.3)] hover:bg-secondary-fixed transition-all disabled:opacity-75"
          >
            <span className={`material-symbols-outlined text-[18px] ${isSaving ? 'animate-spin' : ''}`}>
              {isSaving ? 'sync' : 'cloud_sync'}
            </span>
            {isSaving ? 'Syncing...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 Cols) */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <CvUploadCard />
        </div>

        {/* Right Column (5 Cols) */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <TargetRolesCard />
          <PreferencesCard />
          <ScheduleSettingsCard />
        </div>
      </div>

      {/* Toast Notification */}
      <div
        className={`fixed bottom-4 left-4 right-4 z-50 transform transition-all duration-300 pointer-events-none sm:left-auto sm:right-6 sm:bottom-6 ${
          showToast
            ? 'translate-y-0 opacity-100'
            : 'translate-y-20 opacity-0'
        }`}
      >
        <div className="flex items-center gap-3 rounded-xl border border-secondary/30 bg-surface-container-high px-5 py-3 shadow-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/20 text-secondary">
            <span className="material-symbols-outlined text-[18px]">
              check_circle
            </span>
          </div>
          <div>
            <div className="text-sm font-medium text-on-surface">Successfully Synced</div>
            <div className="text-xs text-outline">{toastMessage}</div>
          </div>
        </div>
      </div>
    </div>
  );
}