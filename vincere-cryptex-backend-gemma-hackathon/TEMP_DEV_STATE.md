# Temporary Development State

This project is currently in a temporary development state so the backend can boot and the frontend dashboard can open while the real Redis-backed auth/session flow is being repaired.

## Temporarily Changed Files

- `src/auth/auth.controller.ts`
- `src/auth/auth.module.ts`
- `src/session/session.module.ts`
- `src/common/guards/authenticated.guard.ts`
- `src/challenges/challenges.module.ts`
- `src/courses/courses.module.ts`
- `src/labs/labs.module.ts`
- `src/quizzes/quizzes.module.ts`
- `src/users/users.module.ts`

## Temporary Behavior

- `GET /api/auth/me` is public for now.
- `GET /api/auth/me` does not use `AuthenticatedGuard` right now.
- `GET /api/auth/me` returns a mock authenticated response:
  - `authenticated: true`
  - `user.id: dev-user`
  - `user.email: dev@local.test`
  - `user.role: STUDENT`
  - `data.session.id: dev-session`
- The frontend dashboard currently depends on this mock response shape to avoid showing `Session validation stalled`.
- Redis-backed/session-backed auth is not fully restored yet.

## Mocked Parts

- The authenticated user returned from `GET /api/auth/me` is mocked.
- The session returned from `GET /api/auth/me` is mocked.
- The response does not validate a signed session cookie.
- The response does not read session state from Redis.
- The response does not hydrate or validate user auth state from the database or Redis cache.

## Disabled Or Bypassed Parts

- `AuthenticatedGuard` is bypassed only for `GET /api/auth/me`.
- `SessionModule` currently does not import `RedisModule`.
- `AuthModule` currently does not import `RedisModule`.
- Session validation for the dashboard is temporarily bypassed.
- Guard/session logic was relaxed or bypassed to keep the backend bootable while Redis/session infrastructure is repaired.

## Production Restoration Notes

For production-ready auth/session, restore the real flow so `GET /api/auth/me` validates the signed session cookie, loads the Redis-backed session, hydrates or checks the current user auth state, refreshes the session as needed, and returns the real current user/session response.

`SessionService` must be able to inject all required dependencies, including `RedisService` and `AppConfigService`. `SessionModule` should provide and export `SessionService`, and it should import the module that exports `RedisService` once Redis is ready again.

The module that uses `AuthenticatedGuard` must have access to the modules exporting `AuthStateService` and `SessionService`.

The frontend should stop relying on the development mock user once the real session response is restored.

## Restore Real Auth Session Flow

- [ ] Restore Redis startup/configuration so `RedisService` can connect reliably.
- [ ] Re-add `RedisModule` to the module graph where Redis-backed services require it.
- [ ] Confirm `SessionModule` imports the module that exports `RedisService`.
- [ ] Confirm `SessionModule` provides and exports `SessionService`.
- [ ] Confirm `AuthModule` imports `SessionModule` and has access to Redis-backed auth state dependencies.
- [ ] Restore `AuthenticatedGuard` on `GET /api/auth/me`.
- [ ] Restore `GET /api/auth/me` to call the real current-user/session service path instead of returning the mock `dev-user`.
- [ ] Verify expired, missing, invalid, and valid sessions return the expected frontend-safe responses.
- [ ] Verify login, logout, MFA setup, MFA verify, and protected dashboard endpoints against the real session store.
- [ ] Remove this temporary note after the real auth/session flow is restored and verified.
