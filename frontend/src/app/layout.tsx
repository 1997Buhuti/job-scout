import type { Metadata } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';

import { Providers } from '@/app/providers';

import '@/styles/globals.css';

const geistSans = Geist({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'Job Scout',
  description: 'Track job openings and applications.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${geistSans.className} min-h-screen bg-surface text-on-surface antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
