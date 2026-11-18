import type { Metadata, Viewport } from 'next';
import { Unbounded, Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/app/Providers';
import { SITE_URL, shareMeta } from '@/lib/share';

const unbounded = Unbounded({ subsets: ['latin'], variable: '--font-unbounded', weight: ['500', '700', '800'], display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const DESCRIPTION = 'Chess, backgammon, Tichu and Sea Battle against real people or a fair bot. Practice free, or play for credits and the winner takes the pot. Every fee shown up front. 18+.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Evens | Four games. One arena.', template: '%s | Evens' },
  description: DESCRIPTION,
  applicationName: 'Evens',
  ...shareMeta({ title: 'Evens | Four games. One arena.', description: DESCRIPTION }),
  // shareMeta sets a plain title; keep the template for inner pages.
};
metadata.title = { default: 'Evens | Four games. One arena.', template: '%s | Evens' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#07070c' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('evens:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
