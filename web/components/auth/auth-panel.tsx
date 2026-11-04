import { Logo } from "@/components/brand/logo"

/**
 * Right-hand side of the auth split layout: top bar (mobile logo, page switch link),
 * centered title + form, and a footer. Form controls inside match the auth design: inputs 46px, submit 48px, rounded-xl.
 */
export function AuthPanel({
  title,
  description,
  switcher,
  footer,
  children,
}: {
  title: string
  description?: React.ReactNode
  switcher?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col bg-card p-6 sm:p-10 lg:p-14">
      <div className="flex items-center justify-between gap-4">
        <div className="lg:invisible">
          <Logo />
        </div>
        <div className="text-sm">
          {switcher && <div className="text-muted-foreground">{switcher}</div>}
        </div>
      </div>

      <div className="mx-auto my-auto w-full max-w-[420px] py-10 [&_[data-slot=input]]:h-[46px] [&_[data-slot=input]]:rounded-xl [&_[data-slot=input]]:px-4 [&_button[type=submit]]:h-12 [&_button[type=submit]]:rounded-xl [&_button[type=submit]]:font-bold [&_button[type=submit]]:shadow-lg [&_button[type=submit]]:shadow-primary/25">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h1>
          {description && <p className="text-base text-muted-foreground">{description}</p>}
        </div>
        {children}
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>

      <p className="text-center text-xs text-muted-foreground lg:text-left">© pypr. Career tools for job seekers.</p>
    </div>
  )
}
