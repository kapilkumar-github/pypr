import type { Metadata } from "next"
import Link from "next/link"

import { BuiltBy } from "@/components/brand/built-by"
import { Logo } from "@/components/brand/logo"

export const metadata: Metadata = {
  title: "Privacy policy · pypr",
  description: "What pypr and the Pypr job capture extension collect, why, and what they never do.",
}

const UPDATED = "10 November 2026"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="space-y-3 text-muted-foreground [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-foreground">{children}</div>
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6">
          <Logo />
          <Link href="/login" className="text-sm font-medium underline-offset-4 hover:underline">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12 leading-relaxed">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Privacy policy</h1>
          <p className="text-sm text-muted-foreground">Last updated {UPDATED}. Applies to the pypr website and the Pypr job capture Chrome extension.</p>
        </div>

        <Section title="Summary">
          <ul>
            <li>The extension reads a job page <strong>only when you ask it to</strong> (toolbar icon, the launcher on a page you enabled, or the right-click menu).</li>
            <li>What it reads is sent to pypr <strong>only when you press Save</strong>.</li>
            <li>It does not read your browsing history, cookies, passwords, or what you type into forms.</li>
            <li>We do not sell your data, show ads, or use it for anything unrelated to running pypr.</li>
          </ul>
        </Section>

        <Section title="What the extension handles">
          <p><strong>Website content, from pages you capture.</strong> When you press &quot;Add this job&quot;, the extension reads the job title, company, location, work arrangement, employment type, salary text, description, application link, and the page address. You can edit all of it before saving. It is sent to your pypr account only after you confirm.</p>
          <p><strong>Authentication information.</strong> After you approve the connection on pypr.work, the extension keeps a session token so it can save jobs to your account. You can disconnect in its settings, which removes the token.</p>
          <p><strong>Settings stored in your browser.</strong> Your field mappings (which element on a site holds which detail), the sites you enabled, and unsaved drafts are kept in <code>chrome.storage</code> on your device, separately for each account. They are not uploaded.</p>
          <p>The extension asks Chrome for access to a site only when you click &quot;Enable on this site&quot;, and only for that site. It requests no access to cookies, browsing history, or network traffic, and it loads no remote code.</p>
        </Section>

        <Section title="What the website handles">
          <ul>
            <li><strong>Account:</strong> name, email address, and a hashed password.</li>
            <li><strong>Content you add:</strong> resumes, tracked jobs and notes, interview-practice answers, and design boards.</li>
            <li><strong>Sessions:</strong> a session cookie or extension token to keep you signed in.</li>
          </ul>
        </Section>

        <Section title="Who else sees data">
          <p>We use a few providers to run the service. Each receives only what its job needs.</p>
          <ul>
            <li><strong>Database hosting</strong> (PostgreSQL on Supabase) stores your account and content.</li>
            <li><strong>Email delivery</strong> (Resend) receives your email address to send verification and password-reset messages.</li>
            <li><strong>AI features</strong> (via OpenRouter): when you use a feature such as resume parsing, job matching, or answer review, the text needed for that request, for example resume or job text, is sent to a language model. Nothing is sent unless you use such a feature.</li>
          </ul>
          <p>We do not sell or rent personal data, and we do not share it for advertising.</p>
        </Section>

        <Section title="How long we keep it and your choices">
          <p>Account content stays until you delete it or ask us to delete your account. You can delete resumes, jobs, and boards inside the app. Removing the extension deletes everything it stored in your browser. To have your account and data erased, contact us using the link below.</p>
        </Section>

        <Section title="Security">
          <p>Traffic uses HTTPS. Passwords are stored hashed. The extension talks only to the pypr API, validates every message between its parts, and keeps its token in storage that web pages cannot read.</p>
        </Section>

        <Section title="Children">
          <p>pypr is not directed at children under 16.</p>
        </Section>

        <Section title="Changes and contact">
          <p>If this policy changes, we will update the date above. Questions or deletion requests: message the author through the LinkedIn link in the footer.</p>
        </Section>
      </main>
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6">
          <BuiltBy />
          <Link href="/" className="text-xs text-muted-foreground hover:text-foreground">Home</Link>
        </div>
      </footer>
    </div>
  )
}
