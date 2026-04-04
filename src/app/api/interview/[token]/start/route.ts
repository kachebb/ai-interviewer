import { NextResponse } from "next/server";

import { createInterviewId, createLaunchToken } from "@/lib/interview/session";
import type { StartInterviewResult } from "@/lib/interview/types";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  const launchToken = await createLaunchToken(token);

  if (!launchToken) {
    const payload: StartInterviewResult = {
      ok: false,
      message: "Interview link unavailable.",
    };

    return NextResponse.json(payload, { status: 404 });
  }

  const payload: StartInterviewResult = {
    ok: true,
    token,
    launchToken,
    interviewId: createInterviewId(token),
    nextStep: "realtime-room",
  };

  return NextResponse.json(payload);
}
