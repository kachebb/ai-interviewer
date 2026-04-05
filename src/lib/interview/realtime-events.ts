import type { TranscriptSpeaker } from "./types";

export type NormalizedRealtimeEvent =
  | { kind: "error"; eventType: string; message: string }
  | { kind: "session-created"; eventType: string }
  | { kind: "session-updated"; eventType: string }
  | { kind: "response-created"; eventType: string }
  | { kind: "response-done"; eventType: string }
  | { kind: "candidate-speech-started"; eventType: string }
  | { kind: "candidate-speech-stopped"; eventType: string }
  | {
      kind: "candidate-item-committed";
      eventType: string;
      itemId: string;
      previousItemId: string | null;
    }
  | {
      kind: "conversation-item-done";
      eventType: string;
      itemId: string;
      previousItemId: string | null;
      role: TranscriptSpeaker;
      text: string;
    }
  | {
      kind: "transcript-delta";
      eventType: string;
      role: TranscriptSpeaker;
      itemId: string;
      text: string;
    }
  | {
      kind: "transcript-done";
      eventType: string;
      role: TranscriptSpeaker;
      itemId: string;
      text: string;
    }
  | { kind: "unhandled"; eventType: string };

type RawRealtimeEvent = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getConversationItemText(item: unknown) {
  if (!item || typeof item !== "object") {
    return "";
  }

  const content = (item as { content?: unknown }).content;
  if (!Array.isArray(content) || content.length === 0) {
    return "";
  }

  const firstPart = content[0];
  if (!firstPart || typeof firstPart !== "object") {
    return "";
  }

  return (
    asString((firstPart as { transcript?: unknown }).transcript) ||
    asString((firstPart as { text?: unknown }).text)
  );
}

export function normalizeRealtimeEvent(
  event: RawRealtimeEvent,
): NormalizedRealtimeEvent {
  const eventType = asString(event.type);

  switch (eventType) {
    case "error":
      return {
        kind: "error",
        eventType,
        message:
          asString((event.error as { message?: unknown } | undefined)?.message) ||
          "Realtime interview connection failed.",
      };
    case "session.created":
      return { kind: "session-created", eventType };
    case "session.updated":
      return { kind: "session-updated", eventType };
    case "response.created":
      return { kind: "response-created", eventType };
    case "response.done":
      return { kind: "response-done", eventType };
    case "input_audio_buffer.speech_started":
      return { kind: "candidate-speech-started", eventType };
    case "input_audio_buffer.speech_stopped":
      return { kind: "candidate-speech-stopped", eventType };
    case "input_audio_buffer.committed":
      return {
        kind: "candidate-item-committed",
        eventType,
        itemId: asString(event.item_id),
        previousItemId: asString(event.previous_item_id) || null,
      };
    case "conversation.item.done": {
      const item = event.item as { id?: unknown; role?: unknown } | undefined;
      return {
        kind: "conversation-item-done",
        eventType,
        itemId: asString(item?.id),
        previousItemId: asString(event.previous_item_id) || null,
        role: asString(item?.role) === "assistant" ? "assistant" : "candidate",
        text: getConversationItemText(event.item),
      };
    }
    case "conversation.item.input_audio_transcription.delta":
      return {
        kind: "transcript-delta",
        eventType,
        role: "candidate",
        itemId: asString(event.item_id),
        text: asString(event.delta),
      };
    case "conversation.item.input_audio_transcription.completed":
      return {
        kind: "transcript-done",
        eventType,
        role: "candidate",
        itemId: asString(event.item_id),
        text: asString(event.transcript),
      };
    case "response.output_audio_transcript.delta":
      return {
        kind: "transcript-delta",
        eventType,
        role: "assistant",
        itemId: asString(event.item_id),
        text: asString(event.delta),
      };
    case "response.output_audio_transcript.done":
      return {
        kind: "transcript-done",
        eventType,
        role: "assistant",
        itemId: asString(event.item_id),
        text: asString(event.transcript),
      };
    default:
      return { kind: "unhandled", eventType: eventType || "unknown" };
  }
}
