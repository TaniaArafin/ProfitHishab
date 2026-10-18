import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
});
const bangla = Hind_Siliguri({ subsets: ['bengali', 'latin'], weight: ['400', '500', '600'], variable: '--font-bangla', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'ProfitHishab', template: '%s · ProfitHishab' },
  description: 'See the real profit of your Facebook business: product cost, courier, returns and ad spend in one place.',
  openGraph: {
    title: 'ProfitHishab',
    description: 'Sales দেখবেন না — আসল Profit বুঝবেন।',
    type: 'website',
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f3f6f4' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${bangla.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
