import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Sotto",
  description: "A quieter inbox. Cold sales emails, set aside in Gmail.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
