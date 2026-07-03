import type { Routine } from '@/db/queries';

export default function WeeklyRoutineView({ routine }: { routine: Routine }) {
  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-3 text-sm font-semibold text-gray-50">Weekly Routine</div>
      <div className="space-y-3">
        {routine.days.map((day, i) => (
          <div
            key={day.label + i}
            className={`rounded-lg p-3 ${i === routine.currentDayIndex ? 'border border-blue-700 bg-blue-900/40' : 'bg-gray-800'}`}
          >
            <div className="mb-1 text-sm font-semibold text-gray-200">{day.label}</div>
            <div className="text-xs text-gray-500">
              {day.exercises.map((e) => `${e.name} (${e.sets}×${e.repMin}-${e.repMax})`).join(' · ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
