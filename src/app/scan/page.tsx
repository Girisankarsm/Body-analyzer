'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, Activity, ChevronRight, Cpu, Wifi, WifiOff, LogOut } from 'lucide-react';
import Image from 'next/image';
import { computeMetrics } from '@/lib/metrics';
import { useScan } from '@/context/ScanContext';
import { analyzeBody, checkBackend } from '@/lib/backendApi';

const ANALYSIS_STEPS = [
  { label: 'Uploading image to ML pipeline...', ml: false },
  { label: 'Running MediaPipe pose detection...', ml: true },
  { label: 'Estimating neck & waist from landmarks...', ml: true },
  { label: 'Applying Navy body fat formula...', ml: true },
  { label: 'Running MLP neural network inference...', ml: true },
  { label: 'Computing regional fat distribution...', ml: true },
  { label: 'Generating personalized insights...', ml: false },
];

const FALLBACK_STEPS = [
  { label: 'Uploading image data...', ml: false },
  { label: 'Extracting biometric features...', ml: false },
  { label: 'Running AI fat decomposition model...', ml: false },
  { label: 'Computing Deurenberg body composition...', ml: false },
  { label: 'Calculating metabolic parameters...', ml: false },
  { label: 'Generating personalized insights...', ml: false },
];

export default function ScanPage() {
  const [form, setForm] = useState({
    name: '',
    age: '',
    height: '',
    weight: '',
    gender: 'male' as 'male' | 'female',
  });
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [usingML, setUsingML] = useState(false);
  const [mlConfidence, setMlConfidence] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { data: session } = useSession();
  const { setResults } = useScan();

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setImageName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setImageDataUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const isValid =
    form.name.trim() &&
    parseInt(form.age) > 0 &&
    parseFloat(form.height) > 0 &&
    parseFloat(form.weight) > 0;

  const handleAnalyze = async () => {
    if (!isValid) return;
    setLoading(true);
    setStep(0);
    setProgress(0);
    setMlConfidence(null);

    // Check if Python backend is available
    const online = await checkBackend();
    setBackendOnline(online);
    setUsingML(online);

    const steps = online ? ANALYSIS_STEPS : FALLBACK_STEPS;

    // Run ML analysis in parallel with UI steps
    let mlResult = null;
    if (online) {
      mlResult = analyzeBody({
        imageDataUrl,
        height_cm: parseFloat(form.height),
        weight_kg: parseFloat(form.weight),
        gender: form.gender,
        age: parseInt(form.age),
      });
    }

    // Animate steps
    for (let i = 0; i < steps.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 420 + Math.random() * 260));
      setProgress(Math.round(((i + 1) / steps.length) * 100));
    }

    // Await ML result
    const backendData = online ? await mlResult : null;

    // Compute base metrics
    const results = computeMetrics({
      name: form.name,
      age: parseInt(form.age),
      height: parseFloat(form.height),
      weight: parseFloat(form.weight),
      gender: form.gender,
      imageDataUrl,
    });

    // Merge ML results if available
    if (backendData) {
      results.bodyFat = backendData.body_fat;
      results.leanMass = backendData.lean_mass;
      setMlConfidence(backendData.confidence);

      // Recompute derived metrics with ML body fat
      const hM = parseFloat(form.height) / 100;
      const w = parseFloat(form.weight);
      results.bmi = parseFloat((w / (hM * hM)).toFixed(1));

      const bf = backendData.body_fat;
      const sex = form.gender === 'male' ? 1 : 0;
      const age = parseInt(form.age);
      const bmi = results.bmi;

      if (bf < 8 && form.gender === 'male') results.bfStatus = 'LOW';
      else if (bf < 20 && form.gender === 'male') results.bfStatus = 'NORMAL';
      else if (bf < 25 && form.gender === 'male') results.bfStatus = 'HIGH';
      else if (form.gender === 'male') results.bfStatus = 'OBESE';
      else if (bf < 15) results.bfStatus = 'LOW';
      else if (bf < 30) results.bfStatus = 'NORMAL';
      else if (bf < 35) results.bfStatus = 'HIGH';
      else results.bfStatus = 'OBESE';

      results.mlAnalysis = {
        source: backendData.source,
        confidence: backendData.confidence,
        measurements: backendData.measurements,
        regional_distribution: backendData.regional_distribution,
      };
      results.regionalFat = backendData.regional_distribution;
    }

    setResults(results);
    // Small delay ensures localStorage write + state update flush before navigation
    await new Promise((r) => setTimeout(r, 80));
    router.push('/dashboard');
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: '#0a0a0a' }}
    >
      {/* Top bar */}
      <header
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3"
        style={{
          background: 'rgba(10,10,10,0.85)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <Activity size={15} color="white" />
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">BodyAnalyzer</span>
        </div>

        {session?.user && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt={session.user.name ?? ''}
                  width={26}
                  height={26}
                  className="rounded-full"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                />
              ) : (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'rgba(74,222,128,0.2)', color: '#4ade80' }}
                >
                  {session.user.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="text-zinc-400 text-xs hidden sm:block">
                {session.user.name}
              </span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex items-center gap-1.5 text-zinc-500 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded-lg"
              style={{ border: '1px solid rgba(255,255,255,0.07)' }}
            >
              <LogOut size={12} />
              Sign out
            </button>
          </div>
        )}
      </header>

      {/* Grid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(74,222,128,0.04) 0%, transparent 70%)',
        }}
      />

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 w-full max-w-sm px-6 text-center pt-16"
          >
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-2 border-green-400/10" />
              <div
                className="absolute inset-0 rounded-full border-2 border-t-green-400 animate-spin"
                style={{ animationDuration: '1.2s' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                {usingML ? (
                  <Cpu size={26} className="text-green-400" />
                ) : (
                  <Activity size={26} className="text-green-400" />
                )}
              </div>
            </div>

            <div>
              <p className="text-white font-semibold text-lg mb-1">Analyzing Body Composition</p>
              <div className="flex items-center justify-center gap-1.5">
                {backendOnline === null ? (
                  <span className="text-zinc-500 text-xs">Connecting to ML engine...</span>
                ) : backendOnline ? (
                  <span className="flex items-center gap-1.5 text-green-400 text-xs font-medium">
                    <Wifi size={11} />
                    ML backend active — MediaPipe + Navy formula
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-yellow-500 text-xs">
                    <WifiOff size={11} />
                    Using Deurenberg formula (backend offline)
                  </span>
                )}
              </div>
            </div>

            {/* Steps */}
            <div className="w-full space-y-2">
              {(backendOnline ? ANALYSIS_STEPS : FALLBACK_STEPS).map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-left">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all duration-300 ${
                      i < step
                        ? 'bg-green-500 text-black'
                        : i === step
                        ? 'border-2 border-green-400 text-green-400'
                        : 'border border-zinc-700 text-zinc-600'
                    }`}
                  >
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span
                    className={`text-xs font-mono transition-colors duration-300 flex items-center gap-1.5 ${
                      i <= step ? 'text-zinc-300' : 'text-zinc-600'
                    }`}
                  >
                    {s.label}
                    {s.ml && backendOnline && (
                      <span className="text-[9px] px-1 rounded bg-green-900/40 text-green-500 border border-green-900">
                        ML
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="w-full">
              <div className="flex justify-between text-xs text-zinc-500 mb-2">
                <span>Processing</span>
                <span className="font-mono text-green-400">{progress}%</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-green-400 rounded-full"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-lg px-6 py-8 pt-20"
          >
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-4">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'rgba(74,222,128,0.1)',
                    border: '1px solid rgba(74,222,128,0.2)',
                  }}
                >
                  <Activity size={16} className="text-green-400" />
                </div>
                <span className="text-white font-bold text-xl tracking-tight">BodyAnalyzer</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Begin Your Body Scan</h1>
              <p className="text-zinc-500 text-sm">
                AI-powered body composition analysis using the Navy body fat formula + MediaPipe pose estimation.
              </p>
            </div>

            <div
              className="rounded-2xl p-6 space-y-5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter your name"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors"
                />
              </div>

              {/* Gender toggle */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
                  Biological Sex
                </label>
                <div
                  className="flex rounded-xl p-1"
                  style={{ background: '#111', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {(['male', 'female'] as const).map((g) => (
                    <button
                      key={g}
                      onClick={() => setForm({ ...form, gender: g })}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
                        form.gender === g
                          ? 'bg-white text-black shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age / Height / Weight */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'age', label: 'Age', unit: 'yrs' },
                  { key: 'height', label: 'Height', unit: 'cm' },
                  { key: 'weight', label: 'Weight', unit: 'kg' },
                ].map(({ key, label, unit }) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
                      {label}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={form[key as keyof typeof form]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder="0"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-zinc-600 transition-colors pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-600">
                        {unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Image upload */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2 uppercase tracking-wider">
                  Body Photo{' '}
                  <span className="normal-case text-zinc-600 font-normal">
                    (required for ML pose analysis)
                  </span>
                </label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className="relative rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 overflow-hidden"
                  style={{
                    borderColor: dragOver
                      ? 'rgba(74,222,128,0.4)'
                      : imageDataUrl
                      ? 'rgba(74,222,128,0.2)'
                      : 'rgba(255,255,255,0.08)',
                    background: dragOver ? 'rgba(74,222,128,0.04)' : '#0d0d0d',
                  }}
                >
                  {imageDataUrl ? (
                    <div className="relative h-36">
                      <img
                        src={imageDataUrl}
                        alt="Uploaded"
                        className="w-full h-full object-cover opacity-60"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <div className="text-center">
                          <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-2">
                            <span className="text-green-400 text-sm">✓</span>
                          </div>
                          <p className="text-xs text-green-400 font-medium">{imageName}</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            MediaPipe will detect pose landmarks
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageDataUrl(null);
                          setImageName('');
                        }}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center"
                      >
                        <X size={12} color="white" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        <Upload size={18} className="text-zinc-400" />
                      </div>
                      <p className="text-sm text-zinc-400 font-medium">
                        Drop body photo or click to upload
                      </p>
                      <p className="text-xs text-zinc-600">
                        Stand 1m+ from camera, full body visible for best results
                      </p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
              </div>

              {/* ML info badge */}
              <div
                className="flex items-start gap-3 p-3 rounded-xl"
                style={{
                  background: 'rgba(74,222,128,0.04)',
                  border: '1px solid rgba(74,222,128,0.1)',
                }}
              >
                <Cpu size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                <p className="text-zinc-400 text-xs leading-relaxed">
                  Uses{' '}
                  <span className="text-green-400 font-medium">MediaPipe Pose</span> to detect neck
                  &amp; waist landmarks, then applies the{' '}
                  <span className="text-green-400 font-medium">Navy body fat formula</span> with MLP
                  refinement. Start the Python backend for full ML analysis.
                </p>
              </div>

              {/* Analyze button */}
              <button
                onClick={handleAnalyze}
                disabled={!isValid}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200"
                style={{
                  background: isValid
                    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                    : 'rgba(255,255,255,0.04)',
                  color: isValid ? 'black' : 'rgba(255,255,255,0.2)',
                  cursor: isValid ? 'pointer' : 'not-allowed',
                }}
              >
                <Cpu size={16} />
                Run ML Body Analysis
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Backend start instructions */}
            <div
              className="mt-4 p-3 rounded-xl"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <p className="text-zinc-600 text-xs mb-1 font-medium">To enable full ML analysis:</p>
              <code className="text-zinc-500 text-[11px] font-mono">
                cd backend && bash start.sh
              </code>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
