import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const siteUrl = new URL('https://cyber-research-radar.yulliwas.chatgpt.site');

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'CyberResearch Radar — Cyber events, CFPs & journal targeting',
    template: '%s · CyberResearch Radar',
  },
  description: 'Discover cybersecurity and cryptography events worldwide, then compare journals by scope, publisher, access model, APC, editorial timing and dated ranking evidence.',
  applicationName: 'CyberResearch Radar',
  authors: [{ name: 'Yulliwas Ameur' }],
  creator: 'Yulliwas Ameur',
  alternates: { canonical: '/' },
  keywords: [
    'cybersecurity conferences', 'cryptography conferences', 'call for papers', 'CFP deadlines',
    'post-quantum cryptography', 'homomorphic encryption', 'privacy-preserving machine learning',
    'cybersecurity journals', 'cryptography journals', 'journal APC', 'journal quartile',
    'cybersecurity PhD', 'cybersecurity grants', 'research schools', 'workshops',
  ],
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'en_US',
    siteName: 'CyberResearch Radar',
    title: 'CyberResearch Radar — Global cyber events and journal intelligence',
    description: 'Cyber and crypto events, CFP deadlines and source-linked journal targeting data.',
  },
  twitter: {
    card: 'summary',
    title: 'CyberResearch Radar',
    description: 'The global map of cybersecurity events and evidence-led journal targeting directory.',
  },
  robots: { index: true, follow: true },
  category: 'research',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0e2a31',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
