'use client';

import dynamic from 'next/dynamic';

const BodyModel3D = dynamic(() => import('@/components/3d/BodyModel3D'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex flex-col items-center justify-center gap-3">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-green-400/20" />
        <div className="absolute inset-0 rounded-full border-2 border-t-green-400 animate-spin" />
      </div>
      <p className="text-xs text-zinc-500 font-mono">Loading 3D Model...</p>
    </div>
  ),
});

interface BodyViewerProps {
  gender: 'male' | 'female';
  color: string;
}

export default function BodyViewer({ gender, color }: BodyViewerProps) {
  return <BodyModel3D gender={gender} color={color} />;
}
