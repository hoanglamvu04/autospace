import type { Metadata } from 'next';
import './globals.css';
import './runs.css';
import './connections.css';
import './route-navigation.css';
import RouteNavigation from './route-navigation';

export const metadata: Metadata = {
  title: 'AutoSpace',
  description: 'Campaign distribution control center',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <RouteNavigation />
        {children}
      </body>
    </html>
  );
}
