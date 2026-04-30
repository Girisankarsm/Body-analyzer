'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, ShieldCheck, Cpu, BarChart3 } from 'lucide-react';

const FEATURES = [
  { icon: <Cpu size={15} className="text-green-400" />, text: 'AI-powered body composition from photo' },
  { icon: <BarChart3 size={15} className="text-blue-400" />, text: 'ML-trained Navy formula fat analysis' },
  { icon: <Activity size={15} className="text-violet-400" />, text: 'Interactive 3D body heatmap viewer' },
  { icon: <ShieldCheck size={15} className="text-zinc-400" />, text: 'All data processed locally — private' },
];

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/scan');
    }
  }, [status, router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    await signIn('google', { callbackUrl: `${window.location.origin}/scan` });
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-green-400/20" />
          <div className="absolute inset-0 rounded-full border-2 border-t-green-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: '#0a0a0a' }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Radial glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(74,222,128,0.05) 0%, transparent 65%)' }}
      />

      <div className="relative z-10 w-full max-w-md px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: 'rgba(74,222,128,0.1)',
                border: '1px solid rgba(74,222,128,0.2)',
              }}
            >
              <Activity size={26} className="text-green-400" />
            </div>
            <h1 className="text-white font-bold text-2xl tracking-tight">BodyAnalyzer</h1>
            <p className="text-zinc-500 text-sm mt-1.5 text-center">
              AI-powered body composition analysis with 3D visualization
            </p>
          </div>

          {/* Card */}
          <div
            className="rounded-2xl p-8"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <h2 className="text-white font-semibold text-lg mb-1">Welcome</h2>
            <p className="text-zinc-500 text-sm mb-6">Sign in to begin your body scan</p>

            {/* Google button */}
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 relative overflow-hidden group"
              style={{
                background: loading ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: loading ? 'rgba(255,255,255,0.3)' : 'white',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              />
              {loading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  Connecting to Google...
                </>
              ) : (
                <>
                  {/* Google G logo */}
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
              <span className="text-zinc-700 text-xs">What you get</span>
              <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            </div>

            {/* Features list */}
            <div className="space-y-3">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {f.icon}
                  </div>
                  <p className="text-zinc-400 text-xs">{f.text}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <p className="text-center text-zinc-700 text-xs mt-4">
            By signing in you agree to use this tool responsibly.
            <br />
            No health data is stored on our servers.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
