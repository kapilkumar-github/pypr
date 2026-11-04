import type { Metadata } from "next"
import { JetBrains_Mono, Pacifico, Plus_Jakarta_Sans, Source_Serif_4 } from "next/font/google"

import { QueryProvider } from "@/components/providers/query-provider"
import { ThemeProvider } from "@/components/theme/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"
import { accentScript } from "@/lib/accent-script"

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] })
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] })
const script = Pacifico({ variable: "--font-pacifico", subsets: ["latin"], weight: "400" })
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], preload: false })

export const metadata: Metadata = {
  title: { default: "pypr — prepare for your next role", template: "%s · pypr" },
  description: "Resume builder, persona-tailored interview prep, AI mock interviews and job tracking.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${jetbrains.variable} ${serif.variable} ${script.variable}`}>
      <head>
        {/* Applies the saved accent color before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: accentScript }} />
      </head>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <TooltipProvider>
              {children}
              <Toaster richColors />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
