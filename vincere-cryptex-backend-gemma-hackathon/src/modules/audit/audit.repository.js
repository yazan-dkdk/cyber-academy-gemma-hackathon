import { db } from '../../config/db.js';

export const auditRepository = {
  createLog: async ({ actorUserId, targetUserId, action, metadata }, runner = db) => {
    await runner.query(
      `INSERT INTO audit_logs (actor_user_id, target_user_id, action, metadata)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [actorUserId, targetUserId, action, JSON.stringify(metadata ?? {})]
    );
  }
};
