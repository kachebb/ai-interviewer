import { expect, test } from "@playwright/test";

const VALID_TOKEN = "/interview/demo-rd-001";
const INVALID_TOKEN = "/interview/not-a-real-token";

function addSuccessfulMediaMock(page: Parameters<typeof test>[0]["page"]) {
  return page.addInitScript(() => {
    const createTrack = (kind: "audio" | "video") => ({
      kind,
      enabled: true,
      readyState: "live",
      stop() {},
    });

    const createStream = (includeVideo: boolean) => ({
      getAudioTracks: () => [createTrack("audio")],
      getVideoTracks: () => (includeVideo ? [createTrack("video")] : []),
    });

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) {
      return;
    }

    mediaDevices.getUserMedia = async () => createStream(true) as MediaStream;
    mediaDevices.enumerateDevices = async () =>
      [
        { deviceId: "camera-1", kind: "videoinput", label: "Virtual Camera", groupId: "g1", toJSON: () => ({}) },
        { deviceId: "microphone-1", kind: "audioinput", label: "Virtual Microphone", groupId: "g1", toJSON: () => ({}) },
      ] as MediaDeviceInfo[];
  });
}

function addAudioOnlyMediaMock(page: Parameters<typeof test>[0]["page"]) {
  return page.addInitScript(() => {
    const createTrack = (kind: "audio" | "video") => ({
      kind,
      enabled: true,
      readyState: "live",
      stop() {},
    });

    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) {
      return;
    }

    mediaDevices.getUserMedia = async () =>
      ({
        getAudioTracks: () => [createTrack("audio")],
        getVideoTracks: () => [],
      }) as MediaStream;

    mediaDevices.enumerateDevices = async () =>
      [
        { deviceId: "microphone-1", kind: "audioinput", label: "Virtual Microphone", groupId: "g1", toJSON: () => ({}) },
      ] as MediaDeviceInfo[];
  });
}

function addPermissionFailureMock(page: Parameters<typeof test>[0]["page"]) {
  return page.addInitScript(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) {
      return;
    }

    mediaDevices.getUserMedia = async () => {
      const error = new Error("Permission denied");
      error.name = "NotAllowedError";
      throw error;
    };
  });
}

test("@token-shell renders the interview route shell", async ({ page }) => {
  await page.goto(VALID_TOKEN);

  await expect(
    page.getByRole("heading", { name: "Prepare to start your interview" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Start interview" })).toBeDisabled();
});

test("@token-route resolves valid and invalid interview links", async ({ page }) => {
  await page.goto(VALID_TOKEN);
  await expect(page.getByText("Lin Tao")).toBeVisible();
  await expect(page.getByText("Small Molecule R&D Scientist")).toBeVisible();

  await page.goto(INVALID_TOKEN);
  await expect(
    page.getByRole("heading", { name: "We could not open this interview link." }),
  ).toBeVisible();
});

test("@start-flow starts the interview after readiness passes", async ({ page }) => {
  await addSuccessfulMediaMock(page);
  await page.goto(VALID_TOKEN);

  await page.getByRole("button", { name: "Enable camera and microphone" }).click();
  await expect(page.getByText("Camera is active and ready for the interview.")).toBeVisible();
  await expect(page.getByText("Microphone is active and ready for the interview.")).toBeVisible();

  const startButton = page.getByRole("button", { name: "Start interview" });
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await expect(page.getByRole("heading", { name: "Voice interview in progress" })).toBeVisible();
});

test("@preflight shows readiness after explicit device enable", async ({ page }) => {
  await addSuccessfulMediaMock(page);
  await page.goto(VALID_TOKEN);

  await page.getByRole("button", { name: "Enable camera and microphone" }).click();

  await expect(page.getByText("Devices confirmed. Review the preview, then start the interview.")).toBeVisible();
  await expect(page.getByText("Camera is active and ready for the interview.")).toBeVisible();
  await expect(page.getByText("Microphone is active and ready for the interview.")).toBeVisible();
});

test("@camera-required blocks start when camera readiness fails", async ({ page }) => {
  await addAudioOnlyMediaMock(page);
  await page.goto(VALID_TOKEN);

  await page.getByRole("button", { name: "Enable camera and microphone" }).click();

  await expect(page.getByText("Camera access is required before the interview can begin.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start interview" })).toBeDisabled();
});

test("@permission-failure shows inline retry guidance", async ({ page }) => {
  await addPermissionFailureMock(page);
  await page.goto(VALID_TOKEN);

  await page.getByRole("button", { name: "Enable camera and microphone" }).click();

  await expect(page.locator(".warning-banner")).toContainText(
    "Browser permissions are blocked. Allow camera and microphone access, then retry.",
  );
  await expect(page.getByRole("button", { name: "Retry device check" })).toBeVisible();
});
