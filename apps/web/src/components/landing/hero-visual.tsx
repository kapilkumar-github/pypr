function Bar({ className }: { className: string }) {
  return <div className={`rounded ${className}`} />;
}

/** Floating resume sheet and pen. Purely decorative. */
export function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto h-[520px] w-full max-w-[560px] lg:mr-0">
      <div className="absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-3xl" />
      <div className="absolute top-1/2 left-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-ink/[0.04]" />

      {/* Resume sheet */}
      <div className="absolute top-[8%] left-[12%] w-[280px] rotate-[-7deg] transition-transform duration-700 hover:rotate-[-3deg] sm:w-[310px]">
        <div className="relative aspect-[8.5/11] rounded-lg border border-paper-edge bg-paper p-7 shadow-paper">
          <div className="flex items-start justify-between">
            <div>
              <Bar className="h-5 w-32 bg-paper-ink" />
              <Bar className="mt-2 h-2 w-24 bg-paper-muted" />
            </div>
            <div className="h-10 w-10 rounded-full bg-paper-line" />
          </div>

          <div className="mt-8">
            <Bar className="mb-3 h-2 w-20 bg-paper-ink" />
            <div className="space-y-2">
              <Bar className="h-1.5 w-full bg-paper-line" />
              <Bar className="h-1.5 w-[92%] bg-paper-line" />
              <Bar className="h-1.5 w-[78%] bg-paper-line" />
            </div>
          </div>

          <div className="mt-8">
            <Bar className="mb-4 h-2 w-24 bg-paper-ink" />
            <div className="mb-5">
              <div className="flex justify-between">
                <Bar className="h-2 w-28 bg-paper-muted" />
                <Bar className="h-1.5 w-14 bg-paper-line" />
              </div>
              <div className="mt-3 space-y-1.5">
                <Bar className="h-1.5 w-full bg-paper-line" />
                <Bar className="h-1.5 w-[88%] bg-paper-line" />
                <Bar className="h-1.5 w-[75%] bg-paper-line" />
              </div>
            </div>
            <div>
              <div className="flex justify-between">
                <Bar className="h-2 w-24 bg-paper-muted" />
                <Bar className="h-1.5 w-14 bg-paper-line" />
              </div>
              <div className="mt-3 space-y-1.5">
                <Bar className="h-1.5 w-full bg-paper-line" />
                <Bar className="h-1.5 w-[82%] bg-paper-line" />
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Bar className="mb-3 h-2 w-16 bg-paper-ink" />
            <div className="flex flex-wrap gap-2">
              <Bar className="h-5 w-14 bg-paper-line" />
              <Bar className="h-5 w-16 bg-paper-line" />
              <Bar className="h-5 w-12 bg-paper-line" />
              <Bar className="h-5 w-20 bg-paper-line" />
            </div>
          </div>

          <div className="absolute right-7 bottom-7 h-1 w-12 rounded-full bg-paper-ink/70" />
        </div>
        <div className="absolute -bottom-3 left-4 -z-10 h-full w-full rounded-lg bg-ink/[0.035]" />
      </div>

      {/* Pen */}
      <div className="absolute right-[7%] bottom-[14%] z-20 animate-pen-float will-change-transform">
        <div className="rotate-[40deg]">
          <div className="relative h-6 w-44 rounded-full bg-paper-line shadow-float">
            <div className="absolute inset-y-0 right-8 left-8 rounded-full bg-gradient-to-b from-paper to-paper-muted" />
            <div className="absolute top-1/2 left-7 h-4 w-10 -translate-y-1/2 rounded-full bg-ink-subtle/70" />
            <div className="absolute -top-2 right-10 h-8 w-1.5 rounded-full bg-paper-muted" />
            <div className="absolute top-1/2 -left-5 -translate-y-1/2 border-t-[12px] border-r-[20px] border-b-[12px] border-t-transparent border-r-paper-muted border-b-transparent" />
            <div className="absolute top-1/2 -left-7 -translate-y-1/2 border-t-[3px] border-r-[7px] border-b-[3px] border-t-transparent border-r-paper-ink border-b-transparent" />
            <div className="absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 rounded-full bg-ink-subtle" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-[12%] left-[5%] h-24 w-20 rotate-[18deg] rounded-md border border-ink/[0.08] bg-ink/[0.035] shadow-2xl" />
      <div className="absolute top-[15%] right-[5%] h-12 w-12 rotate-12 rounded-lg border border-accent/[0.18] bg-accent/[0.03]" />
      <div className="absolute right-[25%] bottom-[28%] h-2 w-2 rounded-full bg-accent/50" />
    </div>
  );
}
