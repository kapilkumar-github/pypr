import { LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SubmitButton({
  pending,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
      {children}
    </Button>
  )
}
