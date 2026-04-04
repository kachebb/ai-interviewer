export type InterviewSessionStatus = "scheduled" | "available" | "expired";

export type InterviewSession = {
  token: string;
  candidateName: string;
  roleTitle: string;
  focusArea: string;
  scheduledWindow: string;
  interviewerLabel: string;
  interviewerMode: "voice-only";
  status: InterviewSessionStatus;
};

export type StartInterviewResponse = {
  ok: true;
  token: string;
  launchToken: string;
  nextStep: "device-preflight";
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
