import { NextResponse } from "next/server";

import { saveInterviewTranscript } from "@/lib/interview/transcript-store";
import type { TranscriptSaveRequest, TranscriptSaveResult } from "@/lib/interview/types";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const payload = (await request.json()) as TranscriptSaveRequest;

  if (payload.token !== token) {
    const error: TranscriptSaveResult = {
      ok: false,
      message: "Transcript token mismatch.",
    };
    return NextResponse.json(error, { status: 400 });
  }

  const filePath = await saveInterviewTranscript(payload);
  const response: TranscriptSaveResult = {
    ok: true,
    savedAt: payload.savedAt,
    filePath,
  };

  return NextResponse.json(response);
}
