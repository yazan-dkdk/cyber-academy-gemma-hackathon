# Backend integration tests

PF-05D uses dedicated Docker services for PostgreSQL and Redis. The backend application is not containerized. Unit tests remain the default `npm test` target and do not require Docker.

## Safety boundary

The integration entry points load `.env.integration` and require all four values below; they never fall back to development services:

```dotenv
NODE_ENV=test
INTEGRATION_TEST=true
DATABASE_URL=postgresql://cyber_academy_integration:integration_test_only@127.0.0.1:55432/cyber_academy_integration_test?schema=public
REDIS_URL=redis://cyber_academy_integration:integration_test_only@127.0.0.1:56379/15
```

These are deliberately public, local, test-only credentials. Copy `.env.integration.example` to the ignored `.env.integration` file before running commands. Existing shell variables take precedence over the file, so an inherited development or production URL is rejected rather than overwritten. Prisma may report that it discovered the backend `.env` file, but the already-validated process URL takes precedence and the live server identity is checked before reset.

Before any database reset, the guard requires the exact loopback host, port, database, user, password, schema, `NODE_ENV`, and integration marker. It then verifies PostgreSQL's dedicated cluster identity over the live connection. Redis requires the exact loopback target, ACL user, password, and database 15; the live connection verifies the ACL identity and selected database. `FLUSHDB` and `FLUSHALL` are disabled. Infrastructure smoke-test cleanup deletes only keys under `integration:pf05d:`; application-level auth cleanup removes only the auth/session key families it creates, after the same live Redis identity check.

## Developer workflow

From `vincere-cryptex-backend-gemma-hackathon`:

```powershell
Copy-Item .env.integration.example .env.integration
npm run integration:up
npm run integration:migrate
npm run test:integration
npm run integration:down
```

`integration:migrate` performs a guarded `prisma migrate reset`, applying the repository's real migrations without seed data. `test:integration` repeats that guarded reset automatically so every run starts from a deterministic schema.

To stop the services and explicitly delete the dedicated PostgreSQL volume and all test data:

```powershell
npm run integration:clean
```

The complete suite verifies all committed migrations, Prisma record create/read/delete, Redis set/get/TTL expiry, namespaced cleanup, repeatability, unsafe-target rejection, and the real HTTP auth/session lifecycle. The runner first compiles the application with its production TypeScript settings so Nest receives the same emitted decorator metadata used by the deployable build. The auth tests use that compiled Nest/Fastify bootstrap with real PostgreSQL and Redis, replacing only the outbound email-delivery boundary so generated one-time tokens can be asserted without SMTP or Resend. The integration runner supplies explicit test-only application settings and disables external AI providers.
