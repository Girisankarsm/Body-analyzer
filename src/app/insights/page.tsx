'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, Droplets, Zap, UtensilsCrossed, Dumbbell, ChevronRight } from 'lucide-react';
import Nav from '@/components/Nav';
import { useScan } from '@/context/ScanContext';

export default function InsightsPage() {
  const { results, isHydrated } = useScan();
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && !results) router.replace('/scan');
  }, [isHydrated, results, router]);

  if (!isHydrated || !results) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-green-400/20" />
          <div className="absolute inset-0 rounded-full border-2 border-t-green-400 animate-spin" />
        </div>
      </div>
    );
  }

  const estimations = [
    {
      label: 'Est. BMR',
      value: results.bmr.toLocaleString(),
      unit: 'kcal/day',
      icon: <Zap size={16} className="text-violet-400" />,
      bg: 'rgba(139,92,246,0.1)',
      border: 'rgba(139,92,246,0.15)',
    },
    {
      label: 'Hydration Target',
      value: results.hydrationTarget.toString(),
      unit: 'L',
      icon: <Droplets size={16} className="text-blue-400" />,
      bg: 'rgba(59,130,246,0.1)',
      border: 'rgba(59,130,246,0.15)',
    },
    {
      label: 'Recovery Stress',
      value: results.recoveryStress,
      unit: '',
      icon: <Activity size={16} className="text-green-400" />,
      bg: 'rgba(74,222,128,0.1)',
      border: 'rgba(74,222,128,0.15)',
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <Nav activePage="insights" />

      <div className="pt-[52px] max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Advanced Estimations */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              <Activity size={15} className="text-violet-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Advanced Estimations</h2>
              <p className="text-zinc-500 text-xs mt-0.5">
                AI-computed metabolic and physiological parameters
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-white/5">
            {estimations.map(({ label, value, unit, icon, bg, border }) => (
              <div key={label} className="p-6">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: bg, border: `1px solid ${border}` }}
                >
                  {icon}
                </div>
                <p className="text-zinc-500 text-xs mb-2">{label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-white font-bold text-3xl metric-number">{value}</span>
                  {unit && <span className="text-zinc-500 text-sm">{unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* Plans grid */}
        <div className="grid grid-cols-2 gap-6">
          {/* Nutrition Plan */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}
              >
                <UtensilsCrossed size={14} className="text-indigo-400" />
              </div>
              <h3 className="text-white font-semibold text-sm">Nutrition Plan</h3>
            </div>

            <div className="p-5 space-y-3">
              {results.nutritionPlan.map((item, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <span
                    className="text-[11px] font-bold mt-0.5 flex-shrink-0"
                    style={{ color: '#6366f1' }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="text-zinc-300 text-xs leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </motion.section>

          {/* Exercise Protocol */}
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                <Dumbbell size={14} className="text-violet-400" />
              </div>
              <h3 className="text-white font-semibold text-sm">Exercise Protocol</h3>
            </div>

            <div className="p-5 space-y-3">
              {results.exercisePlan.map((item, i) => (
                <div
                  key={i}
                  className="flex gap-3 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <span
                    className="text-[11px] font-bold mt-0.5 flex-shrink-0"
                    style={{ color: '#8b5cf6' }}
                  >
                    E{i + 1}
                  </span>
                  <p className="text-zinc-300 text-xs leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </motion.section>
        </div>

        {/* Body Composition Summary */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="px-6 py-5 border-b border-white/5">
            <h2 className="text-white font-semibold text-sm">Composition Breakdown</h2>
            <p className="text-zinc-500 text-xs mt-0.5">
              Estimated body mass distribution based on AI analysis
            </p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Total Weight', value: `${results.input.weight} kg`, color: '#e5e7eb' },
                { label: 'Lean Mass', value: `${results.leanMass} kg`, color: '#4ade80' },
                {
                  label: 'Fat Mass',
                  value: `${(results.input.weight - results.leanMass).toFixed(1)} kg`,
                  color: '#f97316',
                },
                { label: 'Body Fat', value: `${results.bodyFat}%`, color: '#d4a017' },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="p-4 rounded-xl text-center"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">{label}</p>
                  <p className="font-bold text-xl metric-number" style={{ color }}>
                    {value}
                  </p>
                </div>
              ))}
            </div>

            {/* Visual bar */}
            <div className="space-y-2">
              <div className="flex text-xs text-zinc-500 justify-between">
                <span>Lean Mass</span>
                <span>{((results.leanMass / results.input.weight) * 100).toFixed(1)}%</span>
              </div>
              <div className="h-2.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(results.leanMass / results.input.weight) * 100}%`,
                    background: 'linear-gradient(90deg, #4ade80, #22c55e)',
                  }}
                />
              </div>
              <div className="flex text-xs text-zinc-500 justify-between mt-3">
                <span>Fat Mass</span>
                <span>{results.bodyFat}%</span>
              </div>
              <div className="h-2.5 bg-zinc-900 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${results.bodyFat}%`,
                    background: 'linear-gradient(90deg, #f97316, #ef4444)',
                  }}
                />
              </div>
            </div>
          </div>
        </motion.section>

        {/* CTA to Analytics */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex justify-center pb-4"
        >
          <button
            onClick={() => router.push('/analytics')}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.3)',
              color: '#c4b5fd',
            }}
          >
            View Full Analytics & Disease Risk
            <ChevronRight size={16} />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
