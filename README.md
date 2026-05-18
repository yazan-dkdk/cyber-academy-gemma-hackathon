# Vincere Cryptex — Cyber Academy Web

Vincere Cryptex is a hackathon-ready cybersecurity learning platform for guided courses, lessons, challenges, student progress tracking, and a hybrid AI Tutor. The tutor runs local Gemma through Ollama first, with Gemini available as a fallback provider when configured.

## Highlights

- Cybersecurity course catalog with student enrollment and backend progress tracking.
- Student authentication with email verification and HttpOnly cookie sessions.
- Lesson support for `TEXT`, `VIDEO`, and `HYBRID` content modes.
- AI Tutor embedded inside lessons for contextual learning help.
- Local Gemma inference through Ollama.
- Gemini API fallback for hosted model responses.
- AI safety guard that refuses requests for flags, malware, exploit payloads, credential theft, and abusive use.
- Backend-backed challenge flag submission with progress, badge, and activity updates.
- Dashboard with activity feed, achievements, and learning momentum.
- Labs page is presented as **Coming Soon** for future isolated Docker-based labs; labs are not functional in this demo.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js |
| Backend | NestJS |
| Database | PostgreSQL |
| ORM | Prisma |
| Sessions | Redis + HttpOnly cookies |
| AI | Ollama local Gemma + Gemini fallback |

## Repository Structure

```text
.
├── vincere-cryptex-backend-gemma-hackathon/   # NestJS API, Prisma schema, auth, courses, AI Tutor, challenges
├── vincere-cryptex-frontend-gemma-hackathon/  # Next.js web app
└── README.md
```

## Demo Flow

Login → Dashboard → Course → Lesson → AI Tutor → Challenge → Flag Submit → Badge/Activity → Labs Preview

## Setup

### Prerequisites

- Node.js and npm
- PostgreSQL
- Redis
- Ollama
- Optional Gemini API key for fallback responses

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
- `GEMMA_API_KEY` and `GEMMA_MODEL` when using Gemini fallback

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
AI_PROVIDER_PRIORITY=ollama,gemini
```

To enable Gemini fallback, also configure:

```env
GEMINI_ENABLED=true
GEMMA_API_KEY=your_gemini_api_key_here
GEMMA_MODEL=gemini_model_name_here
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

## Security and Demo Notes

- Real `.env` files, API keys, session secrets, mail credentials, and local model files must stay out of Git.
- Challenge flags are submitted to the backend; the frontend does not act as the source of truth.
- The AI Tutor is designed for defensive, educational support and includes request and response safety checks.
- The Labs page is a preview for future isolated Docker labs. It is intentionally marked Coming Soon and should not be presented as functional in this demo.

