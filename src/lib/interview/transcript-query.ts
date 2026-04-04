import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import type { PersistedInterviewDraft } from "./types";

const transcriptDirectory = path.join(process.cwd(), "data", "interviews");

export type TranscriptListItem = {
  interviewId: string;
  token: string;
  status: "draft" | "completed";
  startedAt: string;
  savedAt: string;
  candidateName: string;
  roleTitle: string;
  entryCount: number;
  lastUtterance: string | null;
};

async function readTranscriptFile(fileName: string) {
  const filePath = path.join(transcriptDirectory, fileName);
  const contents = await readFile(filePath, "utf8");
  return JSON.parse(contents) as PersistedInterviewDraft;
}

export async function listInterviewTranscripts(): Promise<TranscriptListItem[]> {
  try {
    const files = await readdir(transcriptDirectory);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    const transcripts = await Promise.all(
      jsonFiles.map(async (fileName) => {
        const transcript = await readTranscriptFile(fileName);
        const finalEntries = transcript.entries.filter(
          (entry) => entry.status === "final",
        );

        return {
          interviewId: transcript.interviewId,
          token: transcript.token,
          status: transcript.status,
          startedAt: transcript.startedAt,
          savedAt: transcript.savedAt,
          candidateName: transcript.candidateName,
          roleTitle: transcript.roleTitle,
          entryCount: finalEntries.length,
          lastUtterance: finalEntries.at(-1)?.text ?? null,
        } satisfies TranscriptListItem;
      }),
    );

    return transcripts.sort((left, right) =>
      right.savedAt.localeCompare(left.savedAt),
    );
  } catch {
    return [];
  }
}

export async function getInterviewTranscript(interviewId: string) {
  try {
    return await readTranscriptFile(`${interviewId}.json`);
  } catch {
    return null;
  }
}
