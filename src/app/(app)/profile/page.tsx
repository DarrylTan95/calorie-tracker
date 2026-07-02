'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Profile } from '@/db/queries';
import type { Overrides, Targets } from '@/lib/targets';
import ProfileStats from '@/components/profile/ProfileStats';
import WeightSection from '@/components/profile/WeightSection';
import ProfileForm from '@/components/profile/ProfileForm';
import TargetsTable from '@/components/profile/TargetsTable';

export interface TargetsPayload {
  calculated: Targets;
  overrides: Overrides;
  effective: Targets;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [targets, setTargets] = useState<TargetsPayload | null>(null);
  const [weightLog, setWeightLog] = useState<{ date: string; weightKg: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [p, t, w] = await Promise.all([
      fetch('/api/profile').then((r) => r.json()),
      fetch('/api/targets').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/weight').then((r) => r.json()),
    ]);
    setProfile(p.profile);
    setTargets(t);
    setWeightLog(w.entries);
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="p-5 space-y-5">
      <h1 className="text-xl font-bold text-gray-50">Profile</h1>
      {profile && targets && <ProfileStats profile={profile} targets={targets.effective} />}
      {profile && <WeightSection weightLog={weightLog} onLogged={reload} />}
      <ProfileForm profile={profile} onSaved={reload} />
      {targets && <TargetsTable payload={targets} onChanged={reload} />}
    </div>
  );
}
