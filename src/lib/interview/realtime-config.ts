import type { InterviewSession } from "./types";
import { buildRealtimeInstructions } from "./interviewer-policy";

export const REALTIME_MODEL = "gpt-realtime";
export const REALTIME_VOICE = "marin";
export const REALTIME_TURN_DETECTION = "semantic_vad";
export const REALTIME_EAGERNESS = "low";

export function buildTranscriptionPrompt(session: InterviewSession) {
  return [
    `Candidate interview for ${session.roleTitle}.`,
    `Domain specialty: ${session.domainSpecialty}.`,
    "Expect pharmaceutical R&D, new-drug discovery, assay development, PK/PD, translational science, IND, CMC, GMP, GLP, medicinal chemistry, biologics, preclinical development, screening, and cross-functional drug program terminology.",
  ].join(" ");
}

export function buildRealtimeSessionConfig(session: InterviewSession) {
  return {
    type: "realtime",
    model: REALTIME_MODEL,
    instructions: buildRealtimeInstructions(session),
    max_output_tokens: 600,
    audio: {
      input: {
        noise_reduction: {
          type: "near_field",
        },
        transcription: {
          model: "gpt-4o-mini-transcribe",
          prompt: buildTranscriptionPrompt(session),
        },
        turn_detection: {
          type: REALTIME_TURN_DETECTION,
          eagerness: REALTIME_EAGERNESS,
          create_response: true,
          interrupt_response: true,
        },
      },
      output: {
        voice: REALTIME_VOICE,
      },
    },
  };
}

export function buildRealtimeCallPayload(session: InterviewSession) {
  return {
    ...buildRealtimeSessionConfig(session),
  };
}

export function buildRealtimeSessionUpdateEvent(session: InterviewSession) {
  return {
    type: "session.update",
    session: buildRealtimeSessionConfig(session),
  };
}
