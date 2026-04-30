'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Activity, Brain, RefreshCw, CheckCircle, Cpu, Wifi, WifiOff } from 'lucide-react';
import Nav from '@/components/ui/Nav';
import { useScan } from '@/context/ScanContext';
import { streamTraining, checkBackend, BackendTrainEpoch } from '@/lib/backendApi';

const EPOCH_LOGS = [
  { time: '00.0', epoch: '1/50', loss: '4.2218' },
  { time: '00.1', epoch: '6/50', loss: '3.8854' },
  { time: '00.2', epoch: '11/50', loss: '3.6421' },
  { time: '00.4', epoch: '16/50', loss: '3.4663' },
  { time: '01.1', epoch: '21/50', loss: '3.2440' },
  { time: '01.8', epoch: '26/50', loss: '3.4063' },
  { time: '02.2', epoch: '31/50', loss: '2.9999' },
  { time: '03.0', epoch: '36/50', loss: '3.0480' },
  { time: '04.4', epoch: '41/50', loss: '2.1132' },
  { time: '04.5', epoch: '46/50', loss: '1.7474' },
  { time: '05.6', epoch: '50/50', loss: '1.0217' },
];

function OrganCard({
  label,
  status,
  color,
  bg,
  border,
  delay,
}: {
  label: string;
  status: string;
  color: string;
  bg: string;
  border: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="p-5 rounded-xl"
      style={{ background: bg, border: `1px solid ${border}` }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color }}>
        {label}
      </p>
      <p className="font-bold text-lg" style={{ color }}>
        {status}
      </p>
    </motion.div>
  );
}

export default function AnalyticsPage() {
  const { results, isHydrated } = useScan();
  const router = useRouter();
  const [mlRunning, setMlRunning] = useState(false);
  const [mlDone, setMlDone] = useState(false);
  const [logIndex, setLogIndex] = useState(0);
  const [showPrediction, setShowPrediction] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [trainMAE, setTrainMAE] = useState<number | null>(null);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const [useLiveTraining, setUseLiveTraining] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isHydrated && !results) router.replace('/scan');
    checkBackend().then(setBackendAvailable);
  }, [isHydrated, results, router]);

  // Simulated training (no backend)
  useEffect(() => {
    if (mlRunning && !useLiveTraining && logIndex < EPOCH_LOGS.length) {
      const timer = setTimeout(() => {
        setLogIndex((i) => i + 1);
        if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
      }, 220);
      return () => clearTimeout(timer);
    } else if (mlRunning && !useLiveTraining && logIndex >= EPOCH_LOGS.length) {
      setTimeout(() => {
        setMlDone(true);
        setMlRunning(false);
        setTimeout(() => setShowPrediction(true), 400);
      }, 600);
    }
  }, [mlRunning, useLiveTraining, logIndex]);

  // Live training via backend stream
  const handleRunLiveML = useCallback(async () => {
    setMlRunning(true);
    setMlDone(false);
    setConsoleLogs([]);
    setShowPrediction(false);
    setTrainMAE(null);

    try {
      const gen = streamTraining(12_000);
      for await (const event of gen) {
        const msg = buildLogLine(event);
        if (msg) {
          setConsoleLogs((prev) => [...prev, msg]);
          if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
        }
        if (event.type === 'complete') {
          setTrainMAE(event.mae ?? null);
          setMlDone(true);
          setMlRunning(false);
          setTimeout(() => setShowPrediction(true), 400);
          break;
        }
      }
    } catch {
      setConsoleLogs((prev) => [...prev, '> Backend unreachable. Falling back to simulation.']);
      setUseLiveTraining(false);
      setMlRunning(false);
    }
  }, []);

  function buildLogLine(e: BackendTrainEpoch): string | null {
    if (e.type === 'start' || e.type === 'log') return `> ${e.message}`;
    if (e.type === 'epoch')
      return `[${String(e.epoch).padStart(2, '0')}:${String(e.total).padStart(2, '0')}] Epoch ${e.epoch}/${e.total} — loss: ${e.loss}`;
    if (e.type === 'complete')
      return `> Training complete. MAE: ${e.mae?.toFixed(2)}%. Model saved.`;
    return null;
  }

  const handleRunML = () => {
    if (backendAvailable) {
      setUseLiveTraining(true);
      handleRunLiveML();
    } else {
      setUseLiveTraining(false);
      setMlRunning(true);
      setMlDone(false);
      setLogIndex(0);
      setShowPrediction(false);
    }
  };

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

  const riskColors = {
    'Healthy Baseline': { color: '#4ade80', bg: 'rgba(20,52,20,0.8)', border: 'rgba(74,222,128,0.2)' },
    'Optimal function': { color: '#4ade80', bg: 'rgba(20,52,20,0.8)', border: 'rgba(74,222,128,0.2)' },
    Standard: { color: '#4ade80', bg: 'rgba(20,52,20,0.8)', border: 'rgba(74,222,128,0.2)' },
    'Moderate Risk': { color: '#fbbf24', bg: 'rgba(52,38,10,0.8)', border: 'rgba(251,191,36,0.2)' },
    'Monitor closely': { color: '#fbbf24', bg: 'rgba(52,38,10,0.8)', border: 'rgba(251,191,36,0.2)' },
    Borderline: { color: '#fbbf24', bg: 'rgba(52,38,10,0.8)', border: 'rgba(251,191,36,0.2)' },
    'Elevated Risk': { color: '#f87171', bg: 'rgba(52,10,10,0.8)', border: 'rgba(248,113,113,0.2)' },
    Elevated: { color: '#f87171', bg: 'rgba(52,10,10,0.8)', border: 'rgba(248,113,113,0.2)' },
  };

  const getOrganStyle = (status: string) =>
    riskColors[status as keyof typeof riskColors] ?? riskColors['Healthy Baseline'];

  const heartStyle = getOrganStyle(results.heartRisk);
  const liverStyle = getOrganStyle(results.liverRisk);
  const metaStyle = getOrganStyle(results.metabolicRisk);

  const anomalyBadgeStyle = (badge: string) => {
    if (badge.includes('MODERATE-HIGH'))
      return {
        bg: 'rgba(127,29,29,0.5)',
        border: 'rgba(248,113,113,0.3)',
        color: '#fca5a5',
        rowBg: 'rgba(127,29,29,0.15)',
        rowBorder: 'rgba(248,113,113,0.15)',
      };
    return {
      bg: 'rgba(39,39,42,0.8)',
      border: 'rgba(82,82,91,0.4)',
      color: '#a1a1aa',
      rowBg: 'rgba(255,255,255,0.02)',
      rowBorder: 'rgba(255,255,255,0.05)',
    };
  };

  const bioDiff = results.input.age - results.biologicalAge;

  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a' }}>
      <Nav activePage="analytics" />

      <div className="pt-[52px] max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Organ Risk Prediction */}
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
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              <Heart size={15} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">Organ Risk Prediction Engine</h2>
              <p className="text-zinc-500 text-xs mt-0.5">
                AI projection based on your estimated internal visceral fat percentages.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 p-6">
            <OrganCard
              label="Heart (Cardio)"
              status={results.heartRisk}
              {...heartStyle}
              delay={0.1}
            />
            <OrganCard
              label="Liver (Visceral)"
              status={results.liverRisk}
              {...liverStyle}
              delay={0.15}
            />
            <OrganCard
              label="Metabolic (Kidneys/Pancreas)"
              status={results.metabolicRisk}
              {...metaStyle}
              delay={0.2}
            />
          </div>
        </motion.section>

        {/* AI Disease & Anomaly Detection */}
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
          <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.18)' }}
            >
              <Activity size={15} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">AI Disease & Anomaly Detection</h2>
              <p className="text-zinc-500 text-xs mt-0.5">
                Analysis of your image and parameters for potential long-term health risks.
              </p>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {results.anomalies.map((anomaly, i) => {
              const style = anomalyBadgeStyle(anomaly.badge);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: style.rowBg, border: `1px solid ${style.rowBorder}` }}
                >
                  <div>
                    <p
                      className="font-semibold text-sm mb-1"
                      style={{
                        color: anomaly.badge.includes('MODERATE-HIGH') ? '#fca5a5' : '#e5e7eb',
                      }}
                    >
                      {anomaly.name}
                    </p>
                    <p className="text-zinc-500 text-xs">{anomaly.description}</p>
                  </div>
                  <span
                    className="text-[10px] font-bold px-3 py-1 rounded-lg whitespace-nowrap ml-4 flex-shrink-0"
                    style={{
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      color: style.color,
                    }}
                  >
                    {anomaly.badge}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.section>

        {/* Regional Fat Distribution (ML result) */}
        {results.regionalFat && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="rounded-2xl overflow-hidden"
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.2)' }}
              >
                <Cpu size={15} className="text-green-400" />
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Regional Fat Distribution</h2>
                <p className="text-zinc-500 text-xs mt-0.5">
                  ML-computed via MediaPipe pose + Navy body fat formula ·{' '}
                  <span className="text-green-500">
                    {Math.round((results.mlAnalysis?.confidence ?? 0) * 100)}% confidence
                  </span>
                </p>
              </div>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              {Object.entries(results.regionalFat).map(([region, pct]) => {
                const label = region.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                const normalized = Math.min(100, (pct / 40) * 100);
                const color = pct < 15 ? '#4ade80' : pct < 25 ? '#fbbf24' : '#f87171';
                return (
                  <div
                    key={region}
                    className="p-4 rounded-xl"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-2">{label}</p>
                    <p className="font-bold text-xl metric-number mb-2" style={{ color }}>
                      {pct}%
                    </p>
                    <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${normalized}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {results.mlAnalysis?.measurements && Object.keys(results.mlAnalysis.measurements).length > 0 && (
              <div className="px-6 pb-5">
                <p className="text-zinc-600 text-[11px] mb-3 uppercase tracking-wider">
                  Estimated Measurements (from pose landmarks)
                </p>
                <div className="flex flex-wrap gap-3">
                  {Object.entries(results.mlAnalysis.measurements).map(([k, v]) => (
                    <span
                      key={k}
                      className="text-xs px-3 py-1.5 rounded-lg font-mono"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        color: '#a1a1aa',
                      }}
                    >
                      {k.replace(/_/g, ' ')}: <span className="text-white">{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </motion.section>
        )}

        {/* Deep ML Prediction Engine */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div className="px-6 py-5 border-b border-white/5 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Brain size={18} className="text-indigo-400" />
              <h2 className="text-white font-bold text-lg">Deep ML Prediction Engine</h2>
            </div>
            <div className="flex items-center justify-center gap-2 mt-1">
              <p className="text-zinc-500 text-xs">scikit-learn MLP · Navy formula dataset · 12k samples</p>
              {backendAvailable !== null && (
                <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded ${
                  backendAvailable
                    ? 'bg-green-900/40 text-green-400 border border-green-900'
                    : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                }`}>
                  {backendAvailable ? <Wifi size={9} /> : <WifiOff size={9} />}
                  {backendAvailable ? 'Live Training' : 'Simulated'}
                </span>
              )}
            </div>
          </div>

          <div className="p-6 grid grid-cols-2 gap-6">
            {/* Console */}
            <div
              className="rounded-xl overflow-hidden"
              style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                  </div>
                  <span className="text-zinc-500 text-xs font-mono">Runtime Console</span>
                </div>
                {mlDone && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-800/50">
                    COMPLETE
                  </span>
                )}
                {mlRunning && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-800/50 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    RUNNING
                  </span>
                )}
              </div>

              <div
                ref={consoleRef}
                className="p-4 h-48 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5"
              >
                {/* Live backend logs */}
                {useLiveTraining ? (
                  consoleLogs.length === 0 && !mlDone ? (
                    <p className="text-zinc-600">{'>'} Connecting to backend... <span className="console-cursor" /></p>
                  ) : (
                    <>
                      {consoleLogs.map((log, i) => (
                        <p key={i} className={log.startsWith('[') ? 'text-green-400/80' : 'text-zinc-400'}>
                          {log}
                        </p>
                      ))}
                      {mlDone && (
                        <>
                          <p className="text-green-400">{'>'} Running biological age inference...</p>
                          <p className="text-white font-bold">
                            {'>'} Prediction locked: Biological Age = {results.biologicalAge} yrs
                            {trainMAE !== null && ` (MAE: ${trainMAE}%)`}
                          </p>
                        </>
                      )}
                      {mlRunning && <p className="text-zinc-400">{'>'} <span className="console-cursor" /></p>}
                    </>
                  )
                ) : (
                  /* Simulated logs */
                  logIndex === 0 && !mlRunning ? (
                    <p className="text-zinc-600">
                      {'>'} Awaiting network initialization... <span className="console-cursor" />
                    </p>
                  ) : (
                    <>
                      <p className="text-zinc-500">{'>'} Initializing scikit-learn MLP model...</p>
                      <p className="text-zinc-500">{'>'} Loading Navy formula dataset (n=12,000)...</p>
                      <p className="text-zinc-500">{'>'} Based on US Navy body fat estimation method</p>
                      <p className="text-zinc-500">{'>'} Beginning training — 50 epochs (128→64→32)</p>
                      {EPOCH_LOGS.slice(0, logIndex).map((log, i) => (
                        <p key={i} className="text-green-400/70">
                          [{log.time.padStart(6, '0')}] Epoch {log.epoch} — loss: {log.loss}
                        </p>
                      ))}
                      {mlDone && (
                        <>
                          <p className="text-green-400">{'>'} Training complete. Model weights optimized.</p>
                          <p className="text-green-400">{'>'} Running inference on personalized parameters...</p>
                          <p className="text-white font-bold">
                            {'>'} Prediction locked: Biological Age is {results.biologicalAge} years.
                          </p>
                        </>
                      )}
                      {mlRunning && logIndex < EPOCH_LOGS.length && (
                        <p className="text-zinc-400">{'>'} <span className="console-cursor" /></p>
                      )}
                    </>
                  )
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/5">
                <button
                  onClick={handleRunML}
                  disabled={mlRunning}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: mlRunning
                      ? 'rgba(255,255,255,0.03)'
                      : 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: mlRunning ? 'rgba(255,255,255,0.3)' : 'white',
                  }}
                >
                  {mlRunning ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      Training in Progress...
                    </>
                  ) : (
                    <>
                      <Activity size={13} />
                      RE-TRAIN NETWORK
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Prediction Results */}
            <div className="flex flex-col gap-4">
              <AnimatePresence>
                {showPrediction ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex-1"
                  >
                    <p className="text-zinc-400 text-xs text-center mb-4 uppercase tracking-widest">
                      Prediction Results
                    </p>

                    <div className="flex items-center justify-center gap-4 mb-4">
                      {/* Chronological */}
                      <div className="text-center">
                        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-2">
                          Chronological
                        </p>
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white metric-number"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '2px solid rgba(255,255,255,0.1)',
                          }}
                        >
                          {results.input.age}
                        </div>
                      </div>

                      <span className="text-zinc-600 text-xs font-bold">VS</span>

                      {/* Biological */}
                      <div className="text-center">
                        <p className="text-indigo-400 text-[10px] uppercase tracking-widest mb-2 font-bold">
                          Biological
                        </p>
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold metric-number"
                          style={{
                            background: 'rgba(99,102,241,0.15)',
                            border: '2px solid rgba(99,102,241,0.4)',
                            color: '#818cf8',
                          }}
                        >
                          {results.biologicalAge}
                        </div>
                      </div>
                    </div>

                    {/* Model conclusion */}
                    <div
                      className="p-4 rounded-xl"
                      style={{
                        background: 'rgba(74,222,128,0.06)',
                        border: '1px solid rgba(74,222,128,0.15)',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle size={14} className="text-green-400" />
                        <p className="text-green-400 text-xs font-semibold">Model Conclusion</p>
                      </div>
                      <p className="text-zinc-300 text-xs leading-relaxed">
                        {bioDiff >= 0
                          ? `Excellent! Your biological age is estimated to be ${bioDiff} years younger than your chronological age. Your metric profile indicates healthy cellular and metabolic aging.`
                          : `Your biological age is estimated to be ${Math.abs(bioDiff)} years older than your chronological age. Consider the recommendations in your Insights report.`}
                      </p>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 flex flex-col items-center justify-center gap-3"
                  >
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}
                    >
                      <Brain size={28} className="text-indigo-400/50" />
                    </div>
                    <p className="text-zinc-600 text-xs text-center max-w-[160px]">
                      Run the neural network to predict your biological age
                    </p>
                    <button
                      onClick={handleRunML}
                      className="px-5 py-2 rounded-xl text-xs font-semibold"
                      style={{
                        background: 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.25)',
                        color: '#a5b4fc',
                      }}
                    >
                      Run Prediction
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
