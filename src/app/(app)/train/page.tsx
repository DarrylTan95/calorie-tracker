'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile, Routine } from '@/db/queries';
import RoutineBuilder from '@/components/train/RoutineBuilder';
import WeeklyRoutineView from '@/components/train/WeeklyRoutineView';
import WorkoutChecklist from '@/components/train/WorkoutChecklist';

export default function TrainPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const reload = useCallback(async () => {
    const [p, r] = await Promise.all([
      fetch('/api/profile').then((res) => res.json()),
      fetch('/api/routine').then((res) => res.json()),
    ]);
    setProfile(p.profile);
    setRoutine(r.routine);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-5 p-5">
      <h1 className="text-xl font-bold text-gray-50">Train</h1>
      {routine && !rebuilding ? (
        <>
          <WorkoutChecklist routine={routine} onLogged={reload} />
          <WeeklyRoutineView routine={routine} />
          <button onClick={() => setRebuilding(true)} className="text-xs text-gray-500 underline">
            Rebuild routine
          </button>
        </>
      ) : (
        <RoutineBuilder profile={profile} onBuilt={async () => { setRebuilding(false); await reload(); }} />
      )}
    </div>
  );
}
