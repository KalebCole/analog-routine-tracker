/**
 * Photo Cleanup Job
 *
 * Scheduled job that runs daily to delete expired photos from storage.
 * Photos are set to expire 30 days after upload to save storage space.
 */

import cron from 'node-cron';
import { query } from '../db/client';
import { storageService } from '../services/storage.service';

interface ExpiredPhoto {
  id: string;
  routine_id: string;
  photo_url: string;
  photo_expires_at: Date;
}

/**
 * Delete a single expired photo
 */
async function deleteExpiredPhoto(photo: ExpiredPhoto): Promise<boolean> {
  try {
    // Extract blob name from URL
    // URL format: https://storage.../photos/routineId/filename.jpg
    // or for mock: http://localhost:3001/files/photos/routineId/filename.jpg
    const urlParts = photo.photo_url.split('/');
    const filename = urlParts[urlParts.length - 1];
    const routineId = urlParts[urlParts.length - 2];
    const blobName = `${routineId}/${filename}`;

    // Delete from storage
    const deleted = await storageService.deleteBlob('photos', blobName);

    if (deleted) {
      // Update database to clear photo references
      await query(
        `UPDATE completed_routines
         SET photo_url = NULL, photo_expires_at = NULL
         WHERE id = $1`,
        [photo.id]
      );

      console.log(`[PhotoCleanup] Deleted expired photo: ${blobName}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`[PhotoCleanup] Failed to delete photo ${photo.id}:`, error);
    return false;
  }
}

/**
 * Run the photo cleanup job
 */
export async function runPhotoCleanup(): Promise<{ checked: number; deleted: number; errors: number }> {
  console.log('[PhotoCleanup] Starting cleanup job...');

  const result = await query<ExpiredPhoto>(
    `SELECT id, routine_id, photo_url, photo_expires_at
     FROM completed_routines
     WHERE photo_url IS NOT NULL
       AND photo_expires_at IS NOT NULL
       AND photo_expires_at < NOW()`
  );

  const expiredPhotos = result.rows;
  console.log(`[PhotoCleanup] Found ${expiredPhotos.length} expired photos`);

  let deleted = 0;
  let errors = 0;

  for (const photo of expiredPhotos) {
    const success = await deleteExpiredPhoto(photo);
    if (success) {
      deleted++;
    } else {
      errors++;
    }
  }

  console.log(`[PhotoCleanup] Completed: ${deleted} deleted, ${errors} errors`);

  return {
    checked: expiredPhotos.length,
    deleted,
    errors,
  };
}

/**
 * Start the photo cleanup cron job
 * Runs every day at 3:00 AM
 */
export function startPhotoCleanupJob(): void {
  // Run at 3:00 AM every day
  const schedule = process.env.PHOTO_CLEANUP_SCHEDULE || '0 3 * * *';

  cron.schedule(schedule, async () => {
    try {
      await runPhotoCleanup();
    } catch (error) {
      console.error('[PhotoCleanup] Job failed:', error);
    }
  });

  console.log(`[PhotoCleanup] Job scheduled with cron: ${schedule}`);
}

/**
 * Manual trigger for cleanup (useful for testing or admin endpoints)
 */
export async function triggerPhotoCleanup(): Promise<{ checked: number; deleted: number; errors: number }> {
  return runPhotoCleanup();
}
