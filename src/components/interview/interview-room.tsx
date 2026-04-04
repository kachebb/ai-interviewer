"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildOpeningPrompt } from "@/lib/interview/interviewer-policy";
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
  const extras = Object.values(transcriptMap).filter((entry) => !seen.has(entry.itemId));
  return [...ordered, ...extras].filter((entry) => entry.text.trim().length > 0);
}

export function InterviewRoom({
  interviewId,
  launchToken,
  recoveredDraft,
  session,
  onComplete,
}: InterviewRoomProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("preparing");
  const [assistantState, setAssistantState] = useState<PresenceState>("idle");
  const [candidateState, setCandidateState] = useState<PresenceState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "error">("idle");
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

  const persistTranscript = useCallback(async (status: "draft" | "completed") => {
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
  }, [finalEntries, interviewId, recoveredDraft?.startedAt, session.candidateName, session.roleTitle, session.token]);

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
    let cancelled = false;

    async function connectRealtimeInterview() {
      setConnectionState("connecting");
      setAssistantState("reconnecting");
      setCandidateState("listening");

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

        const [audioTrack] = localStream.getAudioTracks();
        if (audioTrack) {
          peerConnection.addTrack(audioTrack, localStream);
        }

        peerConnection.ontrack = (event) => {
          const [remoteStream] = event.streams;
          if (audioRef.current && remoteStream) {
            audioRef.current.srcObject = remoteStream;
            void audioRef.current.play().catch(() => undefined);
          }
        };

        dataChannel.addEventListener("open", () => {
          setConnectionState("connected");
          setAssistantState("thinking");
          setCandidateState("listening");

          dataChannel.send(
            JSON.stringify({
              type: "response.create",
              response: {
                instructions: buildOpeningPrompt(session, recoveredDraft),
              },
            }),
          );
        });

        dataChannel.addEventListener("message", (messageEvent) => {
          const event = JSON.parse(messageEvent.data) as Record<string, unknown>;
          const eventType = String(event.type ?? "");

          if (eventType === "error") {
            const error = event.error as { message?: string } | undefined;
            setConnectionState("error");
            setAssistantState("idle");
            setErrorMessage(error?.message ?? "Realtime interview connection failed.");
            return;
          }

          if (eventType === "input_audio_buffer.speech_started") {
            setCandidateState("speaking");
            return;
          }

          if (eventType === "input_audio_buffer.speech_stopped") {
            setCandidateState("processing");
            return;
          }

          if (eventType === "response.created") {
            setAssistantState("thinking");
            return;
          }

          if (eventType === "response.done") {
            setAssistantState("listening");
            setCandidateState("listening");
            return;
          }

          if (eventType === "input_audio_buffer.committed") {
            const itemId = typeof event.item_id === "string" ? event.item_id : "";
            const previousItemId =
              typeof event.previous_item_id === "string" ? event.previous_item_id : null;
            setItemOrder((current) => insertOrderedId(current, itemId, previousItemId));
            return;
          }

          if (eventType === "conversation.item.done") {
            const item = event.item as
              | {
                  id?: string;
                  role?: string;
                  content?: Array<{ transcript?: string; text?: string }>;
                }
              | undefined;
            const itemId = item?.id;
            const previousItemId =
              typeof event.previous_item_id === "string" ? event.previous_item_id : null;

            if (itemId) {
              setItemOrder((current) => insertOrderedId(current, itemId, previousItemId));
            }

            const contentPart = item?.content?.[0];
            const transcript = contentPart?.transcript ?? contentPart?.text;
            if (itemId && item?.role && transcript) {
              setTranscriptMap((current) =>
                upsertTranscriptEntry(
                  current,
                  itemId,
                  item.role === "assistant" ? "assistant" : "candidate",
                  { text: transcript, status: "final" },
                ),
              );
            }
            return;
          }

          if (eventType === "conversation.item.input_audio_transcription.delta") {
            const itemId = typeof event.item_id === "string" ? event.item_id : "";
            const delta = typeof event.delta === "string" ? event.delta : "";
            setTranscriptMap((current) =>
              upsertTranscriptEntry(current, itemId, "candidate", {
                text: `${current[itemId]?.text ?? ""}${delta}`,
              }),
            );
            return;
          }

          if (eventType === "conversation.item.input_audio_transcription.completed") {
            const itemId = typeof event.item_id === "string" ? event.item_id : "";
            const transcript = typeof event.transcript === "string" ? event.transcript : "";
            setTranscriptMap((current) =>
              upsertTranscriptEntry(current, itemId, "candidate", {
                text: transcript,
                status: "final",
              }),
            );
            return;
          }

          if (eventType === "response.output_audio_transcript.delta") {
            const itemId = typeof event.item_id === "string" ? event.item_id : "";
            const delta = typeof event.delta === "string" ? event.delta : "";
            setTranscriptMap((current) =>
              upsertTranscriptEntry(current, itemId, "assistant", {
                text: `${current[itemId]?.text ?? ""}${delta}`,
              }),
            );
            return;
          }

          if (eventType === "response.output_audio_transcript.done") {
            const itemId = typeof event.item_id === "string" ? event.item_id : "";
            const transcript = typeof event.transcript === "string" ? event.transcript : "";
            setTranscriptMap((current) =>
              upsertTranscriptEntry(current, itemId, "assistant", {
                text: transcript || (current[itemId]?.text ?? ""),
                status: "final",
              }),
            );
          }
        });

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        const response = await fetch(
          `/api/interview/${session.token}/realtime?launchToken=${encodeURIComponent(launchToken)}`,
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
      } catch (error) {
        setConnectionState("error");
        setAssistantState("idle");
        setCandidateState("idle");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The live interview could not start.",
        );
      }
    }

    void connectRealtimeInterview();

    return () => {
      cancelled = true;
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [interviewId, launchToken, recoveredDraft, session]);

  async function handleEndInterview() {
    setSavingState("saving");
    setConnectionState("ended");

    try {
      const filePath = await persistTranscript("completed");
      setSavingState("saved");
      setSaveMessage(filePath ? `Transcript saved to ${filePath}` : "Transcript saved.");
      onComplete({ filePath });
    } catch (error) {
      setSavingState("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Transcript save failed.",
      );
      onComplete({ filePath: null });
    }
  }

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

        {errorMessage ? <div className="danger-banner">{errorMessage}</div> : null}
        {saveMessage ? <div className="success-banner">{saveMessage}</div> : null}

        <div className="call-layout">
          <article className="call-tile interviewer-tile">
            <div className="tile-status-row">
              <span className="tile-label">{session.interviewerLabel}</span>
              <span className={`presence-pill ${assistantState}`}>{assistantState}</span>
            </div>
            <div className="avatar-stage">
              <div className="avatar-core">AI</div>
              <p>Camera off</p>
              <p className="status-copy">
                New-drug R&amp;D screening interview
              </p>
            </div>
          </article>

          <article className="call-tile candidate-tile">
            <div className="tile-status-row">
              <span className="tile-label">{session.candidateName}</span>
              <span className={`presence-pill ${candidateState}`}>{candidateState}</span>
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
