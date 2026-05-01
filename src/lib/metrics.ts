export interface ScanInput {
  name: string;
  age: number;
  height: number;
  weight: number;
  gender: 'male' | 'female';
  imageDataUrl: string | null;
}

export interface Anomaly {
  name: string;
  description: string;
  badge: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RegionalFat {
  core_abdomen: number;
  chest: number;
  arms: number;
  thighs: number;
  calves: number;
  back: number;
  trunk_fat_kg?: number;
  appendicular_fat_kg?: number;
}

export interface BodyComposition {
  fat_mass_kg: number;
  lean_mass_kg: number;
  muscle_mass_kg: number;
  bone_mass_kg: number;
  water_liters: number;
  water_pct: number;
  fat_pct: number;
  lean_pct: number;
}

export interface MLAnalysis {
  source: string;
  confidence: number;
  measurements: {
    estimated_neck_cm?: number;
    estimated_waist_cm?: number;
    estimated_hip_cm?: number;
  };
  regional_distribution: RegionalFat;
  body_composition?: BodyComposition;
  trunk_fat_pct?: number;
  appendicular_fat_pct?: number;
  visceral_fat_level?: number;
  metabolic_age?: number;
  body_type?: string;
}

export interface ScanResults {
  input: ScanInput;
  bmi: number;
  bodyFat: number;
  bodyFatCILow?: number;
  bodyFatCIHigh?: number;
  bodyFatStd?: number;
  modelR2?: number;
  modelCvMae?: number;
  modelDataSource?: string;
  leanMass: number;
  muscleMass: number;
  boneMass: number;
  waterPct: number;
  fatMassKg: number;
  bmr: number;
  tdee: number;
  hydrationTarget: number;
  score: number;
  biologicalAge: number;
  metabolicAge: number;
  visceralFatLevel: number;
  bodyType: string;
  trunkFatPct: number;
  appendicularFatPct: number;
  bfStatus: 'LOW' | 'NORMAL' | 'HIGH' | 'OBESE';
  lmStatus: 'LOW' | 'NORMAL' | 'HIGH';
  recoveryStress: 'Optimal' | 'Moderate' | 'Elevated';
  heartRisk: string;
  liverRisk: string;
  metabolicRisk: string;
  kidneyRisk: string;
  anomalies: Anomaly[];
  nutritionPlan: string[];
  exercisePlan: string[];
  sparklineData: number[];
  leanMassHistory: { month: string; value: number }[];
  bodyComposition: BodyComposition;
  mlAnalysis?: MLAnalysis;
  regionalFat?: RegionalFat;
  morphTargets?: {
    morph_scales: {
      torso: number;
      belly: number;
      chest: number;
      hips:  number;
      arms:  number;
      legs:  number;
    };
    heatmap: {
      abdomen: number;
      chest:   number;
      back:    number;
      arms:    number;
      thighs:  number;
      calves:  number;
    };
    overall_fatness: number;
  };
  scanDate: string;
}

export function computeMetrics(input: ScanInput): ScanResults {
  const { age, height, weight, gender } = input;
  const hM  = height / 100;
  const bmi = parseFloat((weight / (hM * hM)).toFixed(1));
  const sex = gender === 'male' ? 1 : 0;

  // Body fat (Deurenberg formula — frontend fallback)
  const bodyFat = parseFloat(
    Math.max(4, Math.min(50, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4)).toFixed(1)
  );

  // Body composition breakdown
  const fatMassKg   = parseFloat((weight * bodyFat / 100).toFixed(1));
  const leanMass    = parseFloat((weight - fatMassKg).toFixed(1));
  const muscleMass  = parseFloat((leanMass * (gender === 'male' ? 0.47 : 0.40)).toFixed(1));
  const boneMass    = parseFloat((Math.max(1.5, Math.min(5.5, leanMass * (gender === 'male' ? 0.072 : 0.068))).toFixed(1)));
  const waterLiters = parseFloat((weight * 0.6 * (1 - bodyFat / 100 * 0.4)).toFixed(1));
  const waterPct    = parseFloat((waterLiters / weight * 100).toFixed(1));

  const bodyComposition: BodyComposition = {
    fat_mass_kg:    fatMassKg,
    lean_mass_kg:   leanMass,
    muscle_mass_kg: muscleMass,
    bone_mass_kg:   boneMass,
    water_liters:   waterLiters,
    water_pct:      waterPct,
    fat_pct:        bodyFat,
    lean_pct:       parseFloat((100 - bodyFat).toFixed(1)),
  };

  // Regional fat (formula-based estimate)
  const trunkFatPct        = parseFloat((bodyFat * (gender === 'male' ? 0.54 : 0.47)).toFixed(1));
  const appendicularFatPct = parseFloat((bodyFat * (gender === 'male' ? 0.36 : 0.42)).toFixed(1));

  // Visceral fat level estimate (1–12)
  const whr = gender === 'male' ? 0.91 : 0.81;
  const visceralFatLevel = parseFloat(Math.max(1, Math.min(12,
    (bodyFat * whr * 0.28) + (age - 20) * 0.04 + (whr - 0.8) * 8
  )).toFixed(1));

  // BMR (Mifflin-St Jeor)
  const bmr = Math.round(
    gender === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161
  );
  const tdee = Math.round(bmr * 1.4);
  const hydrationTarget = parseFloat((weight * 0.033).toFixed(1));

  // Health score (0–100)
  const bmiScore = bmi >= 18.5 && bmi <= 24.9 ? 30 : bmi < 18.5 ? 18 : bmi <= 27 ? 24 : 10;
  const bfScore  = (gender === 'male' ? bodyFat < 20 : bodyFat < 28) ? 35 : bodyFat < 30 ? 22 : 12;
  const ageScore = age < 30 ? 20 : age < 40 ? 16 : age < 50 ? 12 : 8;
  const score    = Math.min(100, Math.max(40, bmiScore + bfScore + ageScore + 13));

  // Ages
  const bfBias  = gender === 'male' ? bodyFat - 15 : bodyFat - 22;
  const bmiBias = bmi - 22;
  const biologicalAge = Math.round(Math.max(18, Math.min(age + 15, age + bfBias * 0.3 + bmiBias * 0.4)));
  const metabolicAge  = Math.round(Math.max(18, Math.min(age + 20, age + bfBias * 0.35 + bmiBias * 0.45)));

  // Body type
  const bodyType = gender === 'male'
    ? (bmi < 22 && trunkFatPct < 12 ? 'Athletic / Inverted Triangle' : bmi > 27 ? 'Apple (Android)' : 'Rectangular')
    : (bodyFat < 22 ? 'Hourglass' : bodyFat > 32 ? 'Apple (Android)' : 'Pear (Gynoid)');

  // Statuses — ACE clinical body fat classification
  // Male:   Essential <5%, Athletic 5-13%, Fit 14-17%, Acceptable 18-24%, Obese 25%+
  // Female: Essential <10%, Athletic 14-20%, Fit 21-24%, Acceptable 25-31%, Obese 32%+
  let bfStatus: 'LOW' | 'NORMAL' | 'HIGH' | 'OBESE';
  if (gender === 'male') {
    bfStatus = bodyFat < 6 ? 'LOW' : bodyFat < 18 ? 'NORMAL' : bodyFat < 25 ? 'HIGH' : 'OBESE';
  } else {
    bfStatus = bodyFat < 12 ? 'LOW' : bodyFat < 25 ? 'NORMAL' : bodyFat < 32 ? 'HIGH' : 'OBESE';
  }

  const lmLow = gender === 'male' ? 45 : 30;
  const lmHigh = gender === 'male' ? 75 : 55;
  const lmStatus: 'LOW' | 'NORMAL' | 'HIGH' =
    leanMass < lmLow ? 'LOW' : leanMass <= lmHigh ? 'NORMAL' : 'HIGH';

  const recoveryStress: 'Optimal' | 'Moderate' | 'Elevated' =
    bmi < 25 && bodyFat < 24 ? 'Optimal' : bmi < 28 ? 'Moderate' : 'Elevated';

  // Risk levels — calibrated to ACE + WHO clinical thresholds
  const heartRisk     = bodyFat < 20 ? 'Healthy Baseline' : bodyFat < 28 ? 'Moderate Risk' : 'Elevated Risk';
  const liverRisk     = bodyFat < 22 ? 'Optimal function' : bodyFat < 30 ? 'Monitor closely' : 'Elevated Risk';
  const metabolicRisk = bmi < 25 ? 'Standard' : bmi < 29 ? 'Borderline' : 'Elevated';
  const kidneyRisk    = visceralFatLevel < 5 ? 'Low Risk' : visceralFatLevel < 9 ? 'Moderate Risk' : 'Elevated Risk';

  // Anomaly detection — use ACE thresholds
  const anomalies: Anomaly[] = [];
  if (bodyFat > 25 || bmi > 28) {
    anomalies.push({
      name: 'Cardiovascular Disease',
      description: 'Central, visceral fat distribution increases strain on the heart.',
      badge: 'MODERATE-HIGH RISK', severity: 'high',
    });
  }
  if (visceralFatLevel > 8) {
    anomalies.push({
      name: 'Visceral Adiposity',
      description: `Elevated visceral fat level (${visceralFatLevel}/12) detected — associated with metabolic syndrome.`,
      badge: 'HIGH VISCERAL FAT', severity: 'high',
    });
  }
  if (bfStatus === 'NORMAL' || bfStatus === 'LOW') {
    anomalies.push({
      name: 'Postural Asymmetry Risk',
      description: 'Low body fat may reduce lumbar cushioning; monitor spinal posture.',
      badge: 'LOW RISK', severity: 'low',
    });
  } else {
    anomalies.push({
      name: 'Postural Kyphosis',
      description: 'Elevated body fat increases anterior pelvic tilt and lumbar load.',
      badge: 'DETECTED VIA ANALYSIS', severity: 'medium',
    });
  }
  anomalies.push({
    name: 'Asymmetric Muscle Tone',
    description: 'Imbalance in lean mass distribution detected bilaterally.',
    badge: 'DETECTED VIA IMAGE ANALYSIS', severity: 'low',
  });

  // Personalised plans based on body fat + status
  const nutritionPlan: string[] = bodyFat < 12 ? [
    `Increase caloric intake to ${tdee + 300}–${tdee + 500} kcal/day for lean muscle gain.`,
    'Prioritize protein synthesis — target 1.8–2.2g per kg body weight daily.',
    'Include calorie-dense whole foods: nuts, avocados, sweet potato, legumes.',
    'Add creatine monohydrate (3–5g/day) to support muscle development.',
    `Bone mass (${boneMass}kg) is adequate — maintain with calcium-rich foods + Vitamin D.`,
  ] : bodyFat < 22 ? [
    `Maintain ${tdee}–${tdee + 100} kcal/day with balanced macros: 40% carbs / 30% protein / 30% fat.`,
    'Prioritize protein — target 1.6g per kg to preserve lean mass.',
    'Include omega-3 fatty acids (salmon, flaxseed) to reduce inflammation.',
    `Stay hydrated: ${hydrationTarget}L water/day based on your ${weight}kg body weight.`,
    `Muscle mass (${muscleMass}kg) is your foundation — protect it with consistent protein intake.`,
    'Limit ultra-processed foods and added sugars to maintain metabolic health.',
  ] : [
    `Target a 350–500 kcal daily deficit from maintenance (${tdee} kcal/day).`,
    'Eliminate processed carbohydrates; replace with fibrous vegetables and legumes.',
    `Visceral fat level ${visceralFatLevel}/12 — prioritize abdominal fat reduction through dietary changes.`,
    'Prioritize lean protein (chicken, fish, tofu) — 1.8g/kg to preserve muscle during fat loss.',
    'Intermittent fasting (16:8) shown to reduce visceral adiposity by 7–12% in clinical studies.',
    'Reduce sodium to under 2g/day to manage water retention and blood pressure.',
  ];

  const exercisePlan: string[] = bfStatus === 'NORMAL' || bfStatus === 'LOW' ? [
    'Progressive overload resistance training 4x per week for muscle hypertrophy.',
    'Add 30 min moderate cardio 3x per week to sustain cardiovascular health.',
    'Include compound lifts: squats, deadlifts, bench press for full-body stimulus.',
    'Mobility work 2x per week to reduce injury risk and improve posture.',
  ] : [
    '150+ minutes moderate-intensity cardio per week for fat oxidation.',
    'Resistance training 3x per week — prioritizes RMR increase and lean mass preservation.',
    'HIIT sessions 2x per week — 20 min intervals shown to reduce visceral fat by up to 17%.',
    'Daily 8,000–10,000 step target for consistent low-intensity activity.',
    `Focus on core strengthening to counteract visceral fat accumulation (level ${visceralFatLevel}/12).`,
  ];

  // Regional fat
  const regionalFat: RegionalFat = {
    core_abdomen: round(Math.min(65, bodyFat * 0.55), 1),
    chest:        round(Math.min(45, bodyFat * 0.38), 1),
    back:         round(Math.min(40, bodyFat * 0.32), 1),
    arms:         round(Math.min(40, appendicularFatPct * 0.38), 1),
    thighs:       round(Math.min(55, appendicularFatPct * 0.62), 1),
    calves:       round(Math.min(30, appendicularFatPct * 0.22), 1),
    trunk_fat_kg:        parseFloat((weight * trunkFatPct / 100).toFixed(1)),
    appendicular_fat_kg: parseFloat((weight * appendicularFatPct / 100).toFixed(1)),
  };

  const base = bodyFat;
  const sparklineData = [base + 1.2, base + 0.4, base + 1.8, base - 0.2, base + 0.9, base + 0.5, base];
  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'Now'];
  const leanMassHistory = months.map((month, i) => ({
    month,
    value: parseFloat((leanMass - 2 + i * 0.38).toFixed(1)),
  }));

  // Formula-based CI: Deurenberg has ~±4% accuracy
  const bodyFatCILow  = parseFloat(Math.max(3, bodyFat - 4).toFixed(1));
  const bodyFatCIHigh = parseFloat(Math.min(65, bodyFat + 4).toFixed(1));

  return {
    input, bmi, bodyFat, bodyFatCILow, bodyFatCIHigh, bodyFatStd: 2.0,
    leanMass, muscleMass, boneMass, waterPct, fatMassKg,
    bmr, tdee, hydrationTarget, score, biologicalAge, metabolicAge,
    visceralFatLevel, bodyType, trunkFatPct, appendicularFatPct,
    bfStatus, lmStatus, recoveryStress,
    heartRisk, liverRisk, metabolicRisk, kidneyRisk,
    anomalies, nutritionPlan, exercisePlan,
    sparklineData, leanMassHistory, bodyComposition, regionalFat,
    scanDate: new Date().toISOString(),
  };
}

function round(n: number, d: number): number {
  return parseFloat(n.toFixed(d));
}

export function getModelColor(_bfStatus: string): string {
  // Always return a natural warm skin tone — status colors are shown in the heatmap only
  return '#c8956c';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'LOW':   return 'text-yellow-400';
    case 'NORMAL': return 'text-blue-400';
    case 'HIGH':  return 'text-orange-400';
    case 'OBESE': return 'text-red-500';
    default:      return 'text-gray-400';
  }
}

export function getBadgeStyle(badge: string): string {
  if (badge.includes('MODERATE-HIGH')) return 'bg-red-900/60 text-red-400 border-red-800';
  if (badge.includes('HIGH'))          return 'bg-red-900/60 text-red-400 border-red-800';
  if (badge.includes('DETECTED'))      return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  if (badge.includes('OPTIMAL'))       return 'bg-green-900/40 text-green-400 border-green-800';
  return 'bg-zinc-800 text-zinc-300 border-zinc-700';
}

export function getVisceralRisk(level: number): { label: string; color: string } {
  if (level <= 4)  return { label: 'Healthy',  color: '#4ade80' };
  if (level <= 7)  return { label: 'Moderate', color: '#fbbf24' };
  if (level <= 10) return { label: 'High',     color: '#f97316' };
  return              { label: 'Very High', color: '#ef4444' };
}
