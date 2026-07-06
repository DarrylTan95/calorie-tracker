'use client';

import { useEffect, useState } from 'react';
import type { FoodItem } from '@/db/queries';
import { MEAL_SLOTS, type MealSlot } from '@/lib/food';
import { todayLocalISO } from '@/lib/dates';

const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-50 outline-none focus:border-blue-500';

function defaultMealSlot(): MealSlot {
  const hour = new Date().getHours();
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 21) return 'dinner';
  return 'snacks';
}

export default function FoodLogger({ onLogged }: { onLogged: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);
  const [shortcuts, setShortcuts] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [multiplier, setMultiplier] = useState('1');
  const [mealSlot, setMealSlot] = useState<MealSlot>(defaultMealSlot());
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [status, setStatus] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiItems, setAiItems] = useState<{ name: string; portionLabel: string; calories: number; protein: number; carbs: number; fat: number }[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    fetch('/api/config').then((r) => r.json()).then((c) => setAiEnabled(!!c.aiEnabled));
  }, []);

  useEffect(() => {
    (async () => {
      const [recent, favorite] = await Promise.all([
        fetch('/api/food-items?recent=1').then((r) => r.json()),
        fetch('/api/food-items?favorite=1').then((r) => r.json()),
      ]);
      const seen = new Set<number>();
      const merged: FoodItem[] = [];
      for (const item of [...favorite.items, ...recent.items]) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
      setShortcuts(merged.slice(0, 8));
    })();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/food-items?q=${encodeURIComponent(q)}`).then((r) => r.json());
      setResults(res.items);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function logSelected() {
    if (!selected) return;
    const m = parseFloat(multiplier) || 1;
    const res = await fetch('/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayLocalISO(),
        mealSlot,
        foodItemId: selected.id,
        name: selected.name,
        portionMultiplier: m,
        calories: selected.kcal * m,
        protein: selected.protein * m,
        carbs: selected.carbs * m,
        fat: selected.fat * m,
      }),
    });
    if (res.ok) {
      setSelected(null);
      setQuery('');
      setMultiplier('1');
      setStatus(`Logged ${selected.name}`);
      setTimeout(() => setStatus(''), 2000);
      await onLogged();
    } else {
      setStatus('Log failed — try again');
    }
  }

  async function logManual() {
    const kcal = parseFloat(manual.kcal) || 0;
    const protein = parseFloat(manual.protein) || 0;
    const carbs = parseFloat(manual.carbs) || 0;
    const fat = parseFloat(manual.fat) || 0;
    if (!manual.name.trim() || kcal <= 0) return;

    const item = await fetch('/api/food-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: manual.name.trim(), portionLabel: 'custom', kcal, protein, carbs, fat }),
    }).then((r) => r.json());

    const res = await fetch('/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayLocalISO(),
        mealSlot,
        foodItemId: item.item.id,
        name: item.item.name,
        portionMultiplier: 1,
        calories: kcal,
        protein,
        carbs,
        fat,
      }),
    });
    if (res.ok) {
      setManual({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
      setShowManual(false);
      setStatus(`Logged ${item.item.name}`);
      setTimeout(() => setStatus(''), 2000);
      await onLogged();
    } else {
      setStatus('Log failed — try again');
    }
  }

  async function parseWithAI() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    setAiError('');
    const res = await fetch('/api/ai/parse-food', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: aiText }),
    });
    if (res.ok) {
      const data = await res.json();
      setAiItems(data.items);
    } else {
      setAiError('Could not parse that — try rephrasing or log manually.');
    }
    setAiLoading(false);
  }

  async function logAiItem(item: { name: string; portionLabel: string; calories: number; protein: number; carbs: number; fat: number }) {
    const created = await fetch('/api/food-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name, portionLabel: item.portionLabel,
        kcal: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
      }),
    }).then((r) => r.json());

    const res = await fetch('/api/diary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: todayLocalISO(), mealSlot, foodItemId: created.item.id, name: created.item.name,
        portionMultiplier: 1, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat,
      }),
    });
    if (res.ok) {
      setAiItems((prev) => prev.filter((i) => i !== item));
      await onLogged();
    }
  }

  return (
    <div className="rounded-xl bg-gray-900 p-4">
      <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Log food</div>

      <div className="mb-3 flex gap-1.5">
        {MEAL_SLOTS.map((slot) => (
          <button
            key={slot}
            onClick={() => setMealSlot(slot)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize ${
              mealSlot === slot ? 'bg-blue-700 text-white' : 'bg-gray-800 text-gray-500'
            }`}
          >
            {slot}
          </button>
        ))}
      </div>

      {shortcuts.length > 0 && !query && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {shortcuts.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelected(item); setMultiplier('1'); }}
              className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-300"
            >
              {item.isFavorite ? '★ ' : ''}{item.name}
            </button>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
        placeholder="Search food…"
        className={`${inputCls} mb-2`}
      />

      {results.length > 0 && !selected && (
        <div className="mb-2 divide-y divide-gray-800 rounded-lg border border-gray-800">
          {results.map((item) => (
            <button
              key={item.id}
              onClick={() => { setSelected(item); setMultiplier('1'); setQuery(item.name); }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-200"
            >
              <span>{item.name}</span>
              <span className="text-xs text-gray-500">{item.kcal} kcal / {item.portionLabel}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-gray-800 p-2.5">
          <div className="flex-1 text-sm text-gray-200">{selected.name}</div>
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0.1"
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="w-16 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-right text-sm text-gray-50"
          />
          <span className="text-xs text-gray-500">× portion</span>
          <button onClick={logSelected} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">
            Log
          </button>
        </div>
      )}

      <button onClick={() => setShowManual((s) => !s)} className="text-xs text-gray-500 underline">
        {showManual ? 'Cancel manual entry' : "Can't find it? Enter manually"}
      </button>

      {aiEnabled && (
        <div className="mt-3 rounded-lg bg-gray-800 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-gray-500">Or describe what you ate</div>
          <textarea
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            placeholder="e.g. chicken rice with drumstick, kopi o kosong"
            rows={2}
            className={`${inputCls} resize-none`}
          />
          <button
            onClick={parseWithAI}
            disabled={aiLoading || !aiText.trim()}
            className="mt-2 w-full rounded-lg bg-blue-700 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {aiLoading ? 'Parsing…' : 'Parse with AI'}
          </button>
          {aiError && <p className="mt-2 text-xs text-red-400">{aiError}</p>}
          {aiItems.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {aiItems.map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-gray-900 px-3 py-2">
                  <div>
                    <div className="text-sm text-gray-200">{item.name}</div>
                    <div className="text-[11px] text-gray-500">{item.portionLabel} · {Math.round(item.calories)} kcal</div>
                  </div>
                  <button
                    onClick={() => logAiItem(item)}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Log
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showManual && (
        <div className="mt-2 space-y-2 rounded-lg bg-gray-800 p-3">
          <input
            value={manual.name}
            onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
            placeholder="Food name"
            className={inputCls}
          />
          <div className="grid grid-cols-4 gap-2">
            <input value={manual.kcal} onChange={(e) => setManual((m) => ({ ...m, kcal: e.target.value }))} placeholder="kcal" type="number" className={inputCls} />
            <input value={manual.protein} onChange={(e) => setManual((m) => ({ ...m, protein: e.target.value }))} placeholder="protein" type="number" className={inputCls} />
            <input value={manual.carbs} onChange={(e) => setManual((m) => ({ ...m, carbs: e.target.value }))} placeholder="carbs" type="number" className={inputCls} />
            <input value={manual.fat} onChange={(e) => setManual((m) => ({ ...m, fat: e.target.value }))} placeholder="fat" type="number" className={inputCls} />
          </div>
          <button onClick={logManual} className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white">
            Log Manual Entry
          </button>
        </div>
      )}

      {status && <p className="mt-2 text-xs text-emerald-400">{status}</p>}
    </div>
  );
}
