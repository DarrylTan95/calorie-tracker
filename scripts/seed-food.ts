import { readFileSync } from 'fs';
import { join } from 'path';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { foodItems } from '../src/db/schema';

interface SeedItem {
  name: string;
  portionLabel: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

async function main() {
  const raw = readFileSync(join(__dirname, 'seed-food-data.json'), 'utf-8');
  const items: SeedItem[] = JSON.parse(raw);

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    const existing = await db.select().from(foodItems).where(eq(foodItems.name, item.name));
    if (existing.length > 0) {
      skipped += 1;
      continue;
    }
    await db.insert(foodItems).values({ ...item, isCustom: false, isFavorite: false });
    inserted += 1;
  }

  console.log(`Seed complete: ${inserted} inserted, ${skipped} already present.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
