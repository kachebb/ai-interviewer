import type { DeviceStatus, PreflightReadiness, PreflightResult } from "../interview/types";

const DEFAULT_CAMERA_STATUS: DeviceStatus = {
  label: "Camera",
  state: "idle",
  message: "Camera access is required before the interview can begin.",
};

const DEFAULT_MIC_STATUS: DeviceStatus = {
  label: "Microphone",
  state: "idle",
  message: "Microphone access is required before the interview can begin.",
};

type NamedError = Error & {
  name?: string;
};

export function getDefaultStatuses() {
  return {
    camera: DEFAULT_CAMERA_STATUS,
    microphone: DEFAULT_MIC_STATUS,
  };
}

function isMediaStreamLike(value: unknown): value is {
  getVideoTracks: () => Array<{ enabled?: boolean }>;
  getAudioTracks: () => Array<{ enabled?: boolean }>;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    "getVideoTracks" in value &&
    typeof (value as { getVideoTracks?: unknown }).getVideoTracks === "function" &&
    "getAudioTracks" in value &&
    typeof (value as { getAudioTracks?: unknown }).getAudioTracks === "function"
  );
}

function getReadableFailureMessage(error: unknown) {
  const namedError = error as NamedError;

  switch (namedError?.name) {
    case "NotAllowedError":
      return "Browser permissions are blocked. Allow camera and microphone access, then retry.";
    case "NotFoundError":
      return "No camera or microphone was found. Connect a device, then retry.";
    case "NotReadableError":
      return "The browser could not use your camera or microphone. Close other apps using them, then retry.";
    case "AbortError":
      return "The browser stopped the device request unexpectedly. Retry the device check.";
    case "SecurityError":
      return "This browser context cannot access camera or microphone securely.";
    default:
      return "We could not complete the device check. Retry the preflight step.";
  }
}

export async function runPreflightCheck(): Promise<PreflightResult> {
  const media = navigator.mediaDevices;

  if (!media?.getUserMedia) {
    return {
      stream: null,
      cameraReady: false,
      microphoneReady: false,
      cameraMessage: "This browser does not expose camera access.",
      microphoneMessage: "This browser does not expose microphone access.",
      failureMessage: "Use a secure, supported browser to continue.",
    };
  }

  try {
    const stream = await media.getUserMedia({ audio: true, video: true });
    const devices = media.enumerateDevices
      ? await media.enumerateDevices()
      : [];

    const videoTracks = isMediaStreamLike(stream) ? stream.getVideoTracks() : [];
    const audioTracks = isMediaStreamLike(stream) ? stream.getAudioTracks() : [];

    const hasCameraDevice =
      devices.length === 0 || devices.some((device) => device.kind === "videoinput");
    const hasMicrophoneDevice =
      devices.length === 0 || devices.some((device) => device.kind === "audioinput");

    const cameraReady = videoTracks.length > 0 && hasCameraDevice;
    const microphoneReady = audioTracks.length > 0 && hasMicrophoneDevice;

    return {
      stream,
      cameraReady,
      microphoneReady,
      cameraMessage: cameraReady
        ? "Camera is active and ready for the interview."
        : "Camera access is required before the interview can begin.",
      microphoneMessage: microphoneReady
        ? "Microphone is active and ready for the interview."
        : "Microphone access is required before the interview can begin.",
      failureMessage:
        cameraReady && microphoneReady
          ? undefined
          : "A required device is unavailable. Check your setup and retry.",
    };
  } catch (error) {
    const failureMessage = getReadableFailureMessage(error);
    return {
      stream: null,
      cameraReady: false,
      microphoneReady: false,
      cameraMessage: failureMessage,
      microphoneMessage: failureMessage,
      failureMessage,
    };
  }
}

export function getReadinessFromResult(result: PreflightResult): PreflightReadiness {
  return {
    cameraReady: result.cameraReady,
    microphoneReady: result.microphoneReady,
    previewAvailable: result.cameraReady,
  };
}

export function stopMediaStream(stream: unknown) {
  if (!isMediaStreamLike(stream)) {
    return;
  }

  for (const track of [...stream.getAudioTracks(), ...stream.getVideoTracks()]) {
    if (typeof (track as { stop?: unknown }).stop === "function") {
      (track as { stop: () => void }).stop();
    }
  }
}
