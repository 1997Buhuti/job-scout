import Link from 'next/link';

const PORTALS = [
  'TopJobs.lk',
  'Rooster.jobs',
  'Careers.lk',
  'ITPro.lk',
  'JobSeeker.lk',
] as const;

type AuthBrandPanelProps = {
  highlights: string[];
  showTrustFooter?: boolean;
};

/**
 * Left panel shared by Sign In / Sign Up (Stitch: Job Scout Portal).
 */
export function AuthBrandPanel({
  highlights,
  showTrustFooter = false,
}: AuthBrandPanelProps) {
  return (
    <div className="relative flex flex-col justify-between overflow-hidden bg-surface-container-lowest p-10 lg:col-span-6">
      <div className="pointer-events-none absolute -mt-32 -mr-32 top-0 right-0 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />

      <div>
        <Link href="/" className="mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined text-[28px] text-secondary">
            radar
          </span>
          <span className="text-2xl font-semibold tracking-tight text-primary">
            Job Scout
          </span>
        </Link>

        <h1 className="mb-4 text-3xl font-semibold tracking-tight text-on-surface sm:text-4xl">
          Find Your Next Tech Role Effortlessly
        </h1>
        <p className="mb-10 text-base leading-6 text-on-surface-variant">
          Job Scout aggregates listings across top Sri Lankan tech portals,
          matches your CV with AI precision, and delivers personalized digests
          straight to your inbox.
        </p>

        <div className="mb-6 space-y-4">
          {highlights.map((item) => (
            <div
              key={item}
              className="flex items-center gap-3 text-sm font-medium text-on-surface"
            >
              <span className="material-symbols-outlined text-[18px] text-secondary">
                check_circle
              </span>
              {item}
            </div>
          ))}
        </div>

        <div>
          <label className="mb-2 block font-mono text-[11px] font-medium tracking-wide text-outline uppercase">
            Integrated Sri Lankan Portals
          </label>
          <div className="flex flex-wrap gap-2">
            {PORTALS.map((portal) => (
              <span
                key={portal}
                className="rounded-lg border border-outline-variant/30 bg-surface-container px-3 py-1 text-sm text-on-surface"
              >
                {portal}
              </span>
            ))}
          </div>
        </div>
      </div>

      {showTrustFooter ? (
        <div className="mt-10 flex items-center justify-between border-t border-outline-variant/20 pt-4 text-sm text-outline">
          <span>Trusted by 10,000+ local tech professionals</span>
          <span className="font-mono text-secondary">Secure &amp; Encrypted</span>
        </div>
      ) : null}
    </div>
  );
}
