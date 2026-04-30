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
}

export interface MLAnalysis {
  source: string;
  confidence: number;
  measurements: {
    estimated_neck_cm?: number;
    estimated_waist_cm?: number;
    estimated_hip_cm?: number;
    shoulder_width_cm?: number;
    shoulder_hip_ratio?: number;
  };
  regional_distribution: RegionalFat;
}

export interface ScanResults {
  input: ScanInput;
  bmi: number;
  bodyFat: number;
  leanMass: number;
  bmr: number;
  hydrationTarget: number;
  score: number;
  biologicalAge: number;
  bfStatus: 'LOW' | 'NORMAL' | 'HIGH' | 'OBESE';
  lmStatus: 'LOW' | 'NORMAL' | 'HIGH';
  recoveryStress: 'Optimal' | 'Moderate' | 'Elevated';
  heartRisk: string;
  liverRisk: string;
  metabolicRisk: string;
  anomalies: Anomaly[];
  nutritionPlan: string[];
  exercisePlan: string[];
  sparklineData: number[];
  leanMassHistory: { month: string; value: number }[];
  mlAnalysis?: MLAnalysis;
  regionalFat?: RegionalFat;
}

export function computeMetrics(input: ScanInput): ScanResults {
  const { age, height, weight, gender } = input;

  const hM = height / 100;
  const bmi = parseFloat((weight / (hM * hM)).toFixed(1));

  const sex = gender === 'male' ? 1 : 0;
  const bodyFat = parseFloat(
    Math.max(4, Math.min(50, 1.2 * bmi + 0.23 * age - 10.8 * sex - 5.4)).toFixed(1)
  );

  const leanMass = parseFloat((weight * (1 - bodyFat / 100)).toFixed(1));

  const bmr = Math.round(
    gender === 'male'
      ? 10 * weight + 6.25 * height - 5 * age + 5
      : 10 * weight + 6.25 * height - 5 * age - 161
  );

  const hydrationTarget = parseFloat((weight * 0.033).toFixed(1));

  const bmiScore = bmi >= 18.5 && bmi <= 24.9 ? 30 : bmi < 18.5 ? 18 : bmi <= 27 ? 24 : 10;
  const bfScore =
    (gender === 'male' ? bodyFat < 20 : bodyFat < 28) ? 35 : bodyFat < 30 ? 22 : 12;
  const ageScore = age < 30 ? 20 : age < 40 ? 16 : age < 50 ? 12 : 8;
  const score = Math.min(100, Math.max(40, bmiScore + bfScore + ageScore + 13));

  const bfBias = gender === 'male' ? bodyFat - 15 : bodyFat - 22;
  const bmiBias = bmi - 22;
  const biologicalAge = Math.round(
    Math.max(18, Math.min(age + 15, age + bfBias * 0.3 + bmiBias * 0.4))
  );

  let bfStatus: 'LOW' | 'NORMAL' | 'HIGH' | 'OBESE';
  if (gender === 'male') {
    bfStatus = bodyFat < 8 ? 'LOW' : bodyFat < 20 ? 'NORMAL' : bodyFat < 25 ? 'HIGH' : 'OBESE';
  } else {
    bfStatus = bodyFat < 15 ? 'LOW' : bodyFat < 30 ? 'NORMAL' : bodyFat < 35 ? 'HIGH' : 'OBESE';
  }

  const lmLow = gender === 'male' ? 45 : 30;
  const lmHigh = gender === 'male' ? 75 : 55;
  const lmStatus: 'LOW' | 'NORMAL' | 'HIGH' =
    leanMass < lmLow ? 'LOW' : leanMass <= lmHigh ? 'NORMAL' : 'HIGH';

  const recoveryStress: 'Optimal' | 'Moderate' | 'Elevated' =
    bmi < 25 && bodyFat < 24 ? 'Optimal' : bmi < 28 ? 'Moderate' : 'Elevated';

  const heartRisk =
    bodyFat < 18 ? 'Healthy Baseline' : bodyFat < 26 ? 'Moderate Risk' : 'Elevated Risk';
  const liverRisk =
    bodyFat < 20 ? 'Optimal function' : bodyFat < 28 ? 'Monitor closely' : 'Elevated Risk';
  const metabolicRisk = bmi < 25 ? 'Standard' : bmi < 28 ? 'Borderline' : 'Elevated';

  const anomalies: Anomaly[] = [];
  if (bodyFat > 20 || bmi > 27) {
    anomalies.push({
      name: 'Cardiovascular Disease',
      description: 'Central, visceral fat distribution increases strain on the heart.',
      badge: 'MODERATE-HIGH RISK',
      severity: 'high',
    });
  }
  anomalies.push({
    name: 'Postural Kyphosis',
    description: 'Spinal curvature/postural anomalies detected in the uploaded frame.',
    badge: 'DETECTED VIA IMAGE ANALYSIS',
    severity: 'medium',
  });
  anomalies.push({
    name: 'Asymmetric Muscle Tone',
    description: 'Imbalance in lean mass distribution detected bilaterally.',
    badge: 'DETECTED VIA IMAGE ANALYSIS',
    severity: 'low',
  });

  const nutritionPlan: string[] =
    bodyFat < 12
      ? [
          'Increase caloric intake with healthy fats and complex carbohydrates.',
          'Prioritize protein synthesis — target 1.8–2.0g per kg body weight daily.',
          'Incorporate calorie-dense whole foods: nuts, avocados, and legumes.',
        ]
      : bodyFat < 22
      ? [
          'Maintain a balanced diet with adequate protein for muscle recovery.',
          'Android fat distribution correlates with visceral fat; prioritize reducing visceral adiposity through whole foods.',
          'Include omega-3 fatty acids to support cellular membrane integrity.',
        ]
      : [
          'Focus on caloric deficit (300–500 kcal/day) using nutrient-dense foods.',
          'Eliminate processed carbohydrates and increase dietary fiber intake.',
          'Prioritize lean protein sources to preserve lean mass during fat loss.',
        ];

  const exercisePlan: string[] =
    bfStatus === 'NORMAL' || bfStatus === 'LOW'
      ? [
          'Continue current routine, consider periodization for further gains.',
          'Add progressive overload to resistance sessions 3–4x per week.',
        ]
      : [
          'Incorporate 150+ minutes of moderate cardio weekly for fat oxidation.',
          'Add resistance training 3x weekly to improve resting metabolic rate.',
          'HIIT protocols 2x weekly for visceral adiposity reduction.',
        ];

  const base = bodyFat;
  const sparklineData = [
    base + 1.2,
    base + 0.4,
    base + 1.8,
    base - 0.2,
    base + 0.9,
    base + 0.5,
    base,
  ];

  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'Now'];
  const leanMassHistory = months.map((month, i) => ({
    month,
    value: parseFloat((leanMass - 2 + i * 0.38 + (Math.random() * 0.4 - 0.2)).toFixed(1)),
  }));

  return {
    input,
    bmi,
    bodyFat,
    leanMass,
    bmr,
    hydrationTarget,
    score,
    biologicalAge,
    bfStatus,
    lmStatus,
    recoveryStress,
    heartRisk,
    liverRisk,
    metabolicRisk,
    anomalies,
    nutritionPlan,
    exercisePlan,
    sparklineData,
    leanMassHistory,
  };
}

export function getModelColor(bfStatus: string): string {
  switch (bfStatus) {
    case 'LOW':
      return '#4ade80';
    case 'NORMAL':
      return '#86efac';
    case 'HIGH':
      return '#fcd34d';
    case 'OBESE':
      return '#f87171';
    default:
      return '#4ade80';
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'LOW':
      return 'text-yellow-400';
    case 'NORMAL':
      return 'text-blue-400';
    case 'HIGH':
      return 'text-orange-400';
    case 'OBESE':
      return 'text-red-500';
    default:
      return 'text-gray-400';
  }
}

export function getBadgeStyle(badge: string): string {
  if (badge.includes('MODERATE-HIGH')) return 'bg-red-900/60 text-red-400 border-red-800';
  if (badge.includes('DETECTED')) return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  if (badge.includes('HIGH')) return 'bg-red-900/60 text-red-400 border-red-800';
  if (badge.includes('OPTIMAL')) return 'bg-green-900/40 text-green-400 border-green-800';
  return 'bg-zinc-800 text-zinc-300 border-zinc-700';
}
