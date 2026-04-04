import Link from "next/link";
import { notFound } from "next/navigation";

import { EntryScreen } from "@/components/interview/entry-screen";
import { getInterviewSession } from "@/lib/interview/session";

type InterviewPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function InterviewPage({ params }: InterviewPageProps) {
  const { token } = await params;
  const session = await getInterviewSession(token);

  if (!session) {
    return (
      <main className="interview-shell">
        <section className="unavailable-panel">
          <p className="eyebrow">Interview unavailable</p>
          <h1>We could not open this interview link.</h1>
          <p>
            This interview session may be invalid, unavailable, or no longer
            active. Use the original candidate link or request a fresh session.
          </p>
          <div className="unavailable-actions">
            <Link className="primary-link" href="/">
              Return to home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (session.status === "expired") {
    notFound();
  }

  return <EntryScreen session={session} />;
}
