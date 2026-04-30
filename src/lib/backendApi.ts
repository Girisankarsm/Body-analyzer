/**
 * BodyAnalyzer Python backend client.
 * Connects to FastAPI server at http://localhost:8000
 * which uses OpenCV + Navy body fat formula + Ensemble ML (MLP + GradientBoosting + ExtraTrees).
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export interface BackendBodyComposition {
  fat_mass_kg: number;
  lean_mass_kg: number;
  muscle_mass_kg: number;
  bone_mass_kg: number;
  water_liters: number;
  water_pct: number;
  fat_pct: number;
  lean_pct: number;
}

export interface BackendAnalysisResult {
  body_fat: number;
  lean_mass: number;
  confidence: number;
  source: string;
  fallback_reason?: string;
  trunk_fat_pct: number;
  appendicular_fat_pct: number;
  visceral_fat_level: number;
  metabolic_age: number;
  body_type: string;
  body_composition: BackendBodyComposition;
  measurements: {
    estimated_neck_cm?: number;
    estimated_waist_cm?: number;
    estimated_hip_cm?: number;
  };
  regional_distribution: {
    core_abdomen: number;
    chest: number;
    arms: number;
    thighs: number;
    calves: number;
    back: number;
    trunk_fat_kg?: number;
    appendicular_fat_kg?: number;
  };
}

export interface BackendTrainEpoch {
  type: 'start' | 'log' | 'epoch' | 'complete';
  epoch?: number;
  total?: number;
  loss?: number;
  message?: string;
  mae?: number;
  train_samples?: number;
}

export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function analyzeBody(params: {
  imageDataUrl: string | null;
  height_cm: number;
  weight_kg: number;
  gender: string;
  age: number;
}): Promise<BackendAnalysisResult | null> {
  try {
    const body: Record<string, unknown> = {
      height_cm: params.height_cm,
      weight_kg: params.weight_kg,
      gender:    params.gender,
      age:       params.age,
    };
    if (params.imageDataUrl) {
      const b64 = params.imageDataUrl.includes(',')
        ? params.imageDataUrl.split(',')[1]
        : params.imageDataUrl;
      body.image_base64 = b64;
    }
    const res = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return (await res.json()) as BackendAnalysisResult;
  } catch {
    return null;
  }
}

export async function* streamTraining(n_samples = 20_000): AsyncGenerator<BackendTrainEpoch> {
  const res = await fetch(`${BACKEND_URL}/train/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n_samples }),
  });
  if (!res.ok || !res.body) throw new Error('Training stream unavailable');
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim()) {
        try { yield JSON.parse(line) as BackendTrainEpoch; } catch {}
      }
    }
  }
}
