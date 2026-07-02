export type Goal = 'fat_loss' | 'maintain' | 'muscle_gain';

export interface Targets {
  caloriesGym: number;
  caloriesRest: number;
  protein: number;
  carbsGymMin: number;
  carbsGymMax: number;
  carbsRestMin: number;
  carbsRestMax: number;
  fatMin: number;
  fatMax: number;
  water: number;
  tdeeGym: number;
  tdeeRest: number;
}

export type OverrideKey =
  | 'caloriesGym' | 'caloriesRest' | 'protein'
  | 'carbsGymMin' | 'carbsGymMax' | 'carbsRestMin' | 'carbsRestMax'
  | 'fatMin' | 'fatMax' | 'water';

export type Overrides = Partial<Record<OverrideKey, number>>;

export const OVERRIDE_KEYS: OverrideKey[] = [
  'caloriesGym', 'caloriesRest', 'protein',
  'carbsGymMin', 'carbsGymMax', 'carbsRestMin', 'carbsRestMax',
  'fatMin', 'fatMax', 'water',
];

export function calcTargets(input: { weightKg: number; goal: Goal }): Targets {
  const { weightKg: w, goal } = input;
  const tdeeGym = Math.round(w * 28.2);
  const tdeeRest = Math.round(w * 24.1);
  const gymAdj = goal === 'fat_loss' ? -450 : goal === 'muscle_gain' ? 300 : 0;
  const restAdj = goal === 'fat_loss' ? -400 : goal === 'muscle_gain' ? 250 : 0;
  const proteinMult = goal === 'muscle_gain' ? 2.2 : 2.0;
  return {
    caloriesGym: tdeeGym + gymAdj,
    caloriesRest: tdeeRest + restAdj,
    protein: Math.round(w * proteinMult),
    carbsGymMin: goal === 'muscle_gain' ? 220 : 180,
    carbsGymMax: goal === 'muscle_gain' ? 280 : 220,
    carbsRestMin: goal === 'muscle_gain' ? 160 : goal === 'maintain' ? 150 : 130,
    carbsRestMax: goal === 'muscle_gain' ? 200 : goal === 'maintain' ? 180 : 160,
    fatMin: goal === 'muscle_gain' ? 65 : 55,
    fatMax: goal === 'muscle_gain' ? 85 : 70,
    water: 2.5,
    tdeeGym,
    tdeeRest,
  };
}

export function applyOverrides(t: Targets, o: Overrides): Targets {
  const out = { ...t };
  for (const key of OVERRIDE_KEYS) {
    const v = o[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}
