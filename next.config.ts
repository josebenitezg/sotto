import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["pg"],
  async redirects() {
    if (!process.env.APP_URL) return [];
    const canonical = new URL(process.env.APP_URL);
    if (
      canonical.protocol !== "https:" ||
      canonical.hostname === "localhost" ||
      canonical.hostname.startsWith("www.")
    )
      return [];
    // OAuth state cookies and the callback must use the same host.
    const alias = `www.${canonical.hostname}`.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: alias }],
        destination: `${canonical.origin}/:path*`,
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Native same-origin POST forms need their Origin for CSRF checks.
          // External destinations still receive no Referer.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
