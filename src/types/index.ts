/**
 * Shared TypeScript types for BodyAnalyzer.
 * Import from '@/types' throughout the app.
 */

export type Gender     = 'male' | 'female';
export type BFStatus   = 'LOW' | 'NORMAL' | 'HIGH' | 'OBESE';
export type LMStatus   = 'LOW' | 'NORMAL' | 'HIGH';
export type RecoveryStatus = 'Optimal' | 'Moderate' | 'Elevated';
export type Severity   = 'low' | 'medium' | 'high';

export interface UserProfile {
  name:   string;
  email:  string;
  image?: string;
}

export interface MorphScales {
  torso: number;
  belly: number;
  chest: number;
  hips:  number;
  arms:  number;
  legs:  number;
}

export interface HeatmapRegions {
  abdomen: number;
  chest:   number;
  back:    number;
  arms:    number;
  thighs:  number;
  calves:  number;
}

export interface MorphTargets {
  morph_scales:    MorphScales;
  heatmap:         HeatmapRegions;
  overall_fatness: number;
}

export interface RegionalFat {
  core_abdomen:         number;
  chest:                number;
  arms:                 number;
  thighs:               number;
  calves:               number;
  back:                 number;
  trunk_fat_kg?:        number;
  appendicular_fat_kg?: number;
}

export interface BodyComposition {
  fat_mass_kg:    number;
  lean_mass_kg:   number;
  muscle_mass_kg: number;
  bone_mass_kg:   number;
  water_liters:   number;
  water_pct:      number;
  fat_pct:        number;
  lean_pct:       number;
}

export interface Anomaly {
  name:        string;
  description: string;
  badge:       string;
  severity:    Severity;
}
