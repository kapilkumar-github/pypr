import {
  Award,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  FileUser,
  GraduationCap,
  Handshake,
  Mail,
  PenLine,
  Presentation,
  Search,
  Send,
  Target,
  type LucideIcon,
} from "lucide-react"

// Fixed layout so server and client render identically. [icon, left %, top %, size px, rotate deg, duration s, delay s]
const ICONS: [LucideIcon, number, number, number, number, number, number][] = [
  [FileText, 4, 12, 44, -12, 11, 0],
  [Briefcase, 18, 70, 40, 8, 13, 1.5],
  [GraduationCap, 9, 42, 36, 10, 12, 3],
  [Mail, 30, 22, 30, -6, 10, 2],
  [CalendarCheck, 26, 88, 34, 12, 14, 0.5],
  [Award, 44, 6, 28, 6, 12, 4],
  [PenLine, 40, 60, 30, -10, 11, 2.5],
  [Handshake, 58, 84, 40, -4, 13, 1],
  [Search, 63, 14, 30, 14, 10, 3.5],
  [Send, 72, 48, 32, -14, 12, 0.8],
  [ClipboardCheck, 86, 18, 42, 8, 14, 2.2],
  [Building2, 93, 58, 38, -8, 11, 1.2],
  [FileUser, 80, 80, 40, 10, 13, 3.2],
  [Target, 52, 36, 26, -6, 10, 4.5],
  [Presentation, 14, 94, 30, 4, 12, 2.8],
  [BadgeCheck, 96, 92, 30, -12, 11, 0.3],
]

/** Decorative drifting icons for public pages. Place inside a `relative isolate` container; sits behind content. */
export function FloatingIcons() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {ICONS.map(([Icon, left, top, size, rotate, duration, delay], i) => (
        <span
          key={i}
          className="absolute text-foreground/[0.07] motion-safe:animate-float dark:text-foreground/[0.06]"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            rotate: `${rotate}deg`,
            animationDuration: `${duration}s`,
            animationDelay: `-${delay}s`,
          }}
        >
          <Icon style={{ width: size, height: size }} strokeWidth={1.5} />
        </span>
      ))}
    </div>
  )
}
