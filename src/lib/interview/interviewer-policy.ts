import type { InterviewSession, PersistedInterviewDraft, TranscriptEntry } from "./types";

function formatTranscriptSummary(entries: TranscriptEntry[]) {
  if (entries.length === 0) {
    return "";
  }

  return entries
    .filter((entry) => entry.status === "final" && entry.text.trim().length > 0)
    .map((entry) => `${entry.role === "assistant" ? "Interviewer" : "Candidate"}: ${entry.text.trim()}`)
    .join("\n");
}

export function buildRealtimeInstructions(session: InterviewSession) {
  return [
    "You are a senior AI interviewer conducting a first-round screening interview.",
    `The candidate is interviewing for ${session.roleTitle}.`,
    `The screening scope is ${session.focusArea}.`,
    "Your camera is off. Speak naturally, warmly, and concisely in a human voice.",
    "Act like a technically credible interviewer for new-drug R&D roles.",
    "Start by asking the candidate to summarize their background.",
    "After that, choose follow-up questions based on what the candidate actually says.",
    "Probe for concrete experience, scientific reasoning, decision-making, cross-functional collaboration, and technical depth.",
    "Stay within pharmaceutical R&D, drug discovery, preclinical development, translational science, assay strategy, data quality, and related screening topics.",
    "Do not turn the interview into coaching, sales, or casual chat.",
    "Ask one question at a time. Keep each turn compact unless the candidate needs clarification.",
    "If the candidate interrupts you, yield naturally and continue once they finish.",
    "If the candidate gives a vague answer, ask a sharper follow-up grounded in that answer.",
    "If the candidate speaks another language, continue in that language while maintaining the same interview standards.",
  ].join(" ");
}

export function buildOpeningPrompt(
  session: InterviewSession,
  recoveredDraft: PersistedInterviewDraft | null,
) {
  if (!recoveredDraft || recoveredDraft.entries.length === 0) {
    return [
      `Open the interview for ${session.candidateName}.`,
      "Greet the candidate briefly, explain that this is a voice-only interview,",
      "and ask them to walk through their background as it relates to new-drug R&D.",
    ].join(" ");
  }

  const priorTranscript = formatTranscriptSummary(recoveredDraft.entries);
  return [
    `Resume an interrupted interview for ${session.candidateName}.`,
    "A transcript draft from an earlier interrupted session has been restored below.",
    "Acknowledge the reconnection in one sentence, then continue the interview naturally from where the conversation appears to have left off.",
    "Do not restart from the generic opening background question unless the draft is empty.",
    "",
    "Recovered transcript:",
    priorTranscript,
  ].join("\n");
}
