'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Download, ExternalLink, TrendingUp, Activity, Zap, Droplets } from 'lucide-react';
import Nav from '@/components/ui/Nav';
import BodyViewer from '@/components/3d/BodyViewer';
import { useScan } from '@/context/ScanContext';
import { getModelColor, getVisceralRisk } from '@/lib/metrics';

function ScoreCircle({ score }: { score: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative w-[88px] h-[88px] flex items-center justify-center flex-shrink-0">
      <svg width="88" height="88" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(74,222,128,0.1)" strokeWidth="5" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke="#4ade80" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 1.2s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-white font-bold text-xl metric-number leading-none">{score}</span>
        <span className="text-zinc-500 text-[9px] uppercase tracking-widest mt-0.5">Score</span>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-2 border-green-400/20" />
          <div className="absolute inset-0 rounded-full border-2 border-t-green-400 animate-spin" />
        </div>
        <p className="text-zinc-500 text-sm">Loading results...</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { results, isHydrated } = useScan();
  const router = useRouter();

  useEffect(() => {
    // Only redirect AFTER context has loaded from localStorage
    if (isHydrated && !results) {
      router.replace('/scan');
    }
  }, [isHydrated, results, router]);

  // Show loader while context is hydrating
  if (!isHydrated) return <LoadingScreen />;
  if (!results) return <LoadingScreen />;

  const modelColor = getModelColor(results.bfStatus);
  const sparkData = results.sparklineData.map((v, i) => ({ i, v }));
  const lmData = results.leanMassHistory;

  const bfStatusColors: Record<string, string> = {
    LOW: '#d4a017', NORMAL: '#60a5fa', HIGH: '#f97316', OBESE: '#ef4444',
  };
  const bfColor = bfStatusColors[results.bfStatus] ?? '#d4a017';

  const lmStatusColors: Record<string, string> = {
    LOW: '#f97316', NORMAL: '#60a5fa', HIGH: '#4ade80',
  };
  const lmColor = lmStatusColors[results.lmStatus] ?? '#60a5fa';

  return (
    <div id="pdf-root" className="min-h-screen flex flex-col" style={{ background: '#0a0a0a' }}>
      <Nav activePage="overview" />

      <div className="flex flex-1 pt-[52px] overflow-hidden" style={{ height: '100vh' }}>
        {/* ── Left Panel ─────────────────────────────────────── */}
        <div
          className="w-[420px] flex-shrink-0 flex flex-col gap-3 p-4 overflow-y-auto"
          style={{ height: 'calc(100vh - 52px)' }}
        >
          {/* Row 1: Body Fat + Lean Mass cards */}
          <div className="grid grid-cols-2 gap-3">
            {/* Body Fat Status */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: 'linear-gradient(145deg,#1a1505,#120f02)', border: '1px solid rgba(212,160,23,0.15)' }}
            >
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-widest">Body Fat Status</p>
              <div className="flex items-end gap-2">
                <span className="text-white font-bold text-3xl metric-number leading-none">{results.bodyFat}</span>
                <span className="text-zinc-400 text-sm mb-0.5">%</span>
                <span
                  className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(212,160,23,0.15)', color: bfColor, border: `1px solid ${bfColor}40` }}
                >
                  {results.bfStatus}
                </span>
              </div>
              <div className="h-12 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <Line type="monotone" dataKey="v" stroke={bfColor} strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Lean Mass Level */}
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="rounded-2xl p-4 flex flex-col gap-2"
              style={{ background: 'linear-gradient(145deg,#050d1a,#030810)', border: '1px solid rgba(59,130,246,0.15)' }}
            >
              <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-widest">Lean Mass Level</p>
              <div className="flex items-end gap-2">
                <span className="text-white font-bold text-3xl metric-number leading-none">{results.leanMass}</span>
                <span className="text-zinc-400 text-sm mb-0.5">/kg</span>
                <span
                  className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(59,130,246,0.1)', color: lmColor, border: `1px solid ${lmColor}40` }}
                >
                  {results.lmStatus}
                </span>
              </div>
              <div className="h-12 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lmData}>
                    <defs>
                      <linearGradient id="lmGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} fill="url(#lmGrad)" dot={false} />
                    <Tooltip
                      contentStyle={{ background: '#111', border: '1px solid #222', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ display: 'none' }}
                      formatter={(v: number) => [`${v} kg`, '']}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          </div>

          {/* Body Composition Ring + BMI */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] text-zinc-500 uppercase tracking-widest">Body Composition</p>
              <ScoreCircle score={results.score} />
            </div>
            <div className="flex items-center gap-4">
              {/* Donut chart */}
              <div className="flex-shrink-0 w-[110px] h-[110px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Fat',    value: results.bodyComposition?.fat_pct  ?? results.bodyFat },
                        { name: 'Muscle', value: Math.round((results.muscleMass / results.input.weight) * 100) },
                        { name: 'Bone',   value: Math.round((results.boneMass   / results.input.weight) * 100) },
                        { name: 'Water',  value: Math.max(0, 100 - (results.bodyComposition?.fat_pct ?? results.bodyFat) - Math.round((results.muscleMass / results.input.weight) * 100) - Math.round((results.boneMass / results.input.weight) * 100)) },
                      ]}
                      cx="50%" cy="50%" innerRadius={32} outerRadius={50}
                      dataKey="value" strokeWidth={0}
                    >
                      <Cell fill="#f87171" />
                      <Cell fill="#4ade80" />
                      <Cell fill="#60a5fa" />
                      <Cell fill="#818cf8" />
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `${v.toFixed(1)}%`}
                      contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend + BMI */}
              <div className="flex-1 min-w-0">
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 mb-3">
                  {[
                    { label: 'Fat',    color: '#f87171', val: `${results.bodyFat}%` },
                    { label: 'Muscle', color: '#4ade80', val: `${results.muscleMass}kg` },
                    { label: 'Bone',   color: '#60a5fa', val: `${results.boneMass}kg` },
                    { label: 'Water',  color: '#818cf8', val: `${results.bodyComposition?.water_pct ?? results.waterPct}%` },
                  ].map(({ label, color, val }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                      <span className="text-zinc-500 text-[10px]">{label}</span>
                      <span className="text-white text-[10px] font-bold ml-auto">{val}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-white font-bold text-3xl metric-number">{results.bmi}</span>
                  <span className="text-zinc-500 text-xs">BMI</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Visceral Fat + Metabolic Age */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
            className="grid grid-cols-2 gap-2"
          >
            {/* Visceral Fat Level */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Visceral Fat</p>
              <div className="flex items-end gap-1 mb-2">
                <span className="text-white text-2xl font-bold metric-number leading-none">{results.visceralFatLevel}</span>
                <span className="text-zinc-500 text-xs mb-0.5">/12</span>
              </div>
              {/* Bar gauge */}
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(results.visceralFatLevel / 12) * 100}%`,
                    background: getVisceralRisk(results.visceralFatLevel).color,
                  }}
                />
              </div>
              <p className="text-[10px] mt-1.5 font-medium" style={{ color: getVisceralRisk(results.visceralFatLevel).color }}>
                {getVisceralRisk(results.visceralFatLevel).label}
              </p>
            </div>

            {/* Metabolic Age */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Metabolic Age</p>
              <div className="flex items-end gap-1 mb-1">
                <span
                  className="text-2xl font-bold metric-number leading-none"
                  style={{ color: results.metabolicAge > results.input.age ? '#f87171' : '#4ade80' }}
                >
                  {results.metabolicAge}
                </span>
                <span className="text-zinc-500 text-xs mb-0.5">yrs</span>
              </div>
              <p className="text-zinc-600 text-[10px]">Actual: {results.input.age}y</p>
              <p className="text-[10px] mt-1.5 font-medium" style={{ color: results.metabolicAge > results.input.age ? '#f97316' : '#4ade80' }}>
                {results.metabolicAge > results.input.age ? `+${results.metabolicAge - results.input.age}y older` : 'Younger than age'}
              </p>
            </div>
          </motion.div>

          {/* Fat Decomposition bar */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl p-4"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest mb-3">Fat Decomposition</p>
            <div className="space-y-2">
              {[
                { label: 'Trunk Fat',       value: results.trunkFatPct,        color: '#f87171', icon: '🫁' },
                { label: 'Appendicular',    value: results.appendicularFatPct, color: '#fbbf24', icon: '💪' },
                { label: 'Body Type',       value: null, text: results.bodyType, color: '#818cf8', icon: '🧬' },
              ].map(({ label, value, text, color, icon }) => (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs w-4">{icon}</span>
                  <span className="text-zinc-500 text-[11px] w-[90px] flex-shrink-0">{label}</span>
                  {value !== null && value !== undefined ? (
                    <>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
                      </div>
                      <span className="text-white text-[11px] font-bold w-10 text-right">{value}%</span>
                    </>
                  ) : (
                    <span className="text-white text-[11px] font-semibold ml-1" style={{ color }}>{text}</span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Smart Insights & Plan */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
              <p className="text-white text-sm font-semibold">Smart Insights & Plan</p>
              <button
                onClick={() => router.push('/insights')}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors"
              >
                Click to View Full <ExternalLink size={11} />
              </button>
            </div>
            <div className="divide-y divide-white/5">
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}>
                    <TrendingUp size={14} className="text-indigo-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-semibold">Nutrition Objective</p>
                    <p className="text-zinc-500 text-[11px] mt-0.5 truncate max-w-[160px]">
                      {results.nutritionPlan[0]?.slice(0, 42)}...
                    </p>
                  </div>
                </div>
                <button className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-2">
                  <Download size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}>
                    <Activity size={14} className="text-violet-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-xs font-semibold">Recommended Exercise</p>
                    <p className="text-zinc-500 text-[11px] mt-0.5 truncate max-w-[160px]">
                      {results.exercisePlan[0]?.slice(0, 42)}...
                    </p>
                  </div>
                </div>
                <button className="text-zinc-600 hover:text-zinc-300 transition-colors flex-shrink-0 ml-2">
                  <Download size={14} />
                </button>
              </div>
            </div>
          </motion.div>

          {/* Quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="grid grid-cols-4 gap-2"
          >
            {[
              { label: 'BMR',       value: `${results.bmr}`,                               unit: 'kcal',  icon: <Zap size={10} /> },
              { label: 'TDEE',      value: `${results.tdee ?? Math.round(results.bmr * 1.4)}`, unit: 'kcal', icon: <Activity size={10} /> },
              { label: 'Water',     value: `${results.hydrationTarget}`,                   unit: 'L/day', icon: <Droplets size={10} /> },
              { label: 'Recovery',  value: results.recoveryStress,                         unit: '',      icon: <TrendingUp size={10} /> },
            ].map(({ label, value, unit, icon }) => (
              <div key={label} className="rounded-xl p-2.5"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center gap-1 mb-1 text-zinc-600">{icon}<p className="text-[9px] uppercase tracking-wider">{label}</p></div>
                <p className="text-white text-xs font-bold metric-number leading-tight">{value}</p>
                {unit && <p className="text-zinc-600 text-[9px] mt-0.5">{unit}</p>}
              </div>
            ))}
          </motion.div>

          {/* ML source badge */}
          {results.mlAnalysis && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.1)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
              <span className="text-zinc-500">
                ML: <span className="text-green-400">{results.mlAnalysis.source}</span>
                {' '}· {Math.round(results.mlAnalysis.confidence * 100)}% confidence
              </span>
            </motion.div>
          )}
        </div>

        {/* ── Right: 3D Model ─────────────────────────────────── */}
        <div className="flex-1 relative" style={{ height: 'calc(100vh - 52px)' }}>
          <div className="absolute inset-0">
            <BodyViewer gender={results.input.gender} color={modelColor} />
          </div>

          {/* Heatmap legend */}
          <div
            className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-4 px-4 py-2 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.65)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              whiteSpace: 'nowrap',
            }}
          >
            <p className="text-zinc-500 text-xs">Heatmap Status:</p>
            {[
              { label: 'Lean', color: '#4ade80' },
              { label: 'Normal', color: '#fbbf24' },
              { label: 'Excess', color: '#f87171' },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="text-zinc-400 text-xs">{label}</span>
              </div>
            ))}
          </div>

          {/* User badge */}
          <div
            className="absolute top-4 right-4 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{
              background: 'rgba(0,0,0,0.65)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80' }}>
              {results.input.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-white text-xs font-medium">{results.input.name}</p>
              <p className="text-zinc-500 text-[10px]">
                {results.input.age}y · {results.input.height}cm · {results.input.weight}kg
              </p>
            </div>
          </div>

          {/* Nav hint overlay — go to insights */}
          <div
            className="absolute bottom-5 right-5 flex flex-col gap-2"
          >
            <button
              onClick={() => router.push('/insights')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: 'rgba(0,0,0,0.65)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'white',
                backdropFilter: 'blur(12px)',
              }}
            >
              View Insights →
            </button>
            <button
              onClick={() => router.push('/analytics')}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all"
              style={{
                background: 'rgba(0,0,0,0.65)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)',
                backdropFilter: 'blur(12px)',
              }}
            >
              Analytics & ML →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
