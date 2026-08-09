# GuruDroneAI Frontend

Next.js (App Router) UI for GuruDroneAI.

## Setup

```bash
cd frontend
cp ../.env.example .env.local   # or set NEXT_PUBLIC_API_URL manually
npm install
npm run dev
```

App: http://localhost:3000

## Structure

- `/` — landing
- `/studio` — scaffold Create → Generate → Simulate → Command flow
- `src/lib/api.ts` — typed client for the FastAPI backend

Set `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`).
