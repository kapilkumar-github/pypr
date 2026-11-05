"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BotMessageSquare,
  FileText,
  GraduationCap,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  SquareKanban,
  type LucideIcon,
} from "lucide-react"

import { Logo } from "@/components/brand/logo"
import { UserMenu } from "@/components/app/user-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

type NavItem = { title: string; href: string; icon: LucideIcon; soon?: boolean }

const nav: NavItem[] = [
  { title: "Resumes", href: "/resumes", icon: FileText },
  { title: "Job match", href: "/job-match", icon: ScanSearch },
  { title: "Interview prep", href: "/interview-prep", icon: GraduationCap, soon: true },
  { title: "Mock interview", href: "/mock-interview", icon: BotMessageSquare, soon: true },
  { title: "Job tracker", href: "/job-tracker", icon: SquareKanban, soon: true },
]

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-2">
        <Logo href="/resumes" collapsible className="self-start" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {nav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  {item.soon ? (
                    <SidebarMenuButton aria-disabled tooltip={`${item.title} (coming soon)`} className="opacity-60">
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)} tooltip={item.title}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                  {item.soon && <SidebarMenuBadge className="text-[10px] text-muted-foreground">Soon</SidebarMenuBadge>}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
        <CollapseButton />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** Replaces the old header trigger: collapses to icons on desktop, closes the sheet on mobile. */
function CollapseButton() {
  const { state, isMobile, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="sm"
          onClick={toggleSidebar}
          tooltip={collapsed ? "Expand sidebar" : undefined}
          className="text-muted-foreground"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span>{isMobile ? "Close menu" : "Collapse"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
