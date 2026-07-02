'use client';

import { useState } from 'react';
import type { OverrideKey, Overrides } from '@/lib/targets';
import type { TargetsPayload } from '@/app/(app)/profile/page';
import { todayLocalISO } from '@/lib/dates';

const ROWS: { key: OverrideKey; label: string; unit: string }[] = [
  { key: 'caloriesGym', label: 'Calories — Gym day', unit: 'kcal' },
  { key: 'caloriesRest', label: 'Calories — Rest day', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbsGymMax', label: 'Carbs cap — Gym day', unit: 'g' },
  { key: 'carbsRestMax', label: 'Carbs cap — Rest day', unit: 'g' },
  { key: 'fatMax', label: 'Fat cap', unit: 'g' },
  { key: 'water', label: 'Water', unit: 'L' },
];

export default function TargetsTable({
  payload,
  onChanged,
}: {
  payload: TargetsPayload;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<OverrideKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  async function putOverrides(overrides: Overrides) {
    const res = await fetch('/api/targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides, effectiveFrom: todayLocalISO() }),
    }).catch(() => null);
    if (res?.ok) {
      setEditing(null);
      setError('');
      await onChanged();
    } else {
      setError('Save failed — try again');
    }
  }

  function pin(key: OverrideKey) {
    const v = parseFloat(editValue);
    if (!v || v <= 0) return;
    void putOverrides({ ...payload.overrides, [key]: v });
  }

  function unpin(key: OverrideKey) {
    const next = { ...payload.overrides };
    delete next[key];
    void putOverrides(next);
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-1 text-sm font-semibold text-gray-50">Current Targets</div>
      <p className="mb-2 text-[11px] text-gray-500">
        Tap a value to pin your own number. Pinned targets survive recalculation until unpinned.
      </p>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      <div className="divide-y divide-gray-800">
        {ROWS.map(({ key, label, unit }) => {
          const pinned = payload.overrides[key] !== undefined;
          const effective = payload.effective[key];
          const calculated = payload.calculated[key];
          return (
            <div key={key} className="flex items-center justify-between py-2.5">
              <span className="text-[13px] text-gray-400">
                {label}
                {pinned && (
                  <span className="ml-2 rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-bold text-amber-400">
                    PINNED
                  </span>
                )}
              </span>
              {editing === key ? (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-20 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right text-[13px] text-gray-50 outline-none focus:border-blue-500"
                  />
                  <button onClick={() => pin(key)} className="text-xs font-semibold text-blue-400">Pin</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-gray-500">Cancel</button>
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditing(key); setEditValue(String(effective)); }}
                    className="text-[13px] font-semibold text-gray-200"
                  >
                    {effective} {unit}
                  </button>
                  {pinned && (
                    <button onClick={() => unpin(key)} className="text-[11px] text-gray-500 underline">
                      unpin ({calculated})
                    </button>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
