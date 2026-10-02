'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileSidebarProvider } from './MobileSidebarContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <MobileSidebarProvider>
        <div className="min-h-screen bg-surface font-sans text-on-surface">
          <Sidebar />
          <div className="lg:pl-64">
            <Header />
            <main className="relative min-h-screen pt-16 px-4 py-4 bg-surface sm:px-6 sm:py-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </MobileSidebarProvider>
    </ProtectedRoute>
  );
}
