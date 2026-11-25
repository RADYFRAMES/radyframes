import type { Metadata } from 'next';
import { DM_Sans, Manrope } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-inter' });
const manrope = Manrope({ subsets: ['latin'], variable: '--font-grotesk' });

export const metadata: Metadata = {
  title: 'RADYFRAMES CREATIVE MEDIA',
  description: 'Video editing, cinematography, color grading, CGI and VFX from Gandhipuram, Coimbatore.',
  openGraph: {
    title: 'RADYFRAMES CREATIVE MEDIA',
    description: 'Video editing, cinematography, color grading, CGI and VFX.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${dmSans.variable} ${manrope.variable}`}>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: `(function(){try{var s=localStorage.getItem('radyframes-theme');var t=s||(matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.dataset.theme=t}catch(e){}})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
