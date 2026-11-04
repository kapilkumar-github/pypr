# pypr design system

Source of truth for every new screen. Visual language comes from the NovaCV POC
(`novacv---ai-resume-&-cv-builder/`): indigo primary, slate neutrals, compact type,
rounded cards with hairline borders and very soft shadows.

Live reference: run `pnpm dev` in `web/` and open `/design-system` (toggle the theme there).

## Rules

1. **Use semantic tokens, never raw palette classes.** `bg-card`, `text-muted-foreground`,
   `border-border`, `bg-primary`. Not `bg-white`, `text-slate-500`, `bg-indigo-600`.
   Tokens switch for dark mode automatically; raw classes do not.
2. **Compose shadcn primitives** (`web/components/ui/*`) before writing new markup.
   Do not edit primitives for one screen; wrap them in `components/common/*` instead.
3. **Rich text, not textarea.** Any multi-line prose a user writes (summary, bullets,
   descriptions, notes) uses `RichTextEditor`. Single-line values use `Input`.
4. **Icons:** `lucide-react`, `size-4` in UI chrome, `size-5` inside `IconTile`.
   Client components that may be rendered from a server component take icons as
   elements (`icon={<Briefcase />}`), because component functions cannot cross the
   server/client boundary.
5. Every screen works in light and dark. Check both before calling it done.

## Tokens

**Accent.** The primary family (`primary`, `ring`, `accent`, `accent-foreground`, `brand-*`, sidebar
equivalents, `chart-1`) is computed from `--al` / `--ac` / `--ah` (lightness, chroma, hue).
`html[data-accent]` swaps them; users pick one in the profile menu (`lib/accent.ts`, stored in
`localStorage`, applied before paint by `lib/accent-script.ts`). Never hard-code a hue in app UI.
**Dark mode is neutral:** backgrounds, cards, borders have zero chroma; color appears only through the accent.

Defined in `web/app/globals.css` (`:root` and `.dark`), exposed to Tailwind via `@theme inline`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | slate-100 | near black, no hue | App canvas behind cards |
| `foreground` | slate-900 | slate-50 | Body text |
| `card` / `popover` | white | neutral grey (oklch 0.185 / 0.205) | Surfaces, panels, menus |
| `primary` | accent (default indigo-600) | accent, lighter | Main actions, active nav, icons in section headers |
| `primary-foreground` | white | white | Text on primary |
| `secondary` | slate-100 | slate-800 | Secondary buttons, count badges |
| `muted` | slate-50 | slate-800 | Section header strips, subtle fills |
| `muted-foreground` | slate-500 | slate-400 | Captions, descriptions, placeholder |
| `accent` | accent-50 tint | dark accent tint | Icon tiles, selected/hover tint, pressed toggles. The only hued surface in dark mode |
| `accent-foreground` | accent-700 | accent-200 | Text/icon on accent |
| `destructive` | rose-600 | rose-400 | Delete, errors |
| `success` | emerald-600 | emerald-400 | Positive status |
| `warning` | amber-600 | amber-400 | Caution status |
| `border` | slate-200 | slate-800 | All hairlines |
| `input` | slate-300 | slate-700 | Input borders |
| `ring` | indigo-500 | indigo-400 | Focus rings |
| `paper` + `paper-grain` + `paper-grid` | white + faint grain + slate grid | deep slate + light grain + light grid | Public pages only, via the `bg-paper` utility (400px tile, uneven 64–96px grid) |
| `canvas` | cool light grey | near-black | Builder preview backdrop behind the paper (`bg-canvas`) |
| `brand-from` → `brand-to` | indigo-600 → violet-600 | indigo-500 → violet-500 | Logo tile, hero gradient text only |
| `sidebar-*` | white / indigo accents | slate-900 / indigo accents | App side navigation |

Radius: `--radius: 0.5rem`. `rounded-lg` buttons/inputs, `rounded-xl` cards and icon tiles,
`rounded-2xl` dialogs, `rounded-full` pills.

Shadows: `shadow-xs` on cards, nothing heavier except dialogs/popovers (built into primitives).

## Typography

- Sans: **Plus Jakarta Sans** (`font-sans`, `--font-jakarta`). Everything in the app UI.
- Mono: **JetBrains Mono** (`font-mono`). Codes, IDs, JSON, technical snippets.
- Resume templates may add serif faces (Source Serif 4, Lora) scoped to the template only.

| Role | Classes |
|---|---|
| Display (landing hero) | `text-4xl sm:text-5xl font-extrabold tracking-tight` |
| Page title | `text-2xl font-bold tracking-tight` (use `PageHeader`) |
| Dialog title | `text-lg font-bold` |
| Card / section title | `text-sm font-semibold` (card), `text-xs font-bold` (editor section header) |
| Body | `text-sm` |
| Caption | `text-xs text-muted-foreground` |
| Overline | `text-[11px] font-bold uppercase tracking-wider text-muted-foreground` |
| Count badge | `Badge variant="secondary"` + `text-[10px]` |

## Layout

- Public pages have no theme switcher: they follow the theme saved from the signed-in app, or the OS theme (`system`, the default).
- Auth pages: split layout. `AuthShowcase` (48%, desktop only) + `AuthPanel` on `bg-card`.
- Public (signed-out) pages: landing and the auth showcase use `bg-paper`. Cards stay `bg-card`
  on top of it; headers are translucent `bg-card/80 backdrop-blur-xl`; footers are transparent. The
  signed-in app keeps `bg-background`.
- Marketing pages: `max-w-7xl mx-auto px-6 lg:px-12`, sticky header `h-16 border-b`.
- App pages: sidebar (shadcn `Sidebar`) + content `p-4 sm:p-6`, `PageHeader` at top, `space-y-6` between blocks.
- Signed-in pages with navigation live under `app/(app)/(shell)` (sidebar, no top bar on desktop; phones
  get a slim bar with the menu button). Focused tools such as the builder sit outside `(shell)`: full screen,
  back arrow instead of the sidebar.
- Editor screens (resume builder): two rails on top, then a split view. Editor pane `w-full lg:w-[48%] xl:w-[45%]`, scrolls
  independently, `bg-card border-r`; preview pane `flex-1 bg-muted` with the document centered.
  On mobile show one pane with an Editor/Preview switch.
- Spacing scale in use: `gap-1.5 / 2 / 3 / 4 / 6`, `space-y-3` inside editor stacks, `p-4` inside cards.
- Breakpoints: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`).

## Components

### Primitives (`web/components/ui`, shadcn radix-nova)
`Button`, `Input`, `Field*` (label/description/error layout), `Card*`, `Badge`, `Dialog`,
`AlertDialog` (all destructive confirms), `DropdownMenu`, `Popover`, `Select`, `Tabs`, `Toggle`,
`Collapsible`, `Sheet`, `Sidebar`, `Tooltip`, `Skeleton`, `Avatar`, `Separator`, `Sonner` toasts
(`toast()` from `sonner`).

Button variants: `default` (primary action, one per view), `outline` (secondary actions),
`secondary`, `ghost` (toolbar/icon actions), `destructive`, `link`. Sizes `xs | sm | default | lg | icon*`.
Icons inside buttons get `data-icon="inline-start" | "inline-end"`.

### App components

| Component | Path | Use |
|---|---|---|
| `Logo` | `components/brand/logo.tsx` | Brutalist wordmark: script `pypr` (Pacifico, `font-script`) in a `bg-primary` box, 2px `border-foreground`, hard 3px offset shadow that presses in on hover. `size="sm"` for footers; `collapsible` shows "p" in the icon sidebar. The only brutalist element: don't reuse the hard-shadow style elsewhere |
| `FloatingIcons` | `components/brand/floating-icons.tsx` | Faint drifting job/resume icons behind public pages (`foreground` at 6–7% opacity, `animate-float`, stops under reduced motion). Root needs `isolate` |
| `ResumeMock` | `components/landing/resume-mock.tsx` | Decorative resume paper for marketing pages (paper palette) |
| `ThemeToggle` | `components/theme/theme-toggle.tsx` | Light / Dark / System menu |
| `ThemeProvider` | `components/theme/theme-provider.tsx` | `next-themes`, class strategy, in root layout |
| `PageHeader` | `components/common/page-header.tsx` | Optional `eyebrow` overline (dot + breadcrumb), `text-3xl` title, description, right-aligned actions |
| `IconTile` | `components/common/icon-tile.tsx` | `size-10 rounded-xl bg-accent` icon square |
| `EmptyState` | `components/common/empty-state.tsx` | Dashed card with icon, copy and a CTA |
| `SectionCard` | `components/common/section-card.tsx` | Collapsible editor section (POC accordion): icon, title, count, actions |
| `RichTextEditor` | `components/editor/rich-text-editor.tsx` | Tiptap editor: bold, italic, underline, lists, links |
| `TextField` | `components/common/text-field.tsx` | Label + `Input` + description/error, wired for a11y |
| `SubmitButton` | `components/common/submit-button.tsx` | Submit with spinner and `aria-busy` while pending |
| `FormAlert` | `components/common/form-alert.tsx` | Form-level error (`Alert` destructive) |
| `AuthShowcase` | `components/auth/auth-showcase.tsx` | Left brand panel of the auth split layout (`lg+` only): `bg-paper`, floating icons, glow, decorative resume, tagline |
| `AuthPanel` | `components/auth/auth-panel.tsx` | Right side of auth pages: top bar (switch link), big title, form, footer. Form controls: inputs 46px, submit 48px, `rounded-xl` |
| `AuthSwitch` | `components/auth/auth-switch.tsx` | "Don't have an account? Sign up →" link for the `AuthPanel` top bar |
| `PasswordField` | `components/common/password-field.tsx` | `TextField` for passwords with a show/hide toggle |
| `AppShell` / `AppSidebar` / `UserMenu` | `components/app/*` | Authenticated layout, navigation, account + theme + logout |
| `ResumeCard` | `components/resume/resume-card.tsx` | Resume in the list. `layout="grid"`: badges, menu, live thumbnail, title, target role, updated time, Edit + Duplicate. `layout="list"`: compact row |
| `ResumeThumbnail` | `components/resume/document/resume-thumbnail.tsx` | Non-interactive (`inert`) first-page preview scaled to its container's width |
| `Segmented` | `components/common/segmented.tsx` | Pill radio group in a muted track (builder design rail, view switch) |
| `BuilderHeader` | `components/resume/builder/builder-header.tsx` | Builder top bar: back, title + document menu (rename, duplicate, print, replace content, delete), save status; center Write / Design / Check / Share (`Segmented`); right preview toggle (below `lg`), History button, Download split button (main prints PDF, chevron opens the Download sheet) |
| `WritePanel` | `components/resume/builder/write-panel.tsx` | Write mode: profile card (contact + custom links); sections in print order (drag or Alt+↑/↓, show/hide, menu: add entry, rename, heading, two columns, sidebar column, new page, clear, remove); entry rows (drag, hide, duplicate, delete) with inline field editors from `entry-fields.ts`; Add section (optional + custom) |
| `DesignPanel` | `components/resume/builder/design-panel.tsx` | Design mode: jump bar; templates (one/two column filter, live thumbnails, sidebar side and width); entries (layout, heading style, date format); type (font, density, text size, line height); color (swatches, picker, hex, contrast ratio); page (paper, margins, icons, underline links); reset design defaults |
| `CheckPanel` / `ParserView` | `components/resume/builder/check-panel.tsx` | Check mode: score ring, failing checks with fixes, checks by category, job-posting keyword match. Rules live in `lib/resume/checks.ts`. `ParserView` replaces the paper with the extracted text when "What a parser reads" is on |
| `SharePanel` | `components/resume/builder/share-panel.tsx` | Share mode: public link toggle, address (`/r/<slug>`), copy/open, privacy (hide contact, allow download, search engines), views and downloads |
| `DownloadHistorySheet` | `components/resume/builder/download-history-sheet.tsx` | Right sheet with two tabs. Download: PDF, Word (.doc), Markdown, text, JSON backup; file name; copy as text; import backup. History: name a version, timeline, restore (confirms), delete |
| `PreviewCanvas` | `components/resume/builder/preview-canvas.tsx` | Paper on the `canvas` backdrop; page-fit chip (fits / runs onto page 2 by N lines, offers compact spacing); floating zoom pill (− Fit/% + · page count); dashed page-break markers; optional `header` controls and `children` that replace the paper |
| `PublicResumeView` | `components/resume/public-resume-view.tsx` | Visitor page for a shared resume: sticky name bar, Download PDF when allowed, paper scaled to width, "Made with pypr" |

### Navigation
Sidebar items live in `components/app/app-sidebar.tsx` (`nav`). A not-yet-built feature stays
listed with `soon: true`: dimmed, `aria-disabled`, "Soon" badge, tooltip.

### Resume paper (exception to rule 1)
Resume templates (`components/resume/document`) are print media. They always render on white with a
fixed slate palette and the user-chosen accent color, regardless of app theme. Raw palette classes are
allowed there and only there. Templates share `ResumeSections`; a new template supplies a
`TemplateStyle` (heading renderer and class names) and a header. Serif templates use `font-serif`
(Source Serif 4, loaded lazily).

### Rich text
- Value type `RichTextValue` (Tiptap JSON). Persist JSON, not HTML.
- Schema lives in `components/editor/rich-text-extensions.ts` and is shared by the editor and any
  read-only renderer, so stored content can only contain allowed nodes/marks.
- The editor is client-only (loaded with `next/dynamic`, `ssr: false`) and uncontrolled after
  mount: `value` seeds it once; change its `key` to load different content.
- Content typography comes from the `.rich-text` class in `globals.css`.

## Patterns

- **Forms:** `FieldGroup` > `Field` > `FieldLabel` + control + `FieldDescription`/`FieldError`.
  Mark invalid fields with `data-invalid` on `Field` and `aria-invalid` on the control.
- **Destructive actions:** always `AlertDialog`, destructive button on the confirm.
- **Loading:** `Skeleton` shaped like the content; never a full-page spinner.
- **Feedback:** `toast.success` / `toast.error` for async results.
- **Empty lists:** `EmptyState` with the primary create action.
- **Collection pages** (resume list is the reference): `PageHeader` with eyebrow, a toolbar card
  (filter buttons with counts, search, grid/list toggle), then a grid that starts with a dashed "Create new" card.
- **Coming-soon features:** visible in navigation, disabled, with a `Coming soon` badge.
