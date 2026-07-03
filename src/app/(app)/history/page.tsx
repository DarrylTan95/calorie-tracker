'use client';

import { useEffect, useState } from 'react';
import type { DiaryEntry, Macros } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';

interface HistoryDay {
  date: string;
  totals: Macros;
  calorieTarget: number;
  isGymDay: boolean;
  waterL: number;
  workoutLabel: string | null;
  weightKg: number | null;
  entries: DiaryEntry[];
}

function badgeClass(pct: number): string {
  if (pct > 105) return 'bg-red-900/60 text-red-300';
  if (pct >= 88) return 'bg-emerald-900/60 text-emerald-300';
  return 'bg-blue-900/60 text-blue-300';
}

export default function HistoryPage() {
  const [days, setDays] = useState<HistoryDay[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/history?today=${todayLocalISO()}&days=14`);
      if (res.ok) {
        const data = await res.json();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDays(data.days);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDays([]);
      }
    })();
  }, []);

  if (days === null) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-3 p-5">
      <h1 className="text-xl font-bold text-gray-50">History</h1>
      {days.map((day) => {
        const pct = day.calorieTarget > 0 ? Math.round((day.totals.calories / day.calorieTarget) * 100) : 0;
        const isOpen = expanded === day.date;
        return (
          <div key={day.date} className="rounded-xl bg-gray-900 p-4">
            <button
              onClick={() => setExpanded(isOpen ? null : day.date)}
              className="flex w-full items-center justify-between text-left"
            >
              <div>
                <div className="text-sm font-semibold text-gray-200">{day.date === todayLocalISO() ? 'Today' : day.date}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {Math.round(day.totals.calories)} kcal · {day.workoutLabel ? `Workout: ${day.workoutLabel}` : day.isGymDay ? 'Gym day' : 'Rest day'}
                  {day.weightKg !== null && ` · ${day.weightKg}kg`}
                </div>
              </div>
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${badgeClass(pct)}`}>{pct}%</span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-1.5 border-t border-gray-800 pt-3">
                {day.entries.length === 0 && <p className="text-xs text-gray-500">No food logged.</p>}
                {day.entries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between text-xs text-gray-400">
                    <span>{entry.name}</span>
                    <span>{Math.round(entry.calories)} kcal</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
