import { Workspace } from "@/components/workspace";
import { dashboard } from "@/lib/server/dashboard";
import { redirect } from "next/navigation";
import { sessionWorkspace } from "@/lib/server/auth";
import { isDemo } from "@/lib/server/config";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDemo() && !(await sessionWorkspace())) redirect("/login");
  return <Workspace initial={await dashboard()}>{children}</Workspace>;
}
