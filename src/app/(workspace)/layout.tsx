import { Workspace } from "@/components/workspace";
import { dashboard } from "@/lib/server/dashboard";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Workspace initial={await dashboard()}>{children}</Workspace>;
}
