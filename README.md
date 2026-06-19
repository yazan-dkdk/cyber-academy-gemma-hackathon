# Vincere Cryptex - Cyber Academy Web

Vincere Cryptex is a hackathon-ready cybersecurity learning platform for guided courses, lessons, challenges, student progress tracking, and a hybrid AI Tutor. The tutor runs local Gemma through Ollama first, with a Google AI Studio cloud fallback intended for Gemma-family compatible models when configured.

## Latest Repository Updates Since Submitted Demo

Vincere Cryptex is both a graduation project and a long-term cybersecurity education platform. After the original demo submission, the repository continued receiving stability improvements, bug fixes, and production-readiness enhancements while preserving the same core architecture, AI vision, and user experience demonstrated in the submitted video.

Recent improvements include:

- Hardened Redis-backed session management with HttpOnly cookie authentication and improved session validation.
- Finalized AI Tutor request flow through secure same-origin Next.js API proxies.
- Improved AI Tutor DTO compatibility and request consistency.
- Added the Network Defense Foundations reference learning experience, including real lesson content, local educational media, quizzes, and progression gates.
- Improved lesson UX, video experience, and learning flow.
- Updated challenge realism with domain-based phishing identification.
- Cleaned outdated development artifacts and improved repository setup examples.

These updates represent post-submission bug fixes and production-hardening improvements, not a change in the original project vision or scope.

## Project Vision

Vincere Cryptex started as a graduation project and was intentionally architected as the foundation for a real cybersecurity learning platform.

The current implementation represents the MVP phase: a secure, practical learning experience centered on defensive cybersecurity education, guided lessons, student progress, backend-validated activities, and safe AI-assisted mentoring.

The long-term roadmap includes:

- Advanced Docker-based hands-on labs.
- Full instructor content creation workflows.
- Real subscription and payment integration.
- Certificates and skill verification.
- Gamification and leaderboards.
- Community and collaborative learning features.
- Advanced AI-powered cybersecurity mentoring.

## Highlights

- Cybersecurity course catalog with student enrollment and backend progress tracking.
- Student authentication with email verification and HttpOnly cookie sessions.
- Lesson support for `TEXT`, `VIDEO`, and `HYBRID` content modes.
- AI Tutor embedded inside lessons for contextual learning help.
- Local AI inference through Ollama + Gemma.
- Google AI Studio fallback for Gemma-family compatible hosted model responses.
- Local-first educational inference architecture for classroom and demo environments.
- AI safety guard that refuses requests for flags, malware, exploit payloads, credential theft, and abusive use.
- Backend-backed challenge flag submission with progress, badge, and activity updates.
- Dashboard with activity feed, achievements, and learning momentum.
- Labs are presented as a future isolated Docker-based product capability, with the MVP demo intentionally focused on the course, AI Tutor, challenge, and progress flow.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js |
| Backend | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| Sessions | Redis + HttpOnly cookies |
| AI | Ollama local Gemma + Google AI Studio Gemma-family fallback |

## Repository Structure

```text
.
|-- vincere-cryptex-backend-gemma-hackathon/   # NestJS API, Prisma schema, auth, courses, AI Tutor, challenges
|-- vincere-cryptex-frontend-gemma-hackathon/  # Next.js web app
`-- README.md
```

## Demo Flow

Login -> Dashboard -> Course -> Lesson -> AI Tutor -> Challenge -> Flag Submit -> Badge/Activity -> Labs Preview

## Setup

### Prerequisites

- Node.js and npm
- PostgreSQL
- Redis
- Ollama
- Optional Google AI Studio API key for Gemma-family fallback responses

### 1. Configure environment files

Use the included examples as templates. Do not commit real secrets.

Backend:

```bash
cd vincere-cryptex-backend-gemma-hackathon
cp .env.example .env
```

Frontend:

```bash
cd ../vincere-cryptex-frontend-gemma-hackathon
cp .env.example .env.local
```

Update local values for:

- `DATABASE_URL`
- `REDIS_URL`
- `SESSION_SECRET`
- `FRONTEND_ORIGIN` / `FRONTEND_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `GEMINI_ENABLED`
- `GEMMA_API_KEY` and `GEMMA_MODEL` when using the Google AI Studio Gemma-family fallback

For the default local app flow, the backend runs on `http://localhost:3000` and the frontend runs on `http://localhost:3001`.

### 2. Set up local Gemma with Ollama

GGUF model files are not committed to GitHub. Keep model files outside the repository and reference them from your local Ollama `Modelfile`.

```bash
ollama create gemma-local -f Modelfile
ollama run gemma-local
```

Then set:

```env
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma-local
AI_PROVIDER_PRIORITY=local-first
```

To enable the Google AI Studio Gemma-family fallback, also configure:

```env
GEMINI_ENABLED=true
GEMMA_API_KEY=your_google_ai_studio_key_here
GEMMA_MODEL=your_google_ai_studio_model_here
```

### 3. Install and run the backend

```bash
cd vincere-cryptex-backend-gemma-hackathon
npm install
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:seed
npm run start:dev
```

The backend starts on the port configured by `PORT`, defaulting to `3000`.

### 4. Install and run the frontend

In a separate terminal:

```bash
cd vincere-cryptex-frontend-gemma-hackathon
npm install
npm run dev
```

Open `http://localhost:3001`.

## Security Roadmap (Post-MVP Hardening)

Vincere Cryptex was designed using a defense-in-depth approach, including:

- Redis-backed server-side sessions.
- HttpOnly and Secure cookies.
- Session binding validation.
- Role-based access control (RBAC).
- Admin MFA.
- Rate limiting.
- Server-side challenge and quiz validation.
- AI safety filtering and controlled educational assistance.

As the platform evolves from an academic MVP into a production-ready cybersecurity education product, additional security hardening is planned.

Future security improvements include:

- Implementing a Double-Submit Cookie CSRF protection strategy across Next.js and NestJS boundaries.
- Expanding automated security testing.
- Adding CI/CD security scanning and dependency monitoring.
- Performing broader penetration testing and security audits.

The absence of CSRF tokens in the current MVP is a deliberate scope and timeline decision based on project risk prioritization, not an overlooked security concern.

## Security and Demo Notes

- Real `.env` files, API keys, session secrets, mail credentials, and local model files must stay out of Git.
- Challenge flags are submitted to the backend; the frontend does not act as the source of truth.
- The AI Tutor is designed for defensive, educational support, runs local-first through Ollama + Gemma, and includes request and response safety checks.
- The Labs page is a preview for future isolated Docker labs. It is intentionally marked Coming Soon and should be presented as future product scope rather than the core MVP demo flow.
