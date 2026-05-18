import { env } from '../../config/env.js';

export const buildSessionCookieOptions = () => ({
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax',
  signed: true,
  path: '/',
  maxAge: env.sessionTtlSeconds * 1000
});
