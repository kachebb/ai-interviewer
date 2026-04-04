"use client";

import { useEffect, useRef, useState } from "react";

import { getDefaultStatuses, getReadinessFromResult, runPreflightCheck, stopMediaStream } from "@/lib/media/preflight";
import type { DeviceStatus, PreflightReadiness } from "@/lib/interview/types";
import { ReadinessStatus } from "./readiness-status";

type PreflightPanelProps = {
  onReadinessChange: (readiness: PreflightReadiness) => void;
};

type PreflightState = {
  camera: DeviceStatus;
  microphone: DeviceStatus;
  helper: string;
  warning?: string;
  canRetry: boolean;
};

const PROMPT_TIMEOUT_MS = 8_000;

export function PreflightPanel({ onReadinessChange }: PreflightPanelProps) {
  const [preflightState, setPreflightState] = useState<PreflightState>({
    ...getDefaultStatuses(),
    helper: "Enable camera and microphone to confirm interview readiness.",
    canRetry: false,
  });
  const [stream, setStream] = useState<unknown>(null);
  const [isChecking, setIsChecking] = useState(false);
  const checkingRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }

      stopMediaStream(stream);
    };
  }, [stream]);

  useEffect(() => {
    if (!videoRef.current || !stream || !(stream instanceof MediaStream)) {
      return;
    }

    videoRef.current.srcObject = stream;
    void videoRef.current.play().catch(() => undefined);
  }, [stream]);

  async function handleEnableDevices() {
    checkingRef.current = true;
    setIsChecking(true);
    stopMediaStream(stream);
    setStream(null);
    onReadinessChange({
      cameraReady: false,
      microphoneReady: false,
      previewAvailable: false,
    });
    setPreflightState({
      camera: {
        label: "Camera",
        state: "checking",
        message: "Waiting for browser camera access…",
      },
      microphone: {
        label: "Microphone",
        state: "checking",
        message: "Waiting for browser microphone access…",
      },
      helper: "Confirm browser access to continue.",
      canRetry: false,
    });

    timeoutRef.current = window.setTimeout(() => {
      setPreflightState((previous) => {
        if (!checkingRef.current) {
          return previous;
        }

        return {
          ...previous,
          camera: {
            ...previous.camera,
            state: "pending",
            message: "Browser prompt still open. Allow access or retry.",
          },
          microphone: {
            ...previous.microphone,
            state: "pending",
            message: "Browser prompt still open. Allow access or retry.",
          },
          warning: "If the browser permission prompt is hidden behind another window, bring it forward and confirm access.",
          canRetry: true,
        };
      });
    }, PROMPT_TIMEOUT_MS);

    const result = await runPreflightCheck();

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    checkingRef.current = false;
    setIsChecking(false);
    setStream(result.stream);

    const readiness = getReadinessFromResult(result);
    onReadinessChange(readiness);

    const cameraState: DeviceStatus = {
      label: "Camera",
      state: result.cameraReady ? "ready" : "error",
      message: result.cameraMessage,
    };
    const microphoneState: DeviceStatus = {
      label: "Microphone",
      state: result.microphoneReady ? "ready" : "error",
      message: result.microphoneMessage,
    };

    setPreflightState({
      camera: cameraState,
      microphone: microphoneState,
      helper:
        result.cameraReady && result.microphoneReady
          ? "Devices confirmed. Review the preview, then start the interview."
          : "Device readiness incomplete. Fix the issue, then retry.",
      warning: result.failureMessage,
      canRetry: !result.cameraReady || !result.microphoneReady,
    });
  }

  return (
    <section className="panel-stack" aria-label="Device preflight">
      <div className="status-panel">
        <p className="eyebrow">Device readiness</p>
        <h2>Preflight checks</h2>
        <p className="supporting-copy">{preflightState.helper}</p>
        <div className="status-grid">
          <ReadinessStatus icon="📷" status={preflightState.camera} />
          <ReadinessStatus icon="🎙" status={preflightState.microphone} />
        </div>
        {preflightState.warning ? (
          <div className="warning-banner">{preflightState.warning}</div>
        ) : null}
        <div className="action-row">
          <button
            className="secondary-button"
            disabled={isChecking}
            onClick={handleEnableDevices}
            type="button"
          >
            {preflightState.canRetry ? "Retry device check" : "Enable camera and microphone"}
          </button>
        </div>
      </div>

      <div className="preview-panel">
        <p className="eyebrow">Local preview</p>
        <div className="preview-frame">
          {stream && stream instanceof MediaStream ? (
            <video
              aria-label="Camera preview"
              autoPlay
              muted
              playsInline
              ref={videoRef}
            />
          ) : (
            <div className="preview-empty">
              <strong>Preview unavailable</strong>
              <p>
                The local camera preview appears here after device access is
                granted.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
