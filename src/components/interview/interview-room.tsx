"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildOpeningPrompt } from "@/lib/interview/interviewer-policy";
import {
  buildRealtimeSessionUpdateEvent,
  REALTIME_EAGERNESS,
  REALTIME_MODEL,
  REALTIME_TURN_DETECTION,
  REALTIME_VOICE,
} from "@/lib/interview/realtime-config";
import { normalizeRealtimeEvent } from "@/lib/interview/realtime-events";
import type {
  InterviewSession,
  PersistedInterviewDraft,
  TranscriptEntry,
  TranscriptSaveResult,
} from "@/lib/interview/types";

type InterviewRoomProps = {
  interviewId: string;
  launchToken: string;
  recoveredDraft: PersistedInterviewDraft | null;
  session: InterviewSession;
  onComplete: (result: { filePath: string | null }) => void;
};

type ConnectionState =
  | "preparing"
  | "connecting"
  | "connected"
  | "error"
  | "ended";

type PresenceState =
  | "idle"
  | "listening"
  | "speaking"
  | "thinking"
  | "processing"
  | "reconnecting";

type TranscriptMap = Record<string, TranscriptEntry>;

const storagePrefix = "ai-interviewer:draft:";
const maxDebugEvents = 8;

function isMediaStream(value: unknown): value is MediaStream {
  return typeof MediaStream !== "undefined" && value instanceof MediaStream;
}

function insertOrderedId(
  existing: string[],
  itemId: string,
  previousItemId?: string | null,
) {
  if (!itemId || existing.includes(itemId)) {
    return existing;
  }

  if (previousItemId) {
    const previousIndex = existing.indexOf(previousItemId);
    if (previousIndex >= 0) {
      return [
        ...existing.slice(0, previousIndex + 1),
        itemId,
        ...existing.slice(previousIndex + 1),
      ];
    }
  }

  return [...existing, itemId];
}

function upsertTranscriptEntry(
  existing: TranscriptMap,
  itemId: string,
  role: TranscriptEntry["role"],
  patch: Partial<TranscriptEntry>,
) {
  const now = new Date().toISOString();
  const current = existing[itemId];

  return {
    ...existing,
    [itemId]: {
      itemId,
      role,
      text: patch.text ?? current?.text ?? "",
      status: patch.status ?? current?.status ?? "partial",
      startedAt: current?.startedAt ?? now,
      updatedAt: now,
    },
  };
}

function collectOrderedEntries(order: string[], transcriptMap: TranscriptMap) {
  const seen = new Set(order);
  const ordered = order
    .map((itemId) => transcriptMap[itemId])
    .filter((entry): entry is TranscriptEntry => Boolean(entry));
  const extras = Object.values(transcriptMap).filter(
    (entry) => !seen.has(entry.itemId),
  );
  return [...ordered, ...extras].filter((entry) => entry.text.trim().length > 0);
}

export function InterviewRoom({
  interviewId,
  launchToken,
  recoveredDraft,
  session,
  onComplete,
}: InterviewRoomProps) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("preparing");
  const [assistantState, setAssistantState] =
    useState<PresenceState>("idle");
  const [candidateState, setCandidateState] =
    useState<PresenceState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [sessionUpdated, setSessionUpdated] = useState(false);
  const [dataChannelOpen, setDataChannelOpen] = useState(false);
  const [sdpAnswerApplied, setSdpAnswerApplied] = useState(false);
  const [peerConnectionState, setPeerConnectionState] =
    useState<string>("new");
  const [remoteAudioTrackReceived, setRemoteAudioTrackReceived] =
    useState(false);
  const [remoteAudioPlaying, setRemoteAudioPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [audioRetryState, setAudioRetryState] = useState<
    "idle" | "enabling" | "enabled"
  >("idle");
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [recentEventTypes, setRecentEventTypes] = useState<string[]>([]);
  const [lastRealtimeError, setLastRealtimeError] = useState<string | null>(
    null,
  );
  const [transcriptMap, setTranscriptMap] = useState<TranscriptMap>(() => {
    if (!recoveredDraft) {
      return {};
    }

    return Object.fromEntries(
      recoveredDraft.entries.map((entry) => [entry.itemId, entry]),
    );
  });
  const [itemOrder, setItemOrder] = useState<string[]>(
    recoveredDraft?.entries.map((entry) => entry.itemId) ?? [],
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const candidateVideoRef = useRef<HTMLVideoElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const transcriptFlushTimerRef = useRef<number | null>(null);

  const orderedEntries = useMemo(
    () => collectOrderedEntries(itemOrder, transcriptMap),
    [itemOrder, transcriptMap],
  );

  const finalEntries = useMemo(
    () => orderedEntries.filter((entry) => entry.status === "final"),
    [orderedEntries],
  );

  const voiceOutputSummary = useMemo(() => {
    if (remoteAudioPlaying) {
      return "Interviewer voice is playing through the remote audio track.";
    }

    if (autoplayBlocked) {
      return "Remote interviewer audio arrived, but the browser is waiting for a user gesture to play it.";
    }

    if (remoteAudioTrackReceived) {
      return "Remote interviewer audio track received. Waiting for playback to begin.";
    }

    if (dataChannelOpen || sdpAnswerApplied) {
      return "Realtime session connected. Waiting for the interviewer audio track.";
    }

    return "Preparing the realtime interviewer connection.";
  }, [
    autoplayBlocked,
    dataChannelOpen,
    remoteAudioPlaying,
    remoteAudioTrackReceived,
    sdpAnswerApplied,
  ]);

  const persistTranscript = useCallback(
    async (status: "draft" | "completed") => {
      if (finalEntries.length === 0) {
        return null;
      }

      const payload = {
        interviewId,
        token: session.token,
        status,
        startedAt: recoveredDraft?.startedAt ?? new Date().toISOString(),
        savedAt: new Date().toISOString(),
        candidateName: session.candidateName,
        roleTitle: session.roleTitle,
        entries: finalEntries,
      };

      window.localStorage.setItem(
        `${storagePrefix}${session.token}`,
        JSON.stringify(payload),
      );

      const response = await fetch(`/api/interview/${session.token}/transcript`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as TranscriptSaveResult;
      if (!response.ok || !result.ok) {
        throw new Error(result.ok ? "Transcript save failed." : result.message);
      }

      if (status === "completed") {
        window.localStorage.removeItem(`${storagePrefix}${session.token}`);
      }

      return result.filePath;
    },
    [
      finalEntries,
      interviewId,
      recoveredDraft?.startedAt,
      session.candidateName,
      session.roleTitle,
      session.token,
    ],
  );

  const recordRealtimeEvent = useCallback((eventType: string) => {
    setLastEventType(eventType);
    setRecentEventTypes((current) => {
      const next = [eventType, ...current];
      return next.slice(0, maxDebugEvents);
    });
  }, []);

  const attemptRemoteAudioPlayback = useCallback(
    async (trigger: "remote-track" | "user-gesture") => {
      const audioElement = audioRef.current;
      if (!audioElement) {
        return;
      }

      if (trigger === "user-gesture") {
        setAudioRetryState("enabling");
      }

      try {
        await audioElement.play();
        setRemoteAudioPlaying(true);
        setAutoplayBlocked(false);
        setAudioRetryState(trigger === "user-gesture" ? "enabled" : "idle");
      } catch (error) {
        setRemoteAudioPlaying(false);
        setAutoplayBlocked(true);
        setAudioRetryState("idle");

        if (trigger === "user-gesture") {
          const message =
            error instanceof Error
              ? error.message
              : "Browser audio playback could not be enabled.";
          setLastRealtimeError(message);
          setErrorMessage(
            "The browser still blocked interviewer audio playback. Try another user gesture or browser tab focus.",
          );
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (transcriptFlushTimerRef.current) {
      window.clearTimeout(transcriptFlushTimerRef.current);
    }

    transcriptFlushTimerRef.current = window.setTimeout(() => {
      void persistTranscript("draft").catch(() => undefined);
    }, 900);

    return () => {
      if (transcriptFlushTimerRef.current) {
        window.clearTimeout(transcriptFlushTimerRef.current);
        transcriptFlushTimerRef.current = null;
      }
    };
  }, [persistTranscript]);

  useEffect(() => {
    const audioElement = audioRef.current;
    if (!audioElement) {
      return;
    }

    const handlePlaying = () => {
      setRemoteAudioPlaying(true);
      setAutoplayBlocked(false);
    };

    const handlePause = () => {
      setRemoteAudioPlaying(false);
    };

    const handleEnded = () => {
      setRemoteAudioPlaying(false);
    };

    const handleError = () => {
      setRemoteAudioPlaying(false);
      setLastRealtimeError("Remote interviewer audio element reported a playback error.");
    };

    audioElement.addEventListener("playing", handlePlaying);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);

    return () => {
      audioElement.removeEventListener("playing", handlePlaying);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const audioElement = audioRef.current;

    async function connectRealtimeInterview() {
      setConnectionState("connecting");
      setAssistantState("reconnecting");
      setCandidateState("listening");
      setErrorMessage(null);
      setLastRealtimeError(null);
      setSessionUpdated(false);
      setDataChannelOpen(false);
      setSdpAnswerApplied(false);
      setRemoteAudioTrackReceived(false);
      setRemoteAudioPlaying(false);
      setAutoplayBlocked(false);
      setAudioRetryState("idle");
      setPeerConnectionState("new");
      setLastEventType(null);
      setRecentEventTypes([]);

      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (!isMediaStream(localStream)) {
          setConnectionState("connected");
          setAssistantState("idle");
          setErrorMessage(
            "Live interviewer audio is unavailable in this browser test environment.",
          );
          return;
        }

        if (cancelled) {
          localStream.getTracks().forEach((track) => track.stop());
          return;
        }

        localStreamRef.current = localStream;

        if (candidateVideoRef.current) {
          candidateVideoRef.current.srcObject = localStream;
          void candidateVideoRef.current.play().catch(() => undefined);
        }

        const peerConnection = new RTCPeerConnection();
        const dataChannel = peerConnection.createDataChannel("interview-events");
        peerConnectionRef.current = peerConnection;
        dataChannelRef.current = dataChannel;

        peerConnection.onconnectionstatechange = () => {
          const nextState = peerConnection.connectionState;
          setPeerConnectionState(nextState);

          if (nextState === "connected") {
            setConnectionState("connected");
          } else if (nextState === "failed" || nextState === "disconnected") {
            setConnectionState("error");
            setLastRealtimeError(`Peer connection ${nextState}.`);
          }
        };

        const [audioTrack] = localStream.getAudioTracks();
        if (audioTrack) {
          peerConnection.addTrack(audioTrack, localStream);
        }

        peerConnection.ontrack = (event) => {
          const [remoteStream] = event.streams;
          setRemoteAudioTrackReceived(true);

          if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;
            void attemptRemoteAudioPlayback("remote-track");
          }
        };

        dataChannel.addEventListener("open", () => {
          setDataChannelOpen(true);
          setConnectionState("connected");
          setAssistantState("thinking");
          setCandidateState("listening");

          recordRealtimeEvent("data-channel.open");
          dataChannel.send(
            JSON.stringify(buildRealtimeSessionUpdateEvent(session)),
          );
          setSessionUpdated(true);

          dataChannel.send(
            JSON.stringify({
              type: "response.create",
              response: {
                instructions: buildOpeningPrompt(session, recoveredDraft),
              },
            }),
          );
        });

        dataChannel.addEventListener("close", () => {
          setDataChannelOpen(false);
          recordRealtimeEvent("data-channel.close");
        });

        dataChannel.addEventListener("message", (messageEvent) => {
          const event = JSON.parse(messageEvent.data) as Record<string, unknown>;
          const normalized = normalizeRealtimeEvent(event);
          recordRealtimeEvent(normalized.eventType);

          switch (normalized.kind) {
            case "error":
              setConnectionState("error");
              setAssistantState("idle");
              setLastRealtimeError(normalized.message);
              setErrorMessage(normalized.message);
              return;
            case "session-created":
              return;
            case "session-updated":
              setSessionUpdated(true);
              return;
            case "response-created":
              setAssistantState("thinking");
              return;
            case "response-done":
              setAssistantState("listening");
              setCandidateState("listening");
              return;
            case "candidate-speech-started":
              setCandidateState("speaking");
              return;
            case "candidate-speech-stopped":
              setCandidateState("processing");
              return;
            case "candidate-item-committed":
              setItemOrder((current) =>
                insertOrderedId(
                  current,
                  normalized.itemId,
                  normalized.previousItemId,
                ),
              );
              return;
            case "conversation-item-done":
              if (normalized.itemId) {
                setItemOrder((current) =>
                  insertOrderedId(
                    current,
                    normalized.itemId,
                    normalized.previousItemId,
                  ),
                );
              }

              if (normalized.itemId && normalized.text) {
                setTranscriptMap((current) =>
                  upsertTranscriptEntry(
                    current,
                    normalized.itemId,
                    normalized.role,
                    { text: normalized.text, status: "final" },
                  ),
                );
              }
              return;
            case "transcript-delta":
              setTranscriptMap((current) =>
                upsertTranscriptEntry(current, normalized.itemId, normalized.role, {
                  text: `${current[normalized.itemId]?.text ?? ""}${normalized.text}`,
                }),
              );
              return;
            case "transcript-done":
              setTranscriptMap((current) =>
                upsertTranscriptEntry(current, normalized.itemId, normalized.role, {
                  text:
                    normalized.text || (current[normalized.itemId]?.text ?? ""),
                  status: "final",
                }),
              );
              return;
            case "unhandled":
              return;
          }
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const response = await fetch(
          `/api/interview/${session.token}/realtime?launchToken=${encodeURIComponent(
            launchToken,
          )}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/sdp",
            },
            body: offer.sdp ?? "",
          },
        );

        const answerSdp = await response.text();
        if (!response.ok) {
          throw new Error(answerSdp || "Realtime interview bootstrap failed.");
        }

        await peerConnection.setRemoteDescription({
          type: "answer",
          sdp: answerSdp,
        });
        setSdpAnswerApplied(true);
      } catch (error) {
        setConnectionState("error");
        setAssistantState("idle");
        setCandidateState("idle");
        const message =
          error instanceof Error
            ? error.message
            : "The live interview could not start.";
        setLastRealtimeError(message);
        setErrorMessage(message);
      }
    }

    void connectRealtimeInterview();

    return () => {
      cancelled = true;
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());

      if (audioElement) {
        audioElement.srcObject = null;
      }
    };
  }, [
    attemptRemoteAudioPlayback,
    interviewId,
    launchToken,
    recordRealtimeEvent,
    recoveredDraft,
    session,
  ]);

  async function handleEndInterview() {
    setSavingState("saving");
    setConnectionState("ended");

    try {
      const filePath = await persistTranscript("completed");
      setSavingState("saved");
      setSaveMessage(
        filePath ? `Transcript saved to ${filePath}` : "Transcript saved.",
      );
      onComplete({ filePath });
    } catch (error) {
      setSavingState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Transcript save failed.",
      );
      onComplete({ filePath: null });
    }
  }

  async function handleEnableInterviewerAudio() {
    await attemptRemoteAudioPlayback("user-gesture");
  }

  const showDiagnostics = process.env.NODE_ENV !== "production";

  return (
    <section className="interview-room-shell">
      <div className="room-stage">
        <div className="stage-header">
          <div>
            <p className="eyebrow">Live interview</p>
            <h2>Voice interview in progress</h2>
            <p className="supporting-copy">
              The interviewer stays camera-off. Your camera remains on in the
              local room view.
            </p>
          </div>
          <div className="room-actions">
            <span className={`connection-pill ${connectionState}`}>
              {connectionState}
            </span>
            <button
              className="secondary-button"
              onClick={handleEndInterview}
              type="button"
            >
              {savingState === "saving" ? "Saving transcript…" : "End interview"}
            </button>
          </div>
        </div>

        {recoveredDraft ? (
          <div className="info-banner">
            A previous transcript draft was restored for this interview. The
            interviewer will continue from the saved context.
          </div>
        ) : null}

        <div className="voice-status-grid">
          <div className="voice-status-card">
            <p className="eyebrow">Voice output</p>
            <strong>{voiceOutputSummary}</strong>
            <p className="status-copy">
              Model: {REALTIME_MODEL} | Voice: {REALTIME_VOICE} | Turn
              detection: {REALTIME_TURN_DETECTION} ({REALTIME_EAGERNESS})
            </p>
          </div>
          <div className="voice-status-card">
            <p className="eyebrow">Connection checkpoints</p>
            <div className="checkpoint-row">
              <span className={`status-chip ${sdpAnswerApplied ? "ready" : "idle"}`}>
                SDP
              </span>
              <span className={`status-chip ${dataChannelOpen ? "ready" : "idle"}`}>
                data channel
              </span>
              <span
                className={`status-chip ${
                  remoteAudioTrackReceived ? "ready" : "idle"
                }`}
              >
                remote track
              </span>
              <span
                className={`status-chip ${
                  remoteAudioPlaying
                    ? "ready"
                    : autoplayBlocked
                      ? "pending"
                      : "idle"
                }`}
              >
                speaker
              </span>
            </div>
          </div>
        </div>

        {autoplayBlocked ? (
          <div className="warning-banner audio-recovery-banner">
            Remote interviewer audio has arrived, but the browser blocked
            playback. Use the button below to enable it.
            <div className="action-row">
              <button
                className="secondary-button"
                onClick={handleEnableInterviewerAudio}
                type="button"
              >
                {audioRetryState === "enabling"
                  ? "Enabling interviewer audio…"
                  : "Enable interviewer audio"}
              </button>
            </div>
          </div>
        ) : null}

        {errorMessage ? <div className="danger-banner">{errorMessage}</div> : null}
        {saveMessage ? <div className="success-banner">{saveMessage}</div> : null}

        <div className="call-layout">
          <article className="call-tile interviewer-tile">
            <div className="tile-status-row">
              <span className="tile-label">{session.interviewerLabel}</span>
              <span className={`presence-pill ${assistantState}`}>
                {assistantState}
              </span>
            </div>
            <div className="avatar-stage">
              <div className="avatar-core">AI</div>
              <p>Camera off</p>
              <p className="status-copy">
                New-drug R&amp;D screening interview
              </p>
              <p className="status-line">{voiceOutputSummary}</p>
            </div>
          </article>

          <article className="call-tile candidate-tile">
            <div className="tile-status-row">
              <span className="tile-label">{session.candidateName}</span>
              <span className={`presence-pill ${candidateState}`}>
                {candidateState}
              </span>
            </div>
            <div className="candidate-preview">
              <video autoPlay muted playsInline ref={candidateVideoRef} />
              <div className="candidate-overlay">
                <strong>{session.roleTitle}</strong>
                <span>{session.focusArea}</span>
              </div>
            </div>
          </article>
        </div>

        {showDiagnostics ? (
          <section className="diagnostics-panel">
            <p className="eyebrow">Realtime diagnostics</p>
            <div className="diagnostics-grid">
              <div className="diagnostics-card">
                <strong>Session</strong>
                <ul className="diagnostic-list">
                  <li>Peer state: {peerConnectionState}</li>
                  <li>SDP answer applied: {sdpAnswerApplied ? "yes" : "no"}</li>
                  <li>Session update sent: {sessionUpdated ? "yes" : "no"}</li>
                  <li>Data channel open: {dataChannelOpen ? "yes" : "no"}</li>
                </ul>
              </div>
              <div className="diagnostics-card">
                <strong>Audio</strong>
                <ul className="diagnostic-list">
                  <li>
                    Remote track received:{" "}
                    {remoteAudioTrackReceived ? "yes" : "no"}
                  </li>
                  <li>Remote audio playing: {remoteAudioPlaying ? "yes" : "no"}</li>
                  <li>Autoplay blocked: {autoplayBlocked ? "yes" : "no"}</li>
                  <li>Audio retry state: {audioRetryState}</li>
                </ul>
              </div>
              <div className="diagnostics-card">
                <strong>Events</strong>
                <ul className="diagnostic-list">
                  <li>Last event: {lastEventType ?? "none yet"}</li>
                  {recentEventTypes.map((eventType) => (
                    <li key={eventType}>{eventType}</li>
                  ))}
                </ul>
              </div>
              <div className="diagnostics-card">
                <strong>Errors</strong>
                <p className="status-copy">
                  {lastRealtimeError ?? "No realtime errors recorded."}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        <audio ref={audioRef} className="remote-audio" autoPlay />
      </div>

      <aside className="transcript-panel">
        <p className="eyebrow">Transcript</p>
        <h2>Live notes</h2>
        <p className="supporting-copy">
          The transcript is checkpointed locally and on the server as the
          conversation progresses.
        </p>
        <div className="transcript-list">
          {orderedEntries.length === 0 ? (
            <div className="transcript-empty">
              The transcript will appear here once the interviewer or candidate
              starts speaking.
            </div>
          ) : (
            orderedEntries.map((entry) => (
              <article
                className={`transcript-entry ${entry.role} ${entry.status}`}
                key={entry.itemId}
              >
                <div className="transcript-meta">
                  <strong>
                    {entry.role === "assistant" ? "Interviewer" : "Candidate"}
                  </strong>
                  <span>{entry.status}</span>
                </div>
                <p>{entry.text}</p>
              </article>
            ))
          )}
        </div>
      </aside>
    </section>
  );
}
