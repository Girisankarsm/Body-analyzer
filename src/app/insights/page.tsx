'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Activity, Droplets, Zap, UtensilsCrossed, Dumbbell, ChevronRight } from 'lucide-react';
import Nav from '@/components/ui/Nav';
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
      label: 'Basal Metabolic Rate',
      value: results.bmr.toLocaleString(),
      unit: 'kcal/day',
      sub: 'Mifflin-St Jeor formula',
      icon: <Zap size={16} className="text-violet-400" />,
      bg: 'rgba(139,92,246,0.1)',
      border: 'rgba(139,92,246,0.15)',
    },
    {
      label: 'Daily Calorie Need (TDEE)',
      value: (results.tdee ?? Math.round(results.bmr * 1.4)).toLocaleString(),
      unit: 'kcal/day',
      sub: 'BMR × 1.4 activity',
      icon: <Activity size={16} className="text-orange-400" />,
      bg: 'rgba(249,115,22,0.1)',
      border: 'rgba(249,115,22,0.15)',
    },
    {
      label: 'Hydration Target',
      value: results.hydrationTarget.toString(),
      unit: 'L/day',
      sub: `${results.input.weight}kg × 0.033`,
      icon: <Droplets size={16} className="text-blue-400" />,
      bg: 'rgba(59,130,246,0.1)',
      border: 'rgba(59,130,246,0.15)',
    },
    {
      label: 'Metabolic Age',
      value: `${results.metabolicAge ?? results.biologicalAge}`,
      unit: 'years',
      sub: `Actual age: ${results.input.age}y`,
      icon: <Zap size={16} className="text-green-400" />,
      bg: 'rgba(74,222,128,0.1)',
      border: 'rgba(74,222,128,0.15)',
    },
    {
      label: 'Visceral Fat Level',
      value: `${results.visceralFatLevel ?? '—'}/12`,
      unit: '',
      sub: results.visceralFatLevel <= 4 ? 'Healthy range' : results.visceralFatLevel <= 8 ? 'Moderate — monitor' : 'High — action needed',
      icon: <Activity size={16} className="text-red-400" />,
      bg: 'rgba(239,68,68,0.1)',
      border: 'rgba(239,68,68,0.15)',
    },
    {
      label: 'Recovery Stress',
      value: results.recoveryStress,
      unit: '',
      sub: `BMI ${results.bmi} · BF ${results.bodyFat}%`,
      icon: <Activity size={16} className="text-teal-400" />,
      bg: 'rgba(20,184,166,0.1)',
      border: 'rgba(20,184,166,0.15)',
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

          <div className="grid grid-cols-3 divide-x divide-y divide-white/5">
            {estimations.map(({ label, value, unit, sub, icon, bg, border }) => (
              <div key={label} className="p-5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                  style={{ background: bg, border: `1px solid ${border}` }}
                >
                  {icon}
                </div>
                <p className="text-zinc-500 text-xs mb-1.5">{label}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-white font-bold text-2xl metric-number">{value}</span>
                  {unit && <span className="text-zinc-500 text-xs">{unit}</span>}
                </div>
                {sub && <p className="text-zinc-600 text-[10px] mt-1">{sub}</p>}
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

        {/* Body Composition Breakdown */}
        <motion.section
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <ChevronRight size={15} className="text-indigo-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Detailed Body Composition</h2>
              <p className="text-zinc-500 text-xs mt-0.5">Ensemble ML multi-output prediction</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5 p-0">
            {[
              { label: 'Fat Mass',    value: `${results.fatMassKg ?? results.bodyComposition?.fat_mass_kg ?? (results.input.weight * results.bodyFat / 100).toFixed(1)}`, unit: 'kg', color: '#f87171' },
              { label: 'Muscle Mass', value: `${results.muscleMass ?? results.bodyComposition?.muscle_mass_kg ?? '—'}`,  unit: 'kg', color: '#4ade80' },
              { label: 'Bone Mass',   value: `${results.boneMass  ?? results.bodyComposition?.bone_mass_kg  ?? '—'}`,  unit: 'kg', color: '#60a5fa' },
              { label: 'Body Water',  value: `${results.bodyComposition?.water_liters ?? (results.input.weight * 0.6 * (1 - results.bodyFat / 100 * 0.4)).toFixed(1)}`, unit: 'L',  color: '#818cf8' },
            ].map(({ label, value, unit, color }) => (
              <div key={label} className="p-5 text-center">
                <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-2">{label}</p>
                <p className="text-white font-bold text-2xl metric-number" style={{ color }}>{value}</p>
                <p className="text-zinc-600 text-xs mt-1">{unit}</p>
              </div>
            ))}
          </div>
          <div className="px-6 pb-5 space-y-2.5">
            {[
              { label: 'Trunk Fat',      pct: results.trunkFatPct,        color: '#f87171' },
              { label: 'Appendicular',   pct: results.appendicularFatPct, color: '#fbbf24' },
            ].map(({ label, pct, color }) => (
              <div key={label}>
                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                  <span>{label} distribution</span>
                  <span className="text-white font-semibold">{pct}%</span>
                </div>
                <div className="h-2 bg-zinc-900 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-1">
              <span className="text-zinc-500 text-xs">Body Type Classification</span>
              <span className="text-white text-xs font-semibold px-2.5 py-0.5 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.2)', color: '#818cf8' }}>
                {results.bodyType ?? 'Calculating…'}
              </span>
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
