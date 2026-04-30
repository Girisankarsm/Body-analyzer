/**
 * BodyAnalyzer Python backend client.
 * Connects to FastAPI server at http://localhost:8000
 * which uses MediaPipe + Navy body fat formula + trained MLP.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export interface BackendAnalysisResult {
  body_fat: number;
  lean_mass: number;
  confidence: number;
  source: string;
  fallback_reason?: string;
  measurements: {
    estimated_neck_cm?: number;
    estimated_waist_cm?: number;
    estimated_hip_cm?: number;
    shoulder_width_cm?: number;
    shoulder_hip_ratio?: number;
  };
  regional_distribution: {
    core_abdomen: number;
    chest: number;
    arms: number;
    thighs: number;
    calves: number;
    back: number;
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

/** Check if the backend is reachable */
export async function checkBackend(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Submit image + biometrics to the Python backend for ML analysis */
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
      gender: params.gender,
      age: params.age,
    };

    if (params.imageDataUrl) {
      // Strip data URL prefix
      const b64 = params.imageDataUrl.includes(',')
        ? params.imageDataUrl.split(',')[1]
        : params.imageDataUrl;
      body.image_base64 = b64;
    }

    const res = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    return (await res.json()) as BackendAnalysisResult;
  } catch {
    return null;
  }
}

/** Stream training epochs from the backend */
export async function* streamTraining(n_samples = 12_000): AsyncGenerator<BackendTrainEpoch> {
  const res = await fetch(`${BACKEND_URL}/train/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n_samples }),
  });

  if (!res.ok || !res.body) throw new Error('Training stream unavailable');

  const reader = res.body.getReader();
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
        try {
          yield JSON.parse(line) as BackendTrainEpoch;
        } catch {}
      }
    }
  }
}
