import Link from "next/link";
import { notFound } from "next/navigation";

import { getInterviewTranscript } from "@/lib/interview/transcript-query";

type TranscriptDetailPageProps = {
  params: Promise<{
    interviewId: string;
  }>;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function TranscriptDetailPage({
  params,
}: TranscriptDetailPageProps) {
  const { interviewId } = await params;
  const transcript = await getInterviewTranscript(interviewId);

  if (!transcript) {
    notFound();
  }

  return (
    <main className="transcript-browser-shell">
      <section className="transcript-browser-card">
        <header className="transcript-browser-header">
          <div>
            <p className="eyebrow">Developer view</p>
            <h1>{transcript.candidateName}</h1>
            <p className="lede">{transcript.roleTitle}</p>
          </div>
          <div className="browser-actions">
            <Link className="secondary-button" href="/transcripts">
              Back to transcripts
            </Link>
            <Link className="secondary-button" href={`/interview/${transcript.token}`}>
              Reopen interview link
            </Link>
          </div>
        </header>

        <div className="transcript-detail-grid">
          <section className="transcript-summary-panel">
            <p className="eyebrow">Metadata</p>
            <dl className="transcript-meta-grid">
              <div>
                <dt>Interview ID</dt>
                <dd>{transcript.interviewId}</dd>
              </div>
              <div>
                <dt>Token</dt>
                <dd>{transcript.token}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{transcript.status}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatTimestamp(transcript.startedAt)}</dd>
              </div>
              <div>
                <dt>Saved</dt>
                <dd>{formatTimestamp(transcript.savedAt)}</dd>
              </div>
              <div>
                <dt>Total entries</dt>
                <dd>{transcript.entries.length}</dd>
              </div>
            </dl>
          </section>

          <section className="transcript-detail-panel">
            <p className="eyebrow">Conversation</p>
            <div className="transcript-list detail">
              {transcript.entries.map((entry) => (
                <article
                  className={`transcript-entry ${entry.role} ${entry.status}`}
                  key={entry.itemId}
                >
                  <div className="transcript-meta">
                    <strong>
                      {entry.role === "assistant" ? "Interviewer" : "Candidate"}
                    </strong>
                    <span>{formatTimestamp(entry.updatedAt)}</span>
                  </div>
                  <p>{entry.text}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
