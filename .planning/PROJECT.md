# AI Interviewer

## What This Is

AI Interviewer is a web-based interview app for candidates applying to new-drug R&D roles. A candidate opens a self-serve interview link, joins a live voice conversation with an AI interviewer in a meeting-style interface, answers adaptive domain questions, and completes the interview without a human interviewer present. The initial version focuses on a natural spoken interview flow and saving the full interview transcript.

## Core Value

Candidates can complete a credible, natural-feeling first-round spoken interview for new-drug R&D roles without a human interviewer present.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Deliver a web-based interview experience where a candidate starts the interview from a self-serve link.
- [ ] Run a live spoken interview with an AI interviewer that responds in a human voice and adapts follow-up questions to the candidate's answers.
- [ ] Support voice turn-taking well enough to detect when the candidate has finished speaking and keep the conversation natural with acceptable latency.
- [ ] Save the full interview transcript at the end of the session.

### Out of Scope

- Candidate scoring or hiring recommendations — transcript-only output is enough for v1.
- AI-generated interview summaries — deferred until the spoken interview loop is reliable.
- Broad multi-role interviewing across all medical domains — v1 is focused on new-drug R&D candidates.
- Human interviewer video presence — the AI interviewer is voice-only with camera off by design.

## Context

The target users are candidates interviewing through a self-serve link rather than an internal recruiter-operated workflow. The candidate experience should resemble a Zoom or Google Meet call, with the AI interviewer off camera and the candidate expected to have camera on. The AI interviewer begins by asking about the candidate's background, then chooses the next question using expert judgment for the candidate's domain rather than following a rigid script.

The main technical risk is the realtime voice loop: speech detection, interruption handling, candidate end-of-turn detection, and human-sounding AI speech output. The domain focus is medical research, specifically new-drug R&D personnel, so interview quality depends on prompts and follow-up logic that can probe project experience and domain knowledge credibly.

## Constraints

- **Platform**: Web app only — the product must run in the browser.
- **Interaction**: Spoken interview with voice input and AI voice output — text chat is not the primary interface.
- **Latency**: Near real-time is ideal, but short natural pauses are acceptable in v1.
- **Interview Format**: Adaptive technical screening — the AI should change direction based on candidate answers.
- **Recording Output**: Transcript only — no scoring or summarization is required for the initial version.
- **Video Presence**: Candidate camera on, AI camera off — the interface should reflect this interview setup.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-serve interview link | Candidates should be able to start interviews without manual recruiter coordination | — Pending |
| New-drug R&D domain focus | Narrow scope improves question quality and prompt design for v1 | — Pending |
| Adaptive AI interviewer | A fixed script would not reflect expert interview judgment well enough | — Pending |
| Transcript-only v1 output | The hard problem is the live spoken interview loop, so downstream analysis is deferred | — Pending |
| Web-based meeting-style UI | The target experience should feel familiar, similar to a video call interface | — Pending |

---
*Last updated: 2026-04-03 after initialization*
