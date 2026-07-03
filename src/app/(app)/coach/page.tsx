'use client';

import { useCallback, useEffect, useState } from 'react';
import type { WeeklyReview } from '@/db/queries';
import { todayLocalISO } from '@/lib/dates';
import WeeklyReviewCard from '@/components/coach/WeeklyReviewCard';

export default function CoachPage() {
  const [review, setReview] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState('');

  const reload = useCallback(async () => {
    const r = await fetch('/api/reviews').then((res) => res.json());
    setReview(r.review);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  async function generate() {
    setGenerating(true);
    setStatus('');
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ today: todayLocalISO() }),
    });
    if (res.ok) {
      await reload();
    } else {
      setStatus('Failed to generate review — try again');
    }
    setGenerating(false);
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-5 p-5">
      <h1 className="text-xl font-bold text-gray-50">Coach</h1>
      <button
        onClick={generate}
        disabled={generating}
        className="w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {generating ? 'Generating…' : "Generate this week's review"}
      </button>
      {status && <p className="text-xs text-red-400">{status}</p>}
      {review && <WeeklyReviewCard review={review} onApplied={reload} />}
    </div>
  );
}
