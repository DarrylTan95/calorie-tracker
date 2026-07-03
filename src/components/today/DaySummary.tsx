'use client';

import type { Targets } from '@/lib/targets';
import type { Macros } from '@/lib/food';

const barColor = { protein: '#34d399', carbs: '#fbbf24', fat: '#f472b6' } as const;

function MacroBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  const over = value > max;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[11px] uppercase tracking-wider text-gray-500">
        <span>{label}</span>
        <span className={over ? 'text-red-400' : 'text-gray-200'}>
          {Math.round(value)}g <span className="text-gray-500">/ {Math.round(max)}g</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{ width: `${pct}%`, background: over ? '#f87171' : color }}
        />
      </div>
    </div>
  );
}

export default function DaySummary({
  totals,
  targets,
  isGymDay,
  waterL,
  onToggleGymDay,
  onWaterChange,
}: {
  totals: Macros;
  targets: Targets;
  isGymDay: boolean;
  waterL: number;
  onToggleGymDay: (v: boolean) => void;
  onWaterChange: (v: number) => void;
}) {
  const calorieTarget = isGymDay ? targets.caloriesGym : targets.caloriesRest;
  const carbsMax = isGymDay ? targets.carbsGymMax : targets.carbsRestMax;
  const remaining = calorieTarget - totals.calories;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          onClick={() => onToggleGymDay(true)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${isGymDay ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'}`}
        >
          Gym Day
        </button>
        <button
          onClick={() => onToggleGymDay(false)}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold ${!isGymDay ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'}`}
        >
          Rest Day
        </button>
      </div>

      <div className="rounded-xl border border-blue-900/60 bg-[#0f172a] p-4">
        <div className="mb-4 flex justify-around">
          <div className="text-center">
            <div className={`text-2xl font-extrabold tracking-tight ${totals.calories > calorieTarget ? 'text-red-400' : 'text-blue-400'}`}>
              {Math.round(totals.calories)}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">kcal eaten</div>
          </div>
          <div className="w-px bg-blue-900/60" />
          <div className="text-center">
            <div className={`text-2xl font-extrabold tracking-tight ${remaining < 0 ? 'text-red-400' : 'text-gray-300'}`}>
              {Math.abs(Math.round(remaining))}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">{remaining < 0 ? 'over' : 'left'}</div>
          </div>
          <div className="w-px bg-blue-900/60" />
          <div className="text-center">
            <div className="text-2xl font-extrabold tracking-tight text-gray-300">{calorieTarget}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-gray-500">target</div>
          </div>
        </div>

        <MacroBar label="Protein" value={totals.protein} max={targets.protein} color={barColor.protein} />
        <MacroBar label="Carbs" value={totals.carbs} max={carbsMax} color={barColor.carbs} />
        <MacroBar label="Fat" value={totals.fat} max={targets.fatMax} color={barColor.fat} />

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] uppercase tracking-wider text-gray-500">
            <span>Water</span>
            <span className={waterL >= targets.water ? 'text-emerald-400' : 'text-gray-200'}>
              {waterL}L / {targets.water}L
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onWaterChange(Math.max(0, waterL - 0.25))}
              className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-gray-200"
            >
              −
            </button>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                style={{ width: `${Math.min((waterL / targets.water) * 100, 100)}%` }}
              />
            </div>
            <button
              onClick={() => onWaterChange(waterL + 0.25)}
              className="rounded-lg bg-gray-800 px-3 py-1 text-sm text-gray-200"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
