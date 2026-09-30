import { HomeAuthActions } from '@/features/auth/components/HomeAuthActions';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-6 flex items-center gap-2">
        <span className="material-symbols-outlined text-[28px] text-secondary">
          radar
        </span>
        <p className="font-mono text-xs font-medium tracking-[0.2em] text-outline uppercase">
          Job Scout
        </p>
      </div>
      <h1 className="max-w-xl text-center text-4xl font-semibold tracking-tight text-on-surface">
        Find Your Next Tech Role Effortlessly
      </h1>
      <p className="mt-4 max-w-md text-center text-base text-on-surface-variant">
        Track openings, compare fits, and keep applications in one place.
      </p>
      <HomeAuthActions />
    </main>
  );
}
