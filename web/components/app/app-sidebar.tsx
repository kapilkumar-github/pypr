"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  ArrowLeft,
  Blocks,
  BotMessageSquare,
  FileText,
  LayoutDashboard,
  ListChecks,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
  SquareKanban,
  Target,
  type LucideIcon,
} from "lucide-react"

import { Logo } from "@/components/brand/logo"
import { UserMenu } from "@/components/app/user-menu"
import { useWorkspace } from "@/lib/api/workspaces"
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"

type NavItem = { title: string; href: string; icon: LucideIcon; soon?: boolean }

const nav: NavItem[] = [
  { title: "Workspaces", href: "/workspaces", icon: Target },
  { title: "Resumes", href: "/resumes", icon: FileText },
  { title: "Job match", href: "/job-match", icon: ScanSearch },
  { title: "Mock interview", href: "/mock-interview", icon: BotMessageSquare, soon: true },
  { title: "Job tracker", href: "/job-tracker", icon: SquareKanban },
]

const UUID = /^\/workspaces\/([0-9a-f-]{36})(?:\/|$)/i

type WorkspaceItem = { slug: string; title: string; icon: LucideIcon; children?: { slug: string; title: string }[] }

// Children appear only while their parent is the open section. More practice modes get added here.
const workspaceNav: WorkspaceItem[] = [
  { slug: "", title: "Overview", icon: LayoutDashboard },
  { slug: "practice", title: "Practice", icon: ListChecks },
  { slug: "machine-coding", title: "Machine coding", icon: Blocks },
  { slug: "design", title: "System design", icon: Network },
  { slug: "settings", title: "Settings", icon: Settings },
]

/** Menu for the open workspace, shown under the main navigation. */
function WorkspaceNav({ id, pathname }: { id: string; pathname: string }) {
  const workspace = useWorkspace(id)
  const base = `/workspaces/${id}`
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to workspaces" className="text-muted-foreground">
              <Link href="/workspaces">
                <ArrowLeft />
                <span>Back</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
      <SidebarGroupLabel className="max-w-full truncate">{workspace.data?.name ?? "Workspace"}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {workspaceNav.map((item) => {
            const href = item.slug ? `${base}/${item.slug}` : base
            const active = item.slug ? pathname === href || pathname.startsWith(href + "/") : pathname === base
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={active && !item.children} tooltip={item.title}>
                  <Link href={item.children ? `${href}/${item.children[0]!.slug}` : href}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {active && item.children && (
                  <SidebarMenuSub>
                    {item.children.map((c) => {
                      const childHref = `${href}/${c.slug}`
                      return (
                        <SidebarMenuSubItem key={c.slug}>
                          <SidebarMenuSubButton asChild isActive={pathname === childHref || pathname.startsWith(childHref + "/")}>
                            <Link href={childHref}>
                              <span>{c.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const workspaceId = UUID.exec(pathname)?.[1]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center px-3 group-data-[collapsible=icon]:px-2">
        <Logo href="/resumes" collapsible className="self-start" />
      </SidebarHeader>
      <SidebarContent>
        {workspaceId ? (
          <WorkspaceNav id={workspaceId} pathname={pathname} />
        ) : (
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
        )}
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
