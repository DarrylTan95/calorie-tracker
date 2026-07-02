'use client';

import { useEffect, useState } from 'react';
import type { Profile } from '@/db/queries';

const GOALS = [
  { value: 'fat_loss', label: 'Fat Loss', desc: 'Calorie deficit · high protein · preserve muscle' },
  { value: 'maintain', label: 'Maintain Weight', desc: 'Eat at TDEE · balanced macros' },
  { value: 'muscle_gain', label: 'Muscle Gain', desc: 'Calorie surplus · high protein · build mass' },
] as const;

const DEFAULT_DRAFT = {
  name: '', weightKg: '85', heightCm: '170', age: '31',
  gender: 'male', goal: 'fat_loss', gymDaysPerWeek: '4', experience: 'intermediate',
};

const inputCls =
  'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-50 outline-none focus:border-blue-500';
const labelCls = 'mb-1.5 block text-[11px] uppercase tracking-wider text-gray-500';

export default function ProfileForm({
  profile,
  onSaved,
}: {
  profile: Profile | null;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(DEFAULT_DRAFT);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (profile) {
      setDraft({
        name: profile.name,
        weightKg: String(profile.weightKg),
        heightCm: String(profile.heightCm),
        age: String(profile.age),
        gender: profile.gender,
        goal: profile.goal,
        gymDaysPerWeek: String(profile.gymDaysPerWeek),
        experience: profile.experience,
      });
    }
  }, [profile]);

  function set<K extends keyof typeof DEFAULT_DRAFT>(key: K, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    const body = {
      name: draft.name,
      weightKg: parseFloat(draft.weightKg),
      heightCm: parseFloat(draft.heightCm),
      age: parseInt(draft.age, 10),
      gender: draft.gender,
      goal: draft.goal,
      gymDaysPerWeek: parseInt(draft.gymDaysPerWeek, 10),
      experience: draft.experience,
    };
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (res?.ok) {
      setStatus('Saved — targets recalculated');
      setTimeout(() => setStatus(''), 2500);
      await onSaved();
    } else {
      const err = res ? (await res.json()).error : 'Network error';
      setStatus(`Save failed: ${err}`);
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">
        {profile ? 'Edit Profile' : 'Set up your profile'}
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Name (optional)</label>
          <input className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Weight (kg)</label>
            <input className={inputCls} type="number" inputMode="decimal" step="0.1" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Height (cm)</label>
            <input className={inputCls} type="number" inputMode="numeric" value={draft.heightCm} onChange={(e) => set('heightCm', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Age</label>
            <input className={inputCls} type="number" inputMode="numeric" value={draft.age} onChange={(e) => set('age', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Gender</label>
            <select className={inputCls} value={draft.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Gym days / week</label>
            <select className={inputCls} value={draft.gymDaysPerWeek} onChange={(e) => set('gymDaysPerWeek', e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}x / week</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Experience</label>
            <select className={inputCls} value={draft.experience} onChange={(e) => set('experience', e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>Goal</label>
          <select className={inputCls} value={draft.goal} onChange={(e) => set('goal', e.target.value)}>
            {GOALS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          <p className="mt-1.5 text-[11px] text-gray-500">
            {GOALS.find((g) => g.value === draft.goal)?.desc}
          </p>
        </div>
        <button onClick={save} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white">
          Save Profile &amp; Recalculate Targets
        </button>
        {status && <p className="text-xs text-emerald-400">{status}</p>}
      </div>
    </div>
  );
}
