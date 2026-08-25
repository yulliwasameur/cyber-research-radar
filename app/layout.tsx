import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const siteUrl = new URL('https://cyber-research-radar.yulliwas.chatgpt.site');

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'CyberResearch Radar — Cybersecurity & cryptography events worldwide',
    template: '%s · CyberResearch Radar',
  },
  description: 'Discover verified cybersecurity and cryptography conferences, workshops and CFP deadlines worldwide, with rankings, topics and an interactive map.',
  applicationName: 'CyberResearch Radar',
  authors: [{ name: 'Yulliwas Ameur' }],
  creator: 'Yulliwas Ameur',
  alternates: { canonical: '/' },
  keywords: [
    'cybersecurity conferences', 'cryptography conferences', 'call for papers', 'CFP deadlines',
    'post-quantum cryptography', 'homomorphic encryption', 'privacy-preserving machine learning',
    'cybersecurity PhD', 'cybersecurity grants', 'research schools', 'workshops',
  ],
  openGraph: {
    type: 'website',
    url: '/',
    locale: 'en_US',
    siteName: 'CyberResearch Radar',
    title: 'CyberResearch Radar — The global map of cybersecurity and cryptography events',
    description: 'Verified cyber and crypto conferences, workshops and CFP deadlines worldwide.',
  },
  twitter: {
    card: 'summary',
    title: 'CyberResearch Radar',
    description: 'The global map of cybersecurity and cryptography events.',
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
