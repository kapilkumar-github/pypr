import type { Metadata } from 'next';
import { Geist, Geist_Mono, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { ThemeSync } from '@/components/theme-sync';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-space-grotesk',
});

export const metadata: Metadata = {
  title: {
    default: 'Pypr — Build a resume that stands out',
    template: '%s · Pypr',
  },
  description: 'Create, edit and download professional resumes.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // Dark is the default. The inline script swaps data-theme before first paint
    // when the saved preference says otherwise, hence suppressHydrationWarning.
    <html
      lang="en"
      data-theme="dark"
      className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
