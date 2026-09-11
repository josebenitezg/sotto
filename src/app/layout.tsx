import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sotto — A quieter inbox",
  description:
    "Set unsolicited sales emails aside and make room for what matters.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en-US">
      <body>{children}</body>
    </html>
  );
}
