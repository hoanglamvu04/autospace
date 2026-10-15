import type { Metadata } from 'next';
import './globals.css';
import './runs.css';

export const metadata: Metadata = {
  title: 'AutoSpace',
  description: 'Campaign distribution control center',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
