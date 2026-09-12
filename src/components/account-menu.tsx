"use client";

import Link from "next/link";
import { Avatar } from "@/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Viewer } from "@/lib/types";

/* The one signed-in control in every header: who you are, Settings, Sign out. */
export function AccountMenu({ viewer }: { viewer: Viewer }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Account: ${viewer.email}`}
        className="pressable flex size-9 items-center justify-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-gray-100"
      >
        <Avatar viewer={viewer} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          {viewer.name ? (
            <span className="text-small text-foreground">{viewer.name}</span>
          ) : null}
          <span className="mono truncate">{viewer.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/review">Inbox</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/api/logout" method="post">
          <DropdownMenuItem asChild>
            <button type="submit" className="text-left">
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
