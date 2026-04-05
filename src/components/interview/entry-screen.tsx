"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type {
  InterviewSession,
  PersistedInterviewDraft,
  PreflightReadiness,
  StartInterviewResult,
} from "@/lib/interview/types";
import { InterviewRoom } from "./interview-room";
import { PreflightPanel } from "./preflight-panel";

type EntryScreenProps = {
  session: InterviewSession;
};

export function EntryScreen({ session }: EntryScreenProps) {
  const router = useRouter();
  const [activeInterview, setActiveInterview] = useState<{
    interviewId: string;
    launchToken: string;
  } | null>(null);
  const [recoveredDraft, setRecoveredDraft] =
    useState<PersistedInterviewDraft | null>(() => {
      if (typeof window === "undefined") {
        return null;
      }

      const stored = window.localStorage.getItem(
        `ai-interviewer:draft:${session.token}`,
      );
      if (!stored) {
        return null;
      }

      try {
        const parsed = JSON.parse(stored) as PersistedInterviewDraft;
        return parsed.status === "draft" && parsed.entries.length > 0
          ? parsed
          : null;
      } catch {
        window.localStorage.removeItem(`ai-interviewer:draft:${session.token}`);
        return null;
      }
    });
  const [readiness, setReadiness] = useState<PreflightReadiness>({
    cameraReady: false,
    microphoneReady: false,
    previewAvailable: false,
  });
  const [startState, setStartState] = useState<
    "idle" | "launching" | "confirmed" | "error"
  >("idle");
  const [launchMessage, setLaunchMessage] = useState<string | null>(null);

  const canStart = readiness.cameraReady && readiness.microphoneReady;

  const interviewModeMessage = useMemo(
    () =>
      session.interviewerMode === "voice-only"
        ? "The AI interviewer remains camera-off and joins in voice-only mode."
        : "The AI interviewer joins in live mode.",
    [session.interviewerMode],
  );

  async function handleStartInterview() {
    setStartState("launching");
    setLaunchMessage(null);

    try {
      const response = await fetch(`/api/interview/${session.token}/start`, {
        method: "POST",
      });

      const payload = (await response.json()) as StartInterviewResult;

      if (!response.ok || !payload.ok) {
        setStartState("error");
        setLaunchMessage(
          payload.ok ? "The interview could not start." : payload.message,
        );
        return;
      }

      setStartState("confirmed");
      setLaunchMessage(
        "Interview launch confirmed. Connecting the live interviewer now.",
      );
      setActiveInterview({
        interviewId: recoveredDraft?.interviewId ?? payload.interviewId,
        launchToken: payload.launchToken,
      });
    } catch {
      setStartState("error");
      setLaunchMessage(
        "The interview handoff could not be reached. Retry the start action.",
      );
    }
  }

  if (activeInterview) {
    return (
      <main className="interview-shell">
        <section className="interview-card live-card">
          <InterviewRoom
            interviewId={activeInterview.interviewId}
            launchToken={activeInterview.launchToken}
            onComplete={({ filePath }) => {
              const completedInterviewId = activeInterview.interviewId;

              if (filePath) {
                setRecoveredDraft(null);
                router.push(`/transcripts/${completedInterviewId}`);
                return;
              }

              setActiveInterview(null);
              setRecoveredDraft(null);
              setStartState("confirmed");
              setLaunchMessage("Interview finished, but the transcript could not be opened.");
            }}
            recoveredDraft={recoveredDraft}
            session={session}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="interview-shell">
      <section className="interview-card">
        <header className="interview-header">
          <div>
            <p className="eyebrow">Candidate interview</p>
            <h1>Prepare to start your interview</h1>
            <p>
              Complete the device check, review your camera preview, and then
              start the interview from this page.
            </p>
          </div>
          <div className="session-panel">
            <p className="eyebrow">Session details</p>
            <dl className="session-meta">
              <div>
                <dt>Candidate</dt>
                <dd>{session.candidateName}</dd>
              </div>
              <div>
                <dt>Role track</dt>
                <dd>{session.roleTitle}</dd>
              </div>
              <div>
                <dt>Interview focus</dt>
                <dd>{session.focusArea}</dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>{session.scheduledWindow}</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className="interview-grid">
          <section className="interview-panel">
            <p className="eyebrow">Start screen</p>
            <h2>Readiness comes first</h2>
            <p className="supporting-copy">
              Keep your camera on for this interview. {interviewModeMessage}
            </p>
            {recoveredDraft ? (
              <div className="warning-banner">
                A saved interview draft was found for this link. Starting now
                will restore the transcript and continue the interview.
              </div>
            ) : null}
            <div className="info-banner">
              Camera access is required. The interview cannot begin until both
              camera and microphone are ready.
            </div>
            <div className="action-row">
              <button
                className="primary-button"
                disabled={!canStart || startState === "launching"}
                onClick={handleStartInterview}
                type="button"
              >
                {startState === "launching" ? "Starting interview…" : "Start interview"}
              </button>
            </div>
            <p className="hint-copy">
              The start action stays locked until the device check passes.
            </p>
            {startState === "confirmed" && launchMessage ? (
              <div className="success-banner">{launchMessage}</div>
            ) : null}
            {startState === "error" && launchMessage ? (
              <div className="danger-banner">{launchMessage}</div>
            ) : null}
          </section>

          <PreflightPanel onReadinessChange={setReadiness} />
        </div>
      </section>
    </main>
  );
}
