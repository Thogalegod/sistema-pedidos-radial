import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  manifest: '/termografia/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Termografia', statusBarStyle: 'default' },
  icons: { icon: '/termografia/icon.svg', apple: '/termografia/icon-192.png' },
};
export const viewport: Viewport = { themeColor: '#0f172a', viewportFit: 'cover' };

export default function TermografiaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
