# GuruDroneAI Frontend

Next.js (App Router) UI for GuruDroneAI — ready for Vercel.

## Local setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

App: http://localhost:3000

## Vercel deployment

### 1. Import the monorepo

1. [vercel.com/new](https://vercel.com/new) → import this GitHub repo  
2. **Root Directory** → `frontend` (important — do not leave as `.`)  
3. Framework Preset: **Next.js** (auto from `vercel.json`)  
4. Node.js: **20.x** (see `.nvmrc`)

### 2. Environment variables

Set these for **Production** and **Preview** (Project → Settings → Environment Variables):

| Name | Required | Notes |
|------|----------|--------|
| `NEXT_PUBLIC_API_URL` | Yes | Public HTTPS URL of your FastAPI backend (no trailing slash). Not `localhost`. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk → API Keys |
| `CLERK_SECRET_KEY` | Yes | Clerk → API Keys |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Recommended | `/login` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Recommended | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_OUT_URL` | Recommended | `/` |
| `OPENAI_API_KEY` | For character sprites | Used by `/api/character/*` on Vercel |
| `OPENAI_CHAT_MODEL` | Optional | Default `gpt-4o-mini` |
| `OPENAI_IMAGE_MODEL` | Optional | Default `gpt-image-1.5` |
| `OPENAI_IMAGE_QUALITY` | Optional | Default `medium` |

### 3. Clerk domains

In [Clerk Dashboard](https://dashboard.clerk.com) → Domains / Configure:

- Add `https://your-project.vercel.app`
- Add any custom domain you attach on Vercel
- Keep local `http://localhost:3000` for development

### 4. Backend CORS

Your FastAPI `CORS_ORIGINS` must include the Vercel origin(s), e.g.:

```env
CORS_ORIGINS=http://localhost:3000,https://your-project.vercel.app,https://your-custom-domain.com
```

Redeploy/restart the backend after changing CORS.

### 5. Deploy

```bash
# From frontend/ (optional CLI)
npx vercel
npx vercel --prod
```

Or push to `main` with the Git integration.

### Notes

- **Character generation** (`/api/character/generate`) can take up to ~3 minutes (`maxDuration = 180`). That needs a Vercel plan that allows long serverless timeouts; Hobby may cap earlier.
- Sprite PNGs are stored under `/tmp` on Vercel (ephemeral per instance). Prefer regenerating in-session rather than deep-linking old sprite URLs across cold starts.
- Lesson / presentation generation runs on the **backend** — only the UI is on Vercel. The backend must be reachable over HTTPS from the browser.

## Structure

- `/` — landing  
- `/studio` — lesson create → scenes → presentations  
- `/login`, `/sign-up` — Clerk auth  
- `src/lib/api.ts` — typed client for the FastAPI backend  
- `src/proxy.ts` — Clerk auth gate (Next.js 16 proxy)

## Scripts

```bash
npm run dev      # local
npm run build    # production build (same as Vercel)
npm run start    # serve .next locally
npm run lint
```
