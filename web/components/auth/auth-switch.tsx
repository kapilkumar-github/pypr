import Link from "next/link"
import { ArrowRight } from "lucide-react"

/** "Don't have an account? Sign up →" link for the auth panel's top bar. */
export function AuthSwitch({ prompt, href, label }: { prompt?: string; href: string; label: string }) {
  return (
    <span>
      {prompt && <span className="hidden sm:inline">{prompt} </span>}
      <Link href={href} className="inline-flex items-center gap-0.5 font-bold text-primary hover:underline">
        {label} <ArrowRight className="size-3.5" />
      </Link>
    </span>
  )
}
