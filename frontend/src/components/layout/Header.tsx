'use client';

import { useState } from 'react';

import { ProfileOverlayCard } from '@/features/profile/components/ProfileOverlayCard';
import { useUserProfile } from '@/features/profile/context/UserProfileContext';
import { useMobileSidebar } from './MobileSidebarContext';

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const { user } = useUserProfile();
  const { toggle } = useMobileSidebar();

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : null;

  return (
    <header className="fixed top-0 right-0 z-40 flex h-16 items-center justify-between bg-surface/80 px-4 backdrop-blur-xl border-b border-outline-variant/10 left-0 lg:left-64 lg:px-8">
      {/* Left side: hamburger + search */}
      <div className="flex items-center gap-3">
        {/* Hamburger – mobile only */}
        <button
          type="button"
          onClick={toggle}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors lg:hidden"
          aria-label="Toggle sidebar"
        >
          <span className="material-symbols-outlined text-[22px]">menu</span>
        </button>

        <span className="material-symbols-outlined text-outline text-[20px] hidden sm:inline">
          search
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search jobs, companies, keywords..."
          className="w-40 bg-transparent text-sm text-on-surface placeholder:text-outline outline-none sm:w-80 hidden sm:block"
        />
      </div>

      {/* Actions & Profile */}
      <div className="relative flex items-center gap-2 sm:gap-3">
        {/* Mobile search toggle */}
        <button
          type="button"
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors sm:hidden"
          title="Search"
        >
          <span className="material-symbols-outlined text-[20px]">
            search
          </span>
        </button>

        <button
          type="button"
          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
          title="Notifications"
        >
          <span className="material-symbols-outlined text-[20px]">
            notifications
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIsProfileOpen((prev) => !prev)}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-secondary/50 ${
            isProfileOpen
              ? 'ring-2 ring-secondary bg-secondary text-on-secondary shadow-[0_0_12px_rgba(78,222,163,0.4)]'
              : 'bg-surface-container-high hover:bg-surface-bright text-on-surface border border-outline-variant/30'
          }`}
          title="User Profile Menu"
          aria-expanded={isProfileOpen}
        >
          {initials ? (
            <span className="text-xs font-bold tracking-tight">{initials}</span>
          ) : (
            <span className="material-symbols-outlined text-[18px]">
              person
            </span>
          )}
        </button>

        <ProfileOverlayCard
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
        />
      </div>
    </header>
  );
}
