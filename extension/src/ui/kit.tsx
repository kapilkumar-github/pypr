import markUrl from "../../public/icon/48.png?inline"
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react"

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ")

type Variant = "primary" | "outline" | "ghost" | "danger"

export function Button({ variant = "outline", small, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; small?: boolean }) {
  const base = "pp-focus inline-flex items-center justify-center gap-1.5 rounded-md border font-medium whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
  const size = small ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm"
  const look = {
    primary: "bg-primary text-primary-foreground border-primary hover:opacity-90",
    outline: "bg-card text-foreground border-input hover:bg-muted",
    ghost: "bg-transparent text-foreground border-transparent hover:bg-muted",
    danger: "bg-card text-destructive border-input hover:bg-muted",
  }[variant]
  return <button type="button" {...p} className={cx(base, size, look, className)} />
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

const control = "pp-focus w-full rounded-md border border-input bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground"
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(control, "h-8", p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(control, "py-1.5 leading-snug", p.className)} />
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(control, "h-8", p.className)} />

const tone = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-success/15 text-success",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/15 text-destructive",
  info: "bg-accent text-accent-foreground",
}
export function Badge({ tone: t = "neutral", children, title }: { tone?: keyof typeof tone; children: ReactNode; title?: string }) {
  return <span title={title} className={cx("inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-medium", tone[t])}>{children}</span>
}

export function Notice({ tone: t = "info", children, onClose }: { tone?: "info" | "warn" | "bad" | "good"; children: ReactNode; onClose?: () => void }) {
  const look = { info: "border-border bg-accent text-accent-foreground", warn: "border-warning/40 bg-warning/10 text-foreground", bad: "border-destructive/40 bg-destructive/10 text-foreground", good: "border-success/40 bg-success/10 text-foreground" }[t]
  return (
    <div role={t === "bad" ? "alert" : "status"} className={cx("flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs", look)}>
      <div className="min-w-0 flex-1">{children}</div>
      {onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="pp-focus cursor-pointer text-muted-foreground">×</button>}
    </div>
  )
}

export function Spinner() {
  return <span aria-hidden className="pp-spin inline-block size-3.5 rounded-full border-2 border-current border-t-transparent" />
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx("pp-focus relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-input", checked ? "bg-primary" : "bg-muted")}>
      <span className={cx("inline-block size-3.5 rounded-full bg-white", checked ? "ml-[18px]" : "ml-[2px]")} />
    </button>
  )
}

// The same mark as the web app's icon, inlined so it loads inside a page's shadow root without exposing a resource.
export const PyprMark = ({ size = 20 }: { size?: number }) => <img src={markUrl} width={size} height={size} alt="" aria-hidden="true" draggable={false} />
