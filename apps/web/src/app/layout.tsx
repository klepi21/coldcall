import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/app/Providers';
import { SITE_URL, shareMeta } from '@/lib/share';

/** Lilita One (display) is self hosted from the brand files. Inter is subset and self hosted by Next at build time. */
const lilita = localFont({ src: '../fonts/LilitaOne-Regular.ttf', variable: '--font-lilita', weight: '400', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const DESCRIPTION = 'Chess, backgammon, Tichu and Ice Floe Battle against real people or a fair bot. Practice free, or play for LOFI or SUI on Sui devnet and the winner takes the pot. Every fee shown up front. 18+.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Cold Call | Play it cool. Call their bluff.', template: '%s | Cold Call' },
  description: DESCRIPTION,
  applicationName: 'Cold Call',
  ...shareMeta({ title: 'Cold Call | Play it cool. Call their bluff.', description: DESCRIPTION }),
  // shareMeta sets a plain title; keep the template for inner pages.
};
metadata.title = { default: 'Cold Call | Play it cool. Call their bluff.', template: '%s | Cold Call' };

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b1a2e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${lilita.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('coldcall:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
