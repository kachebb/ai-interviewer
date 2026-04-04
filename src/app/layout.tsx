import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Interviewer",
  description: "Candidate interview entry flow for AI-led interviews.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
