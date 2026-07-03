'use client';

import { useState } from 'react';
import type { Profile } from '@/db/queries';

const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-50 outline-none focus:border-blue-500';
const labelCls = 'mb-1.5 block text-[11px] uppercase tracking-wider text-gray-500';

export default function RoutineBuilder({
  profile,
  onBuilt,
}: {
  profile: Profile | null;
  onBuilt: () => Promise<void>;
}) {
  const [goal, setGoal] = useState(profile?.goal ?? 'fat_loss');
  const [daysPerWeek, setDaysPerWeek] = useState(String(profile?.gymDaysPerWeek ?? 4));
  const [experience, setExperience] = useState(profile?.experience ?? 'intermediate');
  const [status, setStatus] = useState('');

  async function build() {
    const res = await fetch('/api/routine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal, daysPerWeek: parseInt(daysPerWeek, 10), experience }),
    });
    if (res.ok) {
      setStatus('');
      await onBuilt();
    } else {
      setStatus('Failed to build routine — try again');
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">Build your routine</div>
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Goal</label>
          <select className={inputCls} value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}>
            <option value="fat_loss">Fat Loss</option>
            <option value="maintain">Maintain</option>
            <option value="muscle_gain">Muscle Gain</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Days / week</label>
          <select className={inputCls} value={daysPerWeek} onChange={(e) => setDaysPerWeek(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}x / week</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Experience</label>
          <select className={inputCls} value={experience} onChange={(e) => setExperience(e.target.value as typeof experience)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <button onClick={build} className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white">
          Build Routine
        </button>
        {status && <p className="text-xs text-red-400">{status}</p>}
      </div>
    </div>
  );
}
