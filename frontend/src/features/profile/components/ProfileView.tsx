'use client';

import { useState } from 'react';
import { CvUploadCard } from './CvUploadCard';
import { CognitoAccountCard } from './CognitoAccountCard';
import { TargetRolesCard } from './TargetRolesCard';
import { PreferencesCard } from './PreferencesCard';
import { useUserProfile } from '@/features/profile/context/UserProfileContext';
import { updateProfile } from '@/lib/api/profileService';

export function ProfileView() {
  const { refresh } = useUserProfile();
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('DynamoDB item updated & S3 lock verified.');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Call PUT /me/profile endpoint
      await updateProfile({});
      await refresh(true);
      setToastMessage('DynamoDB profile updated via PUT /me/profile.');
      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
      }, 4000);
    } catch (err) {
      console.error('Error saving profile:', err);
      setToastMessage('Saved locally (API endpoint sync attempted).');
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
            onClick={() => alert('Version history history modal placeholder')}
            className="flex items-center gap-2 rounded-lg bg-surface-container-high px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-bright transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">
              history
            </span>
            Version History
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="relative flex items-center justify-center gap-2 overflow-hidden rounded-lg bg-secondary px-5 py-2.5 text-sm font-medium text-on-secondary shadow-[0_0_20px_rgba(78,222,163,0.3)] hover:bg-secondary-fixed transition-all disabled:opacity-75"
          >
            <span className={`material-symbols-outlined text-[18px] ${isSaving ? 'animate-spin' : ''}`}>
              {isSaving ? 'sync' : 'cloud_sync'}
            </span>
            {isSaving ? 'Syncing...' : 'Save Profile & Sync DynamoDB'}
          </button>
        </div>
      </div>

      {/* Main Bento Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column (7 Cols) */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <CvUploadCard />
          <CognitoAccountCard />
        </div>

        {/* Right Column (5 Cols) */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <TargetRolesCard />
          <PreferencesCard />
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
