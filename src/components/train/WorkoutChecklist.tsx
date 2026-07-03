'use client';

import { useEffect, useState } from 'react';
import type { Routine } from '@/db/queries';
import { todayLocalISO } from '@/lib/dates';

interface SetRow {
  reps: string;
  weightKg: string;
}

const inputCls = 'w-16 rounded border border-gray-700 bg-gray-800 px-2 py-1 text-right text-sm text-gray-50 outline-none focus:border-blue-500';

export default function WorkoutChecklist({
  routine,
  onLogged,
}: {
  routine: Routine;
  onLogged: () => Promise<void>;
}) {
  const day = routine.days[routine.currentDayIndex];
  const [rows, setRows] = useState<Record<string, SetRow[]>>({});
  const [status, setStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const initial: Record<string, SetRow[]> = {};
      for (const exercise of day.exercises) {
        const res = await fetch(
          `/api/routine/suggestions?exercise=${encodeURIComponent(exercise.name)}&repMin=${exercise.repMin}&repMax=${exercise.repMax}`,
        ).then((r) => r.json());
        const suggestion = res.suggestion;
        initial[exercise.name] = Array.from({ length: exercise.sets }, () => ({
          reps: suggestion ? String(suggestion.reps) : '',
          weightKg: suggestion ? String(suggestion.weightKg) : '',
        }));
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRows(initial);
    })();
  }, [day]);

  function updateSet(exerciseName: string, index: number, field: keyof SetRow, value: string) {
    setRows((prev) => {
      const next = { ...prev, [exerciseName]: [...(prev[exerciseName] ?? [])] };
      next[exerciseName][index] = { ...next[exerciseName][index], [field]: value };
      return next;
    });
  }

  async function submit() {
    setSubmitting(true);
    const sets = day.exercises.flatMap((exercise) =>
      (rows[exercise.name] ?? []).map((row, i) => ({
        exerciseName: exercise.name,
        setNumber: i + 1,
        reps: parseInt(row.reps, 10) || 0,
        weightKg: parseFloat(row.weightKg) || 0,
      })),
    );
    const res = await fetch('/api/workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: todayLocalISO(), routineDayLabel: day.label, sets }),
    });
    if (res.ok) {
      setStatus('Workout logged!');
      await onLogged();
    } else {
      setStatus('Failed to log workout — try again');
    }
    setSubmitting(false);
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">Today: {day.label}</div>
      <div className="space-y-4">
        {day.exercises.map((exercise) => (
          <div key={exercise.name}>
            <div className="mb-1.5 text-sm text-gray-200">
              {exercise.name}{' '}
              <span className="text-xs text-gray-500">({exercise.repMin}-{exercise.repMax} reps)</span>
            </div>
            <div className="space-y-1.5">
              {(rows[exercise.name] ?? []).map((row, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="w-10">Set {i + 1}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={row.reps}
                    onChange={(e) => updateSet(exercise.name, i, 'reps', e.target.value)}
                    placeholder="reps"
                    className={inputCls}
                  />
                  <span>×</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    value={row.weightKg}
                    onChange={(e) => updateSet(exercise.name, i, 'weightKg', e.target.value)}
                    placeholder="kg"
                    className={inputCls}
                  />
                  <span>kg</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={submit}
        disabled={submitting}
        className="mt-4 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? 'Logging…' : 'Log Workout'}
      </button>
      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
