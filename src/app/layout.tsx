import type { Metadata } from 'next';
import './globals.css';
import { ScanProvider } from '@/context/ScanContext';
import { AuthProvider } from '@/context/AuthProvider';

export const metadata: Metadata = {
  title: 'BodyAnalyzer — AI-Powered Body Composition',
  description:
    'Advanced AI body analysis with 3D visualization, deep ML prediction, and personalized health insights.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <ScanProvider>{children}</ScanProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
