import { AuthShowcase } from "@/components/auth/auth-showcase"

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen">
      <AuthShowcase />
      <main className="flex-1">{children}</main>
    </div>
  )
}
