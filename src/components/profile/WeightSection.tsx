'use client';

import { useState } from 'react';
import { todayLocalISO } from '@/lib/dates';

export default function WeightSection({
  weightLog,
  onLogged,
}: {
  weightLog: { date: string; weightKg: number }[];
  onLogged: () => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('');
  const today = todayLocalISO();

  async function log() {
    const weightKg = parseFloat(value);
    if (!weightKg) return;
    const res = await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, weightKg }),
    }).catch(() => null);
    if (res?.ok) {
      setValue('');
      setStatus('Weight logged — targets updated');
      setTimeout(() => setStatus(''), 2500);
      await onLogged();
    } else {
      setStatus('Save failed — try again');
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Log today&apos;s weight</div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={30}
          max={300}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 84.5"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-50 outline-none focus:border-blue-500"
        />
        <button
          onClick={log}
          disabled={!value}
          className="rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Log
        </button>
      </div>
      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
      {weightLog.length > 0 && (
        <div className="mt-3 divide-y divide-gray-800">
          {weightLog.slice(0, 10).map((e) => (
            <div key={e.date} className="flex justify-between py-2 text-sm">
              <span className="text-gray-400">{e.date === today ? 'Today' : e.date}</span>
              <span className="font-semibold text-gray-50">{e.weightKg} kg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
