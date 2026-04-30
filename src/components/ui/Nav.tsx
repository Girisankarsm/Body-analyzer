'use client';

import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useScan } from '@/context/ScanContext';
import { Download, ArrowLeft, Activity, LogOut } from 'lucide-react';
import Image from 'next/image';

interface NavProps {
  activePage?: 'overview' | 'insights' | 'analytics';
}

export default function Nav({ activePage = 'overview' }: NavProps) {
  const router = useRouter();
  const { clearResults } = useScan();
  const { data: session } = useSession();

  const handleNewScan = () => {
    clearResults();
    router.push('/scan');
  };

  const handleSignOut = async () => {
    clearResults();
    await signOut({ callbackUrl: '/login' });
  };

  const navItems = [
    { key: 'overview', label: 'Overview', path: '/dashboard' },
    { key: 'insights', label: 'Insights', path: '/insights' },
    { key: 'analytics', label: 'Analytics', path: '/analytics' },
  ];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3"
      style={{
        background: 'rgba(10,10,10,0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => router.push('/dashboard')}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <Activity size={15} color="white" />
        </div>
        <span className="text-white font-semibold text-sm tracking-tight">BodyAnalyzer</span>
      </div>

      {/* Nav items */}
      <div className="flex items-center gap-2">
        <button onClick={handleNewScan} className="nav-btn nav-btn-ghost flex items-center gap-1.5">
          <ArrowLeft size={13} />
          New Scan
        </button>

        {navItems.map((item) => (
          <button
            key={item.key}
            onClick={() => router.push(item.path)}
            className={`nav-btn ${activePage === item.key ? 'nav-btn-active' : 'nav-btn-ghost'}`}
          >
            {item.label}
          </button>
        ))}

        <button
          onClick={() => window.print()}
          className="nav-btn nav-btn-ghost flex items-center gap-1.5"
        >
          <Download size={13} />
          Save PDF
        </button>
      </div>

      {/* User avatar + sign out */}
      {session?.user && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {session.user.image ? (
              <Image
                src={session.user.image}
                alt={session.user.name ?? 'User'}
                width={28}
                height={28}
                className="rounded-full"
                style={{ border: '1px solid rgba(255,255,255,0.1)' }}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80' }}
              >
                {session.user.name?.charAt(0).toUpperCase() ?? 'U'}
              </div>
            )}
            <span className="text-zinc-400 text-xs hidden sm:block max-w-[120px] truncate">
              {session.user.name}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="nav-btn nav-btn-ghost flex items-center gap-1.5 text-zinc-500 hover:text-red-400"
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
      )}
    </header>
  );
}
