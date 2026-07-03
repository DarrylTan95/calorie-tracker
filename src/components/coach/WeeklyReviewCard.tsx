'use client';

import { useState } from 'react';
import type { WeeklyReview } from '@/db/queries';
import { todayLocalISO } from '@/lib/dates';

const RECOMMENDATION_COLOR: Record<string, string> = {
  decrease_calories: 'border-amber-700 bg-amber-900/20 text-amber-300',
  increase_calories: 'border-amber-700 bg-amber-900/20 text-amber-300',
  improve_protein: 'border-amber-700 bg-amber-900/20 text-amber-300',
  on_track: 'border-emerald-700 bg-emerald-900/20 text-emerald-300',
  insufficient_data: 'border-gray-700 bg-gray-800/50 text-gray-400',
};

export default function WeeklyReviewCard({
  review,
  onApplied,
}: {
  review: WeeklyReview;
  onApplied: () => Promise<void>;
}) {
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState('');

  async function apply() {
    setApplying(true);
    const res = await fetch(`/api/reviews/${review.id}/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effectiveFrom: todayLocalISO() }),
    });
    if (res.ok) {
      setStatus('Applied — targets updated');
      await onApplied();
    } else {
      setStatus('Failed to apply — try again');
    }
    setApplying(false);
  }

  const canApply = review.recommendation.calorieAdjustment !== null && !review.applied;

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-1 text-[11px] uppercase tracking-wider text-gray-500">Week of {review.weekStart}</div>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <div className="text-lg font-bold text-gray-50">
            {review.weightTrendPercent === null ? '—' : `${review.weightTrendPercent.toFixed(2)}%/wk`}
          </div>
          <div className="text-[11px] text-gray-500">Weight trend</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-50">{review.calorieAdherencePercent}%</div>
          <div className="text-[11px] text-gray-500">Calorie adherence</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-50">{review.proteinAdherencePercent}%</div>
          <div className="text-[11px] text-gray-500">Protein adherence</div>
        </div>
        <div>
          <div className="text-lg font-bold text-gray-50">{review.workoutsCompleted} / {review.workoutsPlanned}</div>
          <div className="text-[11px] text-gray-500">Workouts</div>
        </div>
      </div>

      <div className={`rounded-lg border p-3 text-sm ${RECOMMENDATION_COLOR[review.recommendation.type]}`}>
        {review.recommendation.message}
      </div>

      {canApply && (
        <button
          onClick={apply}
          disabled={applying}
          className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {applying ? 'Applying…' : `Apply (${review.recommendation.calorieAdjustment! > 0 ? '+' : ''}${review.recommendation.calorieAdjustment} kcal)`}
        </button>
      )}
      {review.applied && <p className="mt-3 text-xs text-gray-500">Applied.</p>}
      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
