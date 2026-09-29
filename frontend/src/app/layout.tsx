import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: 'Job Scout',
  description: 'Track job openings and applications.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body className="bg-white text-zinc-950 antialiased">{children}</body>
    </html>
  );
}
