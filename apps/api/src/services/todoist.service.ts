/**
 * Todoist Service
 *
 * Handles integration with Todoist for inventory alerts.
 * Creates tasks when paper inventory runs low for a routine.
 */

import { query } from '../db/client';

interface TodoistTask {
  content: string;
  description?: string;
  due_string?: string;
  priority?: 1 | 2 | 3 | 4;
  labels?: string[];
}

interface TodoistResponse {
  id: string;
  content: string;
  description: string;
  is_completed: boolean;
  created_at: string;
  url: string;
}

class TodoistService {
  private apiToken: string | null;
  private baseUrl = 'https://api.todoist.com/rest/v2';
  private appBaseUrl: string;

  constructor() {
    this.apiToken = process.env.TODOIST_API_TOKEN || null;
    this.appBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
  }

  /**
   * Check if Todoist integration is configured
   */
  isConfigured(): boolean {
    return this.apiToken !== null && this.apiToken.length > 0;
  }

  /**
   * Create a task in Todoist
   */
  private async createTask(task: TodoistTask): Promise<TodoistResponse | null> {
    if (!this.isConfigured()) {
      console.log('[Todoist] Not configured, skipping task creation');
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('[Todoist] API error:', response.status, error);
        return null;
      }

      return response.json() as Promise<TodoistResponse>;
    } catch (error) {
      // Silent fail - Todoist alerts are non-critical
      console.error('[Todoist] Failed to create task:', error);
      return null;
    }
  }

  /**
   * Check if we should send an alert for this routine
   * Returns true if:
   * - Remaining inventory <= threshold
   * - No alert has been sent in the last 24 hours
   */
  async shouldAlert(routineId: string): Promise<{ should: boolean; remaining: number; threshold: number }> {
    const result = await query<{
      printed_count: number;
      uploaded_count: number;
      alert_threshold: number;
      last_alert_sent_at: Date | null;
    }>(
      `SELECT printed_count, uploaded_count, alert_threshold, last_alert_sent_at
       FROM paper_inventory
       WHERE routine_id = $1`,
      [routineId]
    );

    if (result.rows.length === 0) {
      return { should: false, remaining: 0, threshold: 5 };
    }

    const inventory = result.rows[0];
    const remaining = inventory.printed_count - inventory.uploaded_count;
    const threshold = inventory.alert_threshold;

    // Check if remaining is at or below threshold
    if (remaining > threshold) {
      return { should: false, remaining, threshold };
    }

    // Check if we've already alerted in the last 24 hours
    if (inventory.last_alert_sent_at) {
      const lastAlert = new Date(inventory.last_alert_sent_at);
      const hoursSinceLastAlert = (Date.now() - lastAlert.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastAlert < 24) {
        return { should: false, remaining, threshold };
      }
    }

    return { should: true, remaining, threshold };
  }

  /**
   * Send an inventory alert for a routine
   */
  async sendInventoryAlert(routineId: string, routineName: string): Promise<boolean> {
    const { should, remaining, threshold } = await this.shouldAlert(routineId);

    if (!should) {
      return false;
    }

    // Generate deep link to print page
    const printUrl = `${this.appBaseUrl}/routines/${routineId}/print`;

    const task: TodoistTask = {
      content: `Print more "${routineName}" routine cards`,
      description: `Only ${remaining} card${remaining !== 1 ? 's' : ''} remaining (threshold: ${threshold}).\n\nPrint more: ${printUrl}`,
      priority: remaining === 0 ? 4 : 3, // P1 if completely out, P2 otherwise
      labels: ['routine-tracker', 'print'],
    };

    const result = await this.createTask(task);

    if (result) {
      // Update last_alert_sent_at
      await query(
        `UPDATE paper_inventory
         SET last_alert_sent_at = NOW()
         WHERE routine_id = $1`,
        [routineId]
      );

      console.log(`[Todoist] Created alert task for routine "${routineName}" (${remaining} remaining)`);
      return true;
    }

    return false;
  }

  /**
   * Check and send alerts for all routines that need restocking
   * This can be called periodically or after each upload
   */
  async checkAllInventory(): Promise<{ checked: number; alerted: number }> {
    const result = await query<{
      routine_id: string;
      routine_name: string;
      printed_count: number;
      uploaded_count: number;
      alert_threshold: number;
      last_alert_sent_at: Date | null;
    }>(
      `SELECT
        pi.routine_id,
        r.name as routine_name,
        pi.printed_count,
        pi.uploaded_count,
        pi.alert_threshold,
        pi.last_alert_sent_at
       FROM paper_inventory pi
       JOIN routines r ON r.id = pi.routine_id
       WHERE (pi.printed_count - pi.uploaded_count) <= pi.alert_threshold`
    );

    let alerted = 0;

    for (const row of result.rows) {
      // Note: remaining is already calculated in the WHERE clause
      // We just need to check the cooldown and send alerts

      // Check 24-hour cooldown
      if (row.last_alert_sent_at) {
        const lastAlert = new Date(row.last_alert_sent_at);
        const hoursSinceLastAlert = (Date.now() - lastAlert.getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastAlert < 24) {
          continue;
        }
      }

      // Send alert
      const success = await this.sendInventoryAlert(row.routine_id, row.routine_name);
      if (success) {
        alerted++;
      }
    }

    return { checked: result.rows.length, alerted };
  }
}

// Export singleton instance
export const todoistService = new TodoistService();
