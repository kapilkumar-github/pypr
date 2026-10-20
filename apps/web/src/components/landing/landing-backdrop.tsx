import { DotBackground } from './dot-background';

/** Decorative layer behind the landing page: dot grid, ambient glow and outline shapes. */
export function LandingBackdrop() {
  return (
    <>
      <DotBackground />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-ink/[0.025] blur-3xl"
      />

      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-32 -left-20 h-56 w-56 rotate-12 rounded-3xl border border-ink/[0.07] bg-ink/[0.015]" />

        <div className="absolute top-[12%] right-[8%] hidden h-52 w-40 rotate-[14deg] rounded-xl border border-ink/[0.09] bg-surface/80 shadow-2xl lg:block">
          <div className="p-5">
            <div className="mb-5 h-2 w-16 rounded-full bg-ink/[0.12]" />
            <div className="space-y-3">
              <div className="h-1.5 w-full rounded-full bg-ink/[0.06]" />
              <div className="h-1.5 w-4/5 rounded-full bg-ink/[0.06]" />
              <div className="h-1.5 w-5/6 rounded-full bg-ink/[0.06]" />
            </div>
            <div className="mt-8 h-16 rounded-lg border border-ink/[0.05] bg-ink/[0.02]" />
          </div>
        </div>

        <div className="absolute bottom-[15%] left-[10%] hidden h-32 w-32 rotate-45 border border-ink/[0.07] bg-ink/[0.01] lg:block" />
        <div className="absolute -right-24 -bottom-24 h-72 w-72 rounded-full border border-ink/[0.06]" />
        <div className="absolute top-[22%] left-[18%] h-3 w-3 rotate-45 border border-ink/20" />
        <div className="absolute top-[35%] right-[22%] h-2 w-2 rounded-full bg-ink/20" />
      </div>
    </>
  );
}
