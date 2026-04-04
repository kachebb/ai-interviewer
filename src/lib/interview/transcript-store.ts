import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { TranscriptSaveRequest } from "./types";

const transcriptDirectory = path.join(process.cwd(), "data", "interviews");

export async function saveInterviewTranscript(payload: TranscriptSaveRequest) {
  await mkdir(transcriptDirectory, { recursive: true });

  const filePath = path.join(transcriptDirectory, `${payload.interviewId}.json`);

  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return filePath;
}
