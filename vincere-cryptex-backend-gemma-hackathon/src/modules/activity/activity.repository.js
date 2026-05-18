import { db } from '../../config/db.js';

export const activityRepository = {
  createLog: async ({ userId, activityType, entityType, entityId, metadata }, runner = db) => {
    await runner.query(
      `INSERT INTO activity_logs (user_id, activity_type, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, activityType, entityType, entityId, JSON.stringify(metadata ?? {})]
    );
  }
};
