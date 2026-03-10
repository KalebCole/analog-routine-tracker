import { query, transaction } from './client';
import { config } from '../config';

interface SeedItem {
  id: string;
  name: string;
  type: 'checkbox';
  order: number;
}

function makeItems(names: string[]): SeedItem[] {
  return names.map((name, i) => ({
    id: crypto.randomUUID(),
    name,
    type: 'checkbox' as const,
    order: i,
  }));
}

async function seed() {
  console.log('Seeding database...');

  const morningItems = makeItems([
    'Make my bed',
    'NSDR',
    'Brush teeth',
    'Floss',
    'Mouthwash',
    '100 squats, 50 pushups',
    'Put in contacts',
    'Skin care routine',
    'Take supplements',
    'Drink 35oz water + electrolytes',
    '10 min exercise outside',
    '1 min cold shower',
    'Read 1 page',
    '3 min bullet journal (3 things learned)',
    '2 min gratitude (> 1 person)',
    'Place essentials back on bed',
    'Plan and visualize the day',
  ]);

  const nightItems = makeItems([
    'Set out running clothes',
    'Set out day clothes',
    'Brush teeth',
    'Floss',
    'Mouthwash',
    'Wash face',
  ]);

  await transaction(async (client) => {
    // Upsert morning routine (check if exists by name)
    const existing = await client.query(
      `SELECT id FROM routines WHERE name = $1`,
      ['Morning Routine']
    );

    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO routines (name, items, version) VALUES ($1, $2, 1)`,
        ['Morning Routine', JSON.stringify(morningItems)]
      );
      console.log('Created Morning Routine (17 items)');
    } else {
      console.log('Morning Routine already exists, skipping');
    }

    const existingNight = await client.query(
      `SELECT id FROM routines WHERE name = $1`,
      ['Night Routine']
    );

    if (existingNight.rows.length === 0) {
      await client.query(
        `INSERT INTO routines (name, items, version) VALUES ($1, $2, 1)`,
        ['Night Routine', JSON.stringify(nightItems)]
      );
      console.log('Created Night Routine (6 items)');
    } else {
      console.log('Night Routine already exists, skipping');
    }
  });

  console.log('Seeding complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
