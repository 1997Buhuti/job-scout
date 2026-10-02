'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useMobileSidebar } from './MobileSidebarContext';

interface NavItem {
  label: string;
  path: string;
  icon: string;
}

const navItems: NavItem[] = [
  { label: 'Matches & Digest', path: '/matches-digest', icon: 'auto_awesome' },
  { label: 'Profile & CV', path: '/profile', icon: 'badge' },
  { label: 'Scheduler', path: '/scheduler', icon: 'schedule' },
  { label: 'Portals', path: '/portals', icon: 'hub' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isOpen, close } = useMobileSidebar();

  // Close sidebar on route change (mobile)
  useEffect(() => {
    close();
  }, [pathname, close]);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop overlay – mobile only */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Sidebar panel */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col bg-surface-container-low px-4 py-6 border-r border-outline-variant/10 transition-transform duration-300 ease-in-out lg:w-64 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="mb-8 flex items-center justify-between px-2">
          <Link href="/profile" className="flex items-center gap-2 text-headline-sm font-bold tracking-tight text-primary">
            <span className="material-symbols-outlined text-[20px] text-secondary">
              radar
            </span>
            Job Scout
          </Link>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-secondary shadow-[0_0_8px_rgba(78,222,163,0.6)]" />
            {/* Close button – mobile only */}
            <button
              type="button"
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors lg:hidden"
              aria-label="Close sidebar"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (pathname === '/' && item.path === '/profile');
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                  isActive
                    ? 'bg-surface-container-high font-medium text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container-high/50 hover:text-on-surface'
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-secondary' : ''}`}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* AI Engine Status Footer Widget */}
        <div className="mt-auto px-1">
          <div className="rounded-xl bg-surface-container p-3 text-xs text-on-surface-variant">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] font-medium text-secondary">AI Engine</span>
              <span className="text-[11px] text-outline">Active</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-variant">
              <div className="h-full w-3/4 bg-secondary shadow-[0_0_6px_rgba(78,222,163,0.4)]" />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
