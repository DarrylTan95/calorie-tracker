import { describe, it, expect } from 'vitest';
import { calcTargets, applyOverrides } from '@/lib/targets';

describe('calcTargets', () => {
  it('computes fat_loss targets at 85kg (prototype parity)', () => {
    const t = calcTargets({ weightKg: 85, goal: 'fat_loss' });
    expect(t.tdeeGym).toBe(2397); // round(85 * 28.2)
    expect(t.tdeeRest).toBe(2049); // round(85 * 24.1)
    expect(t.caloriesGym).toBe(1947); // tdeeGym - 450
    expect(t.caloriesRest).toBe(1649); // tdeeRest - 400
    expect(t.protein).toBe(170); // 2 g/kg
    expect(t.carbsGymMin).toBe(180);
    expect(t.carbsGymMax).toBe(220);
    expect(t.carbsRestMin).toBe(130);
    expect(t.carbsRestMax).toBe(160);
    expect(t.fatMin).toBe(55);
    expect(t.fatMax).toBe(70);
    expect(t.water).toBe(2.5);
  });

  it('computes muscle_gain targets at 85kg', () => {
    const t = calcTargets({ weightKg: 85, goal: 'muscle_gain' });
    expect(t.caloriesGym).toBe(2697); // tdeeGym + 300
    expect(t.caloriesRest).toBe(2299); // tdeeRest + 250
    expect(t.protein).toBe(187); // round(85 * 2.2)
    expect(t.carbsGymMax).toBe(280);
    expect(t.fatMax).toBe(85);
  });

  it('computes maintain targets at 70kg', () => {
    const t = calcTargets({ weightKg: 70, goal: 'maintain' });
    expect(t.caloriesGym).toBe(t.tdeeGym);
    expect(t.caloriesRest).toBe(t.tdeeRest);
    expect(t.protein).toBe(140);
    expect(t.carbsRestMin).toBe(150);
  });
});

describe('applyOverrides', () => {
  it('pins overridden metrics and leaves the rest calculated', () => {
    const t = calcTargets({ weightKg: 85, goal: 'fat_loss' });
    const out = applyOverrides(t, { caloriesGym: 2100, protein: 180 });
    expect(out.caloriesGym).toBe(2100);
    expect(out.protein).toBe(180);
    expect(out.caloriesRest).toBe(t.caloriesRest);
    expect(out.tdeeGym).toBe(t.tdeeGym);
  });

  it('returns identical targets for empty overrides', () => {
    const t = calcTargets({ weightKg: 85, goal: 'fat_loss' });
    expect(applyOverrides(t, {})).toEqual(t);
  });
});
