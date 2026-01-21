import { PoolClient } from 'pg';
import { query, transaction } from '../db/client';
import { Item, RoutineVersion } from '@analog-routine-tracker/shared';

interface RoutineRow {
  id: string;
  name: string;
  items: Item[];
  version: number;
  created_at: Date;
  modified_at: Date;
}

/**
 * Creates a version snapshot of a routine before it's modified.
 * This allows old printed cards to still be processed correctly.
 */
export async function createVersionSnapshot(
  client: PoolClient,
  routineId: string,
  currentVersion: number,
  currentItems: Item[]
): Promise<RoutineVersion> {
  const result = await client.query<{ id: string; created_at: Date }>(
    `INSERT INTO routine_versions (routine_id, version, items_snapshot)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [routineId, currentVersion, JSON.stringify(currentItems)]
  );

  return {
    id: result.rows[0].id,
    routineId,
    version: currentVersion,
    itemsSnapshot: currentItems,
    createdAt: result.rows[0].created_at,
  };
}

/**
 * Gets a specific version snapshot of a routine.
 * Used when processing OCR for printed cards with older versions.
 */
export async function getVersionSnapshot(
  routineId: string,
  version: number
): Promise<Item[] | null> {
  const result = await query<{ items_snapshot: Item[] }>(
    `SELECT items_snapshot FROM routine_versions
     WHERE routine_id = $1 AND version = $2`,
    [routineId, version]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0].items_snapshot;
}

/**
 * Gets the current items for a routine, or falls back to a version snapshot.
 * This handles the case where we need items for a specific version.
 */
export async function getItemsForVersion(
  routineId: string,
  version: number
): Promise<Item[] | null> {
  // First, check if this is the current version
  const currentResult = await query<{ items: Item[]; version: number }>(
    `SELECT items, version FROM routines WHERE id = $1`,
    [routineId]
  );

  if (currentResult.rows.length === 0) {
    return null;
  }

  const routine = currentResult.rows[0];

  // If current version matches, return current items
  if (routine.version === version) {
    return routine.items;
  }

  // Otherwise, look up the version snapshot
  return getVersionSnapshot(routineId, version);
}

/**
 * Updates a routine and creates a version snapshot of the previous state.
 * Returns the updated routine.
 */
export async function updateRoutineWithVersioning(
  routineId: string,
  updates: { name?: string; items?: Item[] }
): Promise<RoutineRow | null> {
  return transaction(async (client) => {
    // Get current routine
    const currentResult = await client.query<RoutineRow>(
      `SELECT * FROM routines WHERE id = $1 FOR UPDATE`,
      [routineId]
    );

    if (currentResult.rows.length === 0) {
      return null;
    }

    const current = currentResult.rows[0];

    // If items are being updated, create a version snapshot
    if (updates.items) {
      await createVersionSnapshot(client, routineId, current.version, current.items);
    }

    // Build update query dynamically
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.items !== undefined) {
      setClauses.push(`items = $${paramIndex++}`);
      values.push(JSON.stringify(updates.items));
      setClauses.push(`version = version + 1`);
    }

    if (setClauses.length === 0) {
      return current;
    }

    values.push(routineId);

    const updateResult = await client.query<RoutineRow>(
      `UPDATE routines
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    return updateResult.rows[0];
  });
}

/**
 * Gets all version snapshots for a routine.
 */
export async function getVersionHistory(routineId: string): Promise<RoutineVersion[]> {
  const result = await query<{
    id: string;
    routine_id: string;
    version: number;
    items_snapshot: Item[];
    created_at: Date;
  }>(
    `SELECT id, routine_id, version, items_snapshot, created_at
     FROM routine_versions
     WHERE routine_id = $1
     ORDER BY version DESC`,
    [routineId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    routineId: row.routine_id,
    version: row.version,
    itemsSnapshot: row.items_snapshot,
    createdAt: row.created_at,
  }));
}
