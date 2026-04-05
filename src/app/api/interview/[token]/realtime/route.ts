import { NextResponse } from "next/server";

import { buildRealtimeCallPayload } from "@/lib/interview/realtime-config";
import { getInterviewSession } from "@/lib/interview/session";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { token } = await context.params;
  const session = await getInterviewSession(token);

  if (!session) {
    return new NextResponse("Interview link unavailable.", { status: 404 });
  }

  const launchToken = new URL(request.url).searchParams.get("launchToken");
  if (launchToken !== `launch-${session.token}`) {
    return new NextResponse("Interview launch token is invalid.", { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new NextResponse(
      "OPENAI_API_KEY is missing. Add it to run the live voice interviewer.",
      { status: 503 },
    );
  }

  const offerSdp = await request.text();
  if (!offerSdp.trim()) {
    return new NextResponse("WebRTC offer SDP is required.", { status: 400 });
  }

  const sessionConfig = JSON.stringify(buildRealtimeCallPayload(session));

  const formData = new FormData();
  formData.set("sdp", offerSdp);
  formData.set("session", sessionConfig);

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "X-Client-Request-Id": `interview-${token}-${Date.now()}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  if (!response.ok) {
    return new NextResponse(responseText || "Realtime session bootstrap failed.", {
      status: response.status,
    });
  }

  return new NextResponse(responseText, {
    status: 200,
    headers: {
      "Content-Type": "application/sdp",
    },
  });
}
