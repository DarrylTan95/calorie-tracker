'use client';

import { MEAL_SLOTS, groupByMealSlot, type DiaryEntry } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';

const SLOT_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

export default function EntryList({
  entries,
  onDeleted,
}: {
  entries: DiaryEntry[];
  onDeleted: () => Promise<void>;
}) {
  const grouped = groupByMealSlot(entries);

  async function handleDelete(id: number) {
    const res = await fetch(`/api/diary/${id}?date=${todayLocalISO()}`, { method: 'DELETE' });
    if (res.ok) await onDeleted();
  }

  const hasAny = entries.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {MEAL_SLOTS.filter((slot) => grouped[slot].length > 0).map((slot) => (
        <div key={slot}>
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-gray-500">{SLOT_LABELS[slot]}</div>
          <div className="space-y-1.5">
            {grouped[slot].map((entry) => (
              <div key={entry.id} className="flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-200">{entry.name}</div>
                  {entry.portionMultiplier !== 1 && (
                    <div className="text-[11px] text-gray-500">×{entry.portionMultiplier} portion</div>
                  )}
                </div>
                <div className="flex flex-shrink-0 gap-2.5 text-xs text-gray-400">
                  <span className="font-semibold text-gray-50">{Math.round(entry.calories)}</span>
                  <span>{Math.round(entry.protein)}p</span>
                  <span>{Math.round(entry.carbs)}c</span>
                  <span>{Math.round(entry.fat)}f</span>
                </div>
                <button onClick={() => handleDelete(entry.id)} className="flex-shrink-0 px-1 text-gray-600">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
