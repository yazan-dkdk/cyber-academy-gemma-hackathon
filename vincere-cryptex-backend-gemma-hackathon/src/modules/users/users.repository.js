import { db } from '../../config/db.js';

const USER_ADMIN_SELECT = `
  id,
  email,
  role,
  status,
  email_verified_at,
  last_login_at,
  created_at,
  updated_at
`;

const buildUserFilters = ({ role, status, search }) => {
  const conditions = [];
  const values = [];

  if (role) {
    values.push(role);
    conditions.push(`role = $${values.length}`);
  }

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  if (search) {
    values.push(search);
    conditions.push(`LOWER(email::text) LIKE '%' || LOWER($${values.length}) || '%'`);
  }

  return {
    values,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

export const usersRepository = {
  listUsers: async ({ role, status, search, limit, offset }) => {
    const { values, whereClause } = buildUserFilters({ role, status, search });
    const paginationValues = [...values, limit, offset];
    const limitParam = `$${values.length + 1}`;
    const offsetParam = `$${values.length + 2}`;

    const [rowsResult, countResult] = await Promise.all([
      db.query(
        `SELECT ${USER_ADMIN_SELECT}
         FROM users
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ${limitParam}
         OFFSET ${offsetParam}`,
        paginationValues
      ),
      db.query(
        `SELECT COUNT(*)::INT AS total
         FROM users
         ${whereClause}`,
        values
      )
    ]);

    return {
      users: rowsResult.rows,
      total: countResult.rows[0]?.total ?? 0
    };
  },

  findUserById: async (userId, runner = db) => {
    const result = await runner.query(
      `SELECT ${USER_ADMIN_SELECT}
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [userId]
    );

    return result.rows[0] ?? null;
  },

  findUserByIdForUpdate: async (userId, runner = db) => {
    const result = await runner.query(
      `SELECT ${USER_ADMIN_SELECT}
       FROM users
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [userId]
    );

    return result.rows[0] ?? null;
  },

  updateUserStatus: async (userId, status, runner = db) => {
    const result = await runner.query(
      `UPDATE users
       SET status = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING ${USER_ADMIN_SELECT}`,
      [userId, status]
    );

    return result.rows[0] ?? null;
  },

  updateUserRole: async (userId, role, runner = db) => {
    const result = await runner.query(
      `UPDATE users
       SET role = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING ${USER_ADMIN_SELECT}`,
      [userId, role]
    );

    return result.rows[0] ?? null;
  }
};
