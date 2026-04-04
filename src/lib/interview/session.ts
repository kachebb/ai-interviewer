import { z } from "zod";

import type { InterviewSession } from "./types";

const tokenSchema = z.string().trim().min(1).max(120);

const sessionSeed: Record<string, InterviewSession> = {
  "demo-rd-001": {
    token: "demo-rd-001",
    candidateName: "Lin Tao",
    roleTitle: "Small Molecule R&D Scientist",
    focusArea: "New-drug discovery screening",
    domainSpecialty: "new-drug-rd",
    scheduledWindow: "Available now",
    interviewerLabel: "AI Interviewer",
    interviewerMode: "voice-only",
    status: "available",
  },
};

export function normalizeToken(input: string) {
  return tokenSchema.parse(input);
}

export async function getInterviewSession(token: string) {
  const normalized = normalizeToken(token);
  return sessionSeed[normalized] ?? null;
}

export async function createLaunchToken(token: string) {
  const session = await getInterviewSession(token);
  if (!session || session.status === "expired") {
    return null;
  }

  return `launch-${session.token}`;
}

export function createInterviewId(token: string) {
  return `${token}-${Date.now()}`;
}
