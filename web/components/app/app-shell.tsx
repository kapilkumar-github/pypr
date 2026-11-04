"use client"

import { AppSidebar } from "@/components/app/app-sidebar"
import { Logo } from "@/components/brand/logo"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

/** Sidebar navigation + scrollable content. No top bar on desktop; phones get a slim bar to open the menu. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-svh">
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3 md:hidden">
          <SidebarTrigger />
          <Logo href="/resumes" size="sm" />
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
