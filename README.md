# AI Interviewer

A small full-stack Next.js app for self-serve AI-led voice interviews in the new-drug R&D domain.

The current implementation supports:

- candidate entry by tokenized link
- camera and microphone preflight before start
- a meet-style interview room with candidate camera on and interviewer camera off
- OpenAI Realtime WebRTC session bootstrap for spoken back-and-forth
- transcript capture, draft checkpointing, and final transcript save to local JSON files

## Stack

- Next.js 16
- React 19
- TypeScript
- Playwright
- OpenAI Realtime API

## Architecture

This is not a frontend-only project.

It has 3 runtime parts:

1. Browser client
   - renders the candidate UI
   - runs camera/mic preflight
   - creates the WebRTC offer
   - receives realtime events and builds the transcript

2. Next.js server routes
   - resolves interview session tokens
   - validates launch state
   - proxies the WebRTC SDP handshake to OpenAI
   - persists transcript checkpoints and final output

3. OpenAI Realtime
   - generates the interviewer voice
   - handles speech input and model responses
   - returns transcript and conversation events

## High-Level Diagram

```text
Candidate Browser
    |
    |  GET /interview/[token]
    v
Next.js App Router Page
    |
    |  getInterviewSession(token)
    v
Entry Screen + Preflight UI
    |
    |  POST /api/interview/[token]/start
    v
Start Route
    |
    |  launchToken + interviewId
    v
Interview Room (client)
    |
    |  createOffer() + local media
    |  POST /api/interview/[token]/realtime?launchToken=...
    v
Realtime Route
    |
    |  POST /v1/realtime/calls
    v
OpenAI Realtime API
    |
    |  SDP answer + realtime events
    v
Interview Room
    |
    |  POST /api/interview/[token]/transcript
    v
Transcript Route
    |
    |  write JSON
    v
data/interviews/*.json
```

## Code Layout

### App routes

- [`src/app/page.tsx`](./src/app/page.tsx)
  Home page with a link to the demo interview.

- [`src/app/interview/[token]/page.tsx`](./src/app/interview/%5Btoken%5D/page.tsx)
  Tokenized interview route. Loads the session and renders the entry flow.

### API routes

- [`src/app/api/interview/[token]/start/route.ts`](./src/app/api/interview/%5Btoken%5D/start/route.ts)
  Creates the initial launch handoff for the interview room.

- [`src/app/api/interview/[token]/realtime/route.ts`](./src/app/api/interview/%5Btoken%5D/realtime/route.ts)
  Server-side bridge to OpenAI Realtime. Validates the token, reads the SDP offer, and returns the SDP answer.

- [`src/app/api/interview/[token]/transcript/route.ts`](./src/app/api/interview/%5Btoken%5D/transcript/route.ts)
  Saves transcript drafts and final transcripts to disk.

### Interview UI

- [`src/components/interview/entry-screen.tsx`](./src/components/interview/entry-screen.tsx)
  Candidate entry screen. Owns preflight completion and interview launch.

- [`src/components/interview/preflight-panel.tsx`](./src/components/interview/preflight-panel.tsx)
  Explicit mic/camera enable flow, readiness states, preview, and retry handling.

- [`src/components/interview/interview-room.tsx`](./src/components/interview/interview-room.tsx)
  Live interview UI, WebRTC connection logic, realtime event handling, local draft persistence, and transcript panel.

### Domain logic

- [`src/lib/interview/session.ts`](./src/lib/interview/session.ts)
  Seeded interview session store and launch helpers.

- [`src/lib/interview/interviewer-policy.ts`](./src/lib/interview/interviewer-policy.ts)
  Realtime interviewer instructions and resume prompt generation.

- [`src/lib/interview/types.ts`](./src/lib/interview/types.ts)
  Shared application and transcript types.

- [`src/lib/media/preflight.ts`](./src/lib/media/preflight.ts)
  Browser media readiness logic and user-facing failure mapping.

- [`src/lib/interview/transcript-store.ts`](./src/lib/interview/transcript-store.ts)
  File-based transcript persistence to `data/interviews/`.

### Tests

- [`tests/e2e/phase-01-entry.spec.ts`](./tests/e2e/phase-01-entry.spec.ts)
  Browser coverage for the candidate entry and preflight flow.

## Request Flow

### 1. Candidate opens an interview link

The page route reads the token and calls `getInterviewSession(token)`.

Current state:

- seeded in-memory sessions only
- demo token: `demo-rd-001`

### 2. Candidate passes browser preflight

The entry screen blocks the start action until:

- camera is ready
- microphone is ready

The interviewer is explicitly shown as voice-only, but the candidate camera is required.

### 3. Candidate starts the interview

The browser calls:

```text
POST /api/interview/[token]/start
```

The response includes:

- `launchToken`
- `interviewId`
- the next step for the room

### 4. Browser connects to OpenAI Realtime

The interview room:

- reacquires camera and microphone
- creates a WebRTC offer
- posts the SDP offer to the app's realtime route

The realtime route:

- validates the session token
- checks the `launchToken`
- uses `OPENAI_API_KEY`
- forwards the offer to OpenAI Realtime
- returns the SDP answer to the browser

### 5. Live interview transcript is built

The client listens to realtime events and converts them into ordered transcript entries for:

- assistant turns
- candidate turns
- partial and final transcript states

### 6. Transcript is checkpointed and finalized

During the interview:

- final transcript entries are checkpointed to `localStorage`
- the same draft is posted to `/api/interview/[token]/transcript`

At the end:

- the final transcript is written to `data/interviews/<interviewId>.json`
- the local draft is cleared

## Domain Behavior

The interviewer is scoped to new-drug R&D screening.

Current instruction layer tells the model to:

- start by asking about the candidate's background
- ask follow-up questions based on prior answers
- stay within pharma and drug discovery screening topics
- keep voice responses concise and interviewer-like
- handle interruption naturally

That logic lives in [`src/lib/interview/interviewer-policy.ts`](./src/lib/interview/interviewer-policy.ts).

## Local Development

### Prerequisites

- Node.js 20+
- npm
- a browser with working WebRTC, camera, and microphone support
- an OpenAI API key with access to Realtime

### Environment

Create a local env file:

```bash
cp .env.example .env.local
```

Then set:

```bash
OPENAI_API_KEY=your_key_here
```

### Run

```bash
npm install
npm run dev -- --port 3100
```

Open:

```text
http://localhost:3100/interview/demo-rd-001
```

### Validation

```bash
npm run lint
npm run build
npx playwright test tests/e2e/phase-01-entry.spec.ts
```

## Current Limitations

- session data is seeded, not database-backed
- transcript storage is local JSON only
- there is no recruiter dashboard
- there is no auth or candidate identity verification
- no server-side interview scheduling or token issuance yet
- browser tests currently cover entry and preflight, not a real OpenAI Realtime session
- runtime transcript event handling depends on current OpenAI Realtime event shapes

## Next Logical Improvements

- replace seeded session data with persistent interview records
- add stronger validation around transcript event shapes
- add realtime session integration tests with mocks
- move transcript storage to a database
- add recruiter-side review and replay tooling
- add domain rubric prompts and structured evaluation after the interview
