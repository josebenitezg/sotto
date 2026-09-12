import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { sessionViewer, sessionWorkspace } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/config";
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const workspaceId = await sessionWorkspace();
  const inApp = isDemo() || !!workspaceId;
  const viewer = workspaceId ? await sessionViewer() : null;
  return (
    <div className="flex min-h-svh flex-col">
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-sm focus:bg-background-2 focus:px-3 focus:py-2"
        href="#content"
      >
        Skip to content
      </a>
      <PublicHeader inApp={inApp} viewer={viewer} />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
