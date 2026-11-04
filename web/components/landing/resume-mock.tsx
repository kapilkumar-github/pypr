import { cn } from "@/lib/utils"

// Decorative resume previews. Paper uses the fixed resume palette (see design.md, "Resume paper").

export type ResumeMockData = {
  format: string
  name: string
  role: string
  contact: string
  summaryLabel: string
  summary: string
  experienceLabel: string
  jobs: { title: string; company: string; dates: string; bullets?: React.ReactNode[] }[]
  skillsLabel: string
  skills: string[]
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
      {children}
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

export function Metric({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>
}

export function ResumeMock({
  data,
  accent,
  featured = false,
  className,
}: {
  data: ResumeMockData
  accent: string
  featured?: boolean
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex flex-col rounded-lg bg-white text-left text-slate-700 ring-1 ring-slate-200",
        featured ? "w-[350px] p-7 shadow-2xl sm:w-[390px] lg:w-[420px]" : "w-[320px] p-6 shadow-xl lg:w-[350px]",
        className,
      )}
    >
      <div className="mb-4 border-b border-slate-200 pb-4">
        <span
          className="mb-2 inline-block rounded border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase"
          style={{ color: accent, borderColor: `${accent}40`, backgroundColor: `${accent}0d` }}
        >
          {data.format}
        </span>
        <p className={cn("font-extrabold tracking-tight text-slate-900", featured ? "text-xl" : "text-lg")}>
          {data.name}
        </p>
        <p className="mt-0.5 text-xs font-semibold" style={{ color: accent }}>
          {data.role}
        </p>
        <p className="mt-1 text-[11px] text-slate-500">{data.contact}</p>
      </div>

      <div className="mb-4">
        <Heading>{data.summaryLabel}</Heading>
        <p className={cn("leading-relaxed", featured ? "text-[12px]" : "text-[11px]")}>{data.summary}</p>
      </div>

      <div className="mb-4 space-y-3">
        <Heading>{data.experienceLabel}</Heading>
        {data.jobs.map((job) => (
          <div key={job.title}>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="font-bold text-slate-900">{job.title}</span>
              <span className="text-[10px] text-slate-500">{job.dates}</span>
            </div>
            <span className="text-[10px] font-semibold" style={{ color: accent }}>
              {job.company}
            </span>
            {job.bullets && (
              <ul className={cn("mt-1.5 list-disc space-y-1 pl-4 leading-snug", featured ? "text-[12px]" : "text-[11px]")}>
                {job.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-slate-200 pt-3">
        <Heading>{data.skillsLabel}</Heading>
        <div className="flex flex-wrap gap-1.5">
          {data.skills.map((s) => (
            <span
              key={s}
              className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
