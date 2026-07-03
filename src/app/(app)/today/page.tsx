'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Targets } from '@/lib/targets';
import type { DayLog } from '@/db/queries';
import { sumEntries, type DiaryEntry } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';
import DaySummary from '@/components/today/DaySummary';
import FoodLogger from '@/components/today/FoodLogger';
import EntryList from '@/components/today/EntryList';

export default function TodayPage() {
  const today = todayLocalISO();
  const [targets, setTargets] = useState<Targets | null>(null);
  const [dayLog, setDayLog] = useState<DayLog | null>(null);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [t, d, e] = await Promise.all([
      fetch('/api/targets').then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/day?date=${today}`).then((r) => r.json()),
      fetch(`/api/diary?date=${today}`).then((r) => r.json()),
    ]);
    setTargets(t?.effective ?? null);
    setDayLog(d);
    setEntries(e.entries);
    setLoading(false);
  }, [today]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  async function toggleGymDay(isGymDay: boolean) {
    const updated = await fetch('/api/day', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, isGymDay }),
    }).then((r) => r.json());
    setDayLog(updated);
  }

  async function changeWater(waterL: number) {
    const updated = await fetch('/api/day', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today, waterL }),
    }).then((r) => r.json());
    setDayLog(updated);
  }

  if (loading || !targets || !dayLog) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  const totals = sumEntries(entries);

  return (
    <div className="space-y-5 p-5">
      <h1 className="text-xl font-bold text-gray-50">Today</h1>
      <DaySummary
        totals={totals}
        targets={targets}
        isGymDay={dayLog.isGymDay}
        waterL={dayLog.waterL}
        onToggleGymDay={toggleGymDay}
        onWaterChange={changeWater}
      />
      <FoodLogger onLogged={reload} />
      <EntryList entries={entries} onDeleted={reload} />
    </div>
  );
}
