/**
 * Azure Functions Timer Trigger for Photo Cleanup
 *
 * Runs daily at 3:00 AM UTC to delete expired photos from storage.
 * Replaces the node-cron based job for serverless environments.
 */

import { app, Timer, InvocationContext } from '@azure/functions';
import { runPhotoCleanup } from '../jobs/photo-cleanup';

app.timer('photoCleanup', {
  // Run at 3:00 AM UTC every day
  schedule: '0 0 3 * * *',
  handler: async (timer: Timer, context: InvocationContext): Promise<void> => {
    context.log('Photo cleanup timer trigger started');

    if (timer.isPastDue) {
      context.log('Timer is running late!');
    }

    try {
      const result = await runPhotoCleanup();
      context.log(
        `Photo cleanup completed: ${result.deleted} deleted, ${result.errors} errors out of ${result.checked} checked`
      );
    } catch (error) {
      context.error('Photo cleanup failed:', error);
      throw error;
    }
  },
});
