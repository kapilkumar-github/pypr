import {
  BotMessageSquare,
  Code,
  Crown,
  Lightbulb,
  ListTodo,
  MessagesSquare,
  Network,
  type LucideIcon,
} from "lucide-react"

import type {
  Activity,
  ActivityKind,
  ActivityStatus,
  Level,
  ModuleKey,
  Priority,
  ProgressModel,
  Track,
} from "@/lib/api/workspaces"
import { experienceYears } from "@/lib/resume/job-match"
import type { ResumeData } from "@/lib/resume/types"

export const TRACKS: { id: Track; name: string }[] = [
  { id: "ic", name: "Individual contributor" },
  { id: "management", name: "Management" },
  { id: "both", name: "Both" },
]

export const SENIORITIES = ["Junior", "Mid-level", "Senior", "Staff", "Principal", "Lead", "Manager", "Senior manager", "Director"]

export const LEVELS: { id: Level; name: string; hint: string }[] = [
  { id: "unassessed", name: "Not assessed", hint: "You haven't rated this yet." },
  { id: "beginner", name: "Beginner", hint: "You know the basics or are just starting." },
  { id: "intermediate", name: "Intermediate", hint: "You've used it, with gaps you'd notice in an interview." },
  { id: "advanced", name: "Advanced", hint: "You use it confidently and can explain trade-offs." },
  { id: "ready", name: "Interview-ready", hint: "You can answer deep interview questions on it now." },
]
export const levelName = (l: Level) => LEVELS.find((x) => x.id === l)?.name ?? l

export const KINDS: { id: ActivityKind; name: string; icon: LucideIcon }[] = [
  { id: "concept", name: "Concept", icon: Lightbulb },
  { id: "system_design", name: "System design", icon: Network },
  { id: "coding", name: "Coding", icon: Code },
  { id: "mock_interview", name: "Mock interview", icon: BotMessageSquare },
  { id: "behavioral", name: "Behavioral", icon: MessagesSquare },
  { id: "custom", name: "Custom task", icon: ListTodo },
]
export const kindOf = (k: ActivityKind) => KINDS.find((x) => x.id === k) ?? KINDS[KINDS.length - 1]!

export const PROGRESS: { id: ProgressModel; name: string; hint: string }[] = [
  { id: "check", name: "Mark done", hint: "Done when you mark it done, e.g. once you understand a concept." },
  { id: "count", name: "Count", hint: "Done after a number of repeats, e.g. 3 mock interviews." },
  { id: "checklist", name: "Checklist", hint: "Done when every item is ticked." },
]

export const PRIORITIES: { id: Priority; name: string }[] = [
  { id: "high", name: "High" },
  { id: "medium", name: "Medium" },
  { id: "low", name: "Low" },
]

export const STATUSES: { id: ActivityStatus; name: string }[] = [
  { id: "todo", name: "To do" },
  { id: "in_progress", name: "In progress" },
  { id: "done", name: "Done" },
]

/**
 * Optional modules. None is built yet, so each is shown as planned. Turning one on shapes the
 * suggested plan now and enables the module in this workspace once it ships.
 */
export const MODULES: { key: ModuleKey; name: string; description: string; icon: LucideIcon; tracks: Track[] }[] = [
  { key: "system_design", name: "System design", description: "Design problems and architecture concepts.", icon: Network, tracks: ["ic", "both"] },
  { key: "coding", name: "Coding practice", description: "Timed problems in your interview language.", icon: Code, tracks: ["ic", "both"] },
  { key: "mock_interviews", name: "Mock interviews", description: "Practice interviews for this role.", icon: BotMessageSquare, tracks: ["ic", "management", "both"] },
  { key: "behavioral", name: "Behavioral", description: "STAR stories and common questions.", icon: MessagesSquare, tracks: ["ic", "management", "both"] },
  { key: "leadership", name: "Leadership", description: "Mentoring, direction and people questions.", icon: Crown, tracks: ["management", "both"] },
]

export const defaultModules = (track: Track): ModuleKey[] =>
  track === "ic" ? ["system_design", "coding", "mock_interviews"] : track === "management" ? ["behavioral", "leadership", "mock_interviews"] : ["system_design", "behavioral", "leadership", "mock_interviews"]

/** Suggested topics to assess for common roles, matched on the role's words. */
const ROLE_TOPICS: [RegExp, string[]][] = [
  [/backend|back-end|platform|api/i, ["System design", "Databases", "Database indexing", "Caching", "Concurrency", "Distributed systems", "Messaging and queues"]],
  [/frontend|front-end|ui\b|web/i, ["JavaScript fundamentals", "Browser rendering", "Web performance", "Accessibility", "State management", "Testing"]],
  [/full[\s-]?stack/i, ["System design", "Databases", "Web performance", "API design", "Testing"]],
  [/devops|sre|reliability|infrastructure|cloud/i, ["Kubernetes", "CI/CD", "Observability", "Networking", "Incident response", "Infrastructure as code"]],
  [/manager|director|head of/i, ["People management", "Hiring", "Stakeholder management", "Delivery and planning", "Technical strategy"]],
  [/product manager|product owner|\bpm\b/i, ["Product sense", "Prioritization", "Metrics", "Stakeholder management", "Roadmapping"]],
  [/data|machine learning|\bml\b|ai\b/i, ["Statistics", "SQL", "Data modeling", "ML system design", "Experimentation"]],
]

export function topicsForRole(role: string): string[] {
  const out: string[] = []
  for (const [pattern, topics] of ROLE_TOPICS) if (pattern.test(role)) out.push(...topics)
  return [...new Set(out)]
}

/** Context read from a resume's structured fields. No AI, nothing assumed about the target role. */
export type ResumeContext = {
  currentRole: string
  years: number | null
  skills: string[]
}

export function contextFromResume(data: ResumeData): ResumeContext {
  const roles = data.experience
    .filter((e) => !e.hidden && e.position.trim())
    .sort((a, b) => Number(b.current) - Number(a.current) || (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate))
  const skills = data.skills
    .filter((c) => !c.hidden)
    .flatMap((c) => c.skills.split(","))
    .map((s) => s.trim())
    .filter(Boolean)
  const years = experienceYears(data)
  return {
    currentRole: roles[0]?.position.trim() || data.personalInfo.jobTitle.trim(),
    years: years === null ? null : Math.floor(years),
    skills: [...new Map(skills.map((s) => [s.toLowerCase(), s])).values()],
  }
}

const SOFTWARE_TITLE = /\b(software|developer|programmer|sde|swe|full[- ]?stack|front[- ]?end|back[- ]?end|web|mobile|android|ios|devops|sre|site reliability|platform|cloud|data engineer|machine learning|ml engineer|qa automation|sdet|tech lead|technical lead|engineering manager|architect)\b/i
const NON_SOFTWARE_TITLE = /\b(mechanical|civil|electrical|chemical|structural|industrial|biomedical|hardware|manufacturing|sales|marketing|accountant|nurse|teacher)\b/i
const TECH_SKILL = /^(javascript|typescript|python|java|go|golang|rust|c\+\+|c#|kotlin|swift|php|ruby|scala|sql|react|angular|vue|node(\.?js)?|express|django|flask|spring|docker|kubernetes|aws|azure|gcp|git|linux|postgres(ql)?|mysql|mongodb|redis|kafka|graphql|rest|html|css|next\.?js|\.net)$/i

/** Whether a resume looks like a software engineering profile (title first, then technical skills). Workspaces support only these for now. */
export function isSoftwareProfile(data: ResumeData): boolean {
  const titles = [data.personalInfo.jobTitle, ...data.experience.filter((e) => !e.hidden).map((e) => e.position)].filter(Boolean)
  if (titles.some((t) => SOFTWARE_TITLE.test(t) || (/\bengineer\b/i.test(t) && !NON_SOFTWARE_TITLE.test(t)))) return true
  return contextFromResume(data).skills.filter((k) => TECH_SKILL.test(k)).length >= 3
}

/** Seniority and track guessed from the latest job title and years of experience. The person can change both in Settings. */
export function seniorityFor(title: string, years: number | null): { seniority: string; track: Track } {
  const t = title.toLowerCase()
  const manager = /\b(manager|director|head of|vp)\b/.test(t)
  if (/\bdirector|head of|vp\b/.test(t)) return { seniority: "Director", track: "management" }
  if (manager) return { seniority: /senior/.test(t) ? "Senior manager" : "Manager", track: "management" }
  if (/\bprincipal\b/.test(t)) return { seniority: "Principal", track: "ic" }
  if (/\bstaff\b/.test(t)) return { seniority: "Staff", track: "ic" }
  if (/\blead\b/.test(t)) return { seniority: "Lead", track: "ic" }
  if (/\b(senior|sr)\b/.test(t)) return { seniority: "Senior", track: "ic" }
  if (/\b(junior|jr|intern|trainee|associate)\b/.test(t)) return { seniority: "Junior", track: "ic" }
  if (years === null) return { seniority: "", track: "ic" }
  return { seniority: years < 2 ? "Junior" : years < 5 ? "Mid-level" : years < 9 ? "Senior" : "Staff", track: "ic" }
}

/** "Lead Backend Engineer — Go / Node.js" */
export const defaultName = (role: string, technologies: string[]) =>
  [role.trim(), technologies.slice(0, 2).join(" / ")].filter(Boolean).join(" — ")

const priorityRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

export function isOverdue(a: Activity, today = new Date().toISOString().slice(0, 10)) {
  return a.status !== "done" && !!a.dueDate && a.dueDate < today
}

/** The most useful next activities: started ones first, then overdue, then by priority and plan order. */
export function nextActivities(plan: Activity[], limit = 3): Activity[] {
  return plan
    .filter((a) => a.status !== "done")
    .sort(
      (a, b) =>
        Number(b.status === "in_progress") - Number(a.status === "in_progress") ||
        Number(isOverdue(b)) - Number(isOverdue(a)) ||
        priorityRank[a.priority] - priorityRank[b.priority] ||
        a.position - b.position,
    )
    .slice(0, limit)
}

/** Share of plan activities that are done. Plan completion, not interview readiness. */
export function planCompletion(plan: Activity[]) {
  const done = plan.filter((a) => a.status === "done").length
  return { done, total: plan.length, percent: plan.length ? Math.round((done / plan.length) * 100) : 0 }
}

/** Progress within one activity, 0–1, plus its label ("2/3"). */
export function activityProgress(a: Activity): { value: number; label: string } {
  if (a.progress === "count" && a.target) return { value: Math.min(1, a.completed / a.target), label: `${a.completed}/${a.target}` }
  if (a.progress === "checklist" && a.checklist.length) {
    const done = a.checklist.filter((i) => i.done).length
    return { value: done / a.checklist.length, label: `${done}/${a.checklist.length}` }
  }
  return { value: a.status === "done" ? 1 : a.status === "in_progress" ? 0.5 : 0, label: STATUSES.find((s) => s.id === a.status)!.name }
}

/** "Continue Database sharding", "Complete Mock interview 2 of 3" */
export function nextStepLabel(a: Activity): string {
  if (a.progress === "count" && a.target) return `${a.title}: ${a.completed + 1} of ${a.target} next`
  if (a.status === "in_progress") return `Continue: ${a.title}`
  return a.title
}

export const skillKey = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replaceAll("++", "plusplus")
    .replaceAll("+", "plus")
    .replaceAll("#", "sharp")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "")
