import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const socialTitle = "Sotto — Cold sales emails, out of your inbox.";
const description =
  "Sotto moves cold sales emails to a Gmail label, shows why, and lets you undo.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://sotto.email"),
  title: "Sotto",
  description,
  openGraph: {
    type: "website",
    siteName: "Sotto",
    title: socialTitle,
    description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: socialTitle,
    description,
  },
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
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
