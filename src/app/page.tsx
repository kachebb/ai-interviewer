import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home-shell">
      <section className="home-card">
        <p className="eyebrow">AI Interviewer</p>
        <h1>Candidate Interview Entry</h1>
        <p className="lede">
          This environment is prepared for self-serve interview links. Use the
          demo session below to review the entry flow.
        </p>
        <Link className="primary-link" href="/interview/demo-rd-001">
          Open demo interview
        </Link>
        <Link className="secondary-button" href="/transcripts">
          View transcripts
        </Link>
      </section>
    </main>
  );
}
