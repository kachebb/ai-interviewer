export type InterviewSessionStatus = "scheduled" | "available" | "expired";

export type InterviewSession = {
  token: string;
  candidateName: string;
  roleTitle: string;
  focusArea: string;
  domainSpecialty: string;
  scheduledWindow: string;
  interviewerLabel: string;
  interviewerMode: "voice-only";
  status: InterviewSessionStatus;
};

export type StartInterviewResponse = {
  ok: true;
  token: string;
  launchToken: string;
  interviewId: string;
  nextStep: "realtime-room";
};

export type StartInterviewError = {
  ok: false;
  message: string;
};

export type StartInterviewResult = StartInterviewResponse | StartInterviewError;

export type DeviceState = "idle" | "checking" | "pending" | "ready" | "error";

export type DeviceStatus = {
  label: string;
  state: DeviceState;
  message: string;
};

export type PreflightReadiness = {
  cameraReady: boolean;
  microphoneReady: boolean;
  previewAvailable: boolean;
};

export type PreflightResult = {
  stream: unknown;
  cameraReady: boolean;
  microphoneReady: boolean;
  cameraMessage: string;
  microphoneMessage: string;
  failureMessage?: string;
};

export type TranscriptSpeaker = "assistant" | "candidate" | "system";

export type TranscriptEntry = {
  itemId: string;
  role: TranscriptSpeaker;
  text: string;
  status: "partial" | "final";
  startedAt: string;
  updatedAt: string;
};

export type PersistedInterviewDraft = {
  interviewId: string;
  token: string;
  status: "draft" | "completed";
  startedAt: string;
  savedAt: string;
  candidateName: string;
  roleTitle: string;
  entries: TranscriptEntry[];
};

export type TranscriptSaveRequest = {
  interviewId: string;
  token: string;
  status: "draft" | "completed";
  startedAt: string;
  savedAt: string;
  candidateName: string;
  roleTitle: string;
  entries: TranscriptEntry[];
};

export type TranscriptSaveResponse = {
  ok: true;
  savedAt: string;
  filePath: string;
};

export type TranscriptSaveError = {
  ok: false;
  message: string;
};

export type TranscriptSaveResult = TranscriptSaveResponse | TranscriptSaveError;
