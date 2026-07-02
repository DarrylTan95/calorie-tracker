import type { Profile } from '@/db/queries';
import type { Targets } from '@/lib/targets';

const GOAL_LABELS = { fat_loss: 'Fat Loss', maintain: 'Maintain', muscle_gain: 'Muscle Gain' } as const;

export default function ProfileStats({ profile, targets }: { profile: Profile; targets: Targets }) {
  const bmi = profile.weightKg / (profile.heightCm / 100) ** 2;
  const bmiLabel = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const stats = [
    { val: `${profile.weightKg}kg`, lbl: 'Weight' },
    { val: bmi.toFixed(1), lbl: bmiLabel },
    { val: `${targets.caloriesGym}`, lbl: 'Gym kcal' },
    { val: `${targets.protein}g`, lbl: 'Protein' },
    { val: GOAL_LABELS[profile.goal], lbl: 'Goal' },
  ];
  return (
    <div className="rounded-xl border border-blue-900/60 bg-[#0f172a] p-4">
      <div className="flex justify-around">
        {stats.map(({ val, lbl }) => (
          <div key={lbl} className="text-center">
            <div className="text-lg font-extrabold tracking-tight text-gray-50">{val}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">{lbl}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
