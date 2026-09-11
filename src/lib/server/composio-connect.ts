import { NextResponse } from "next/server";
import { query } from "./db";
import { opaque, hash } from "./crypto";
import { cookieOptions, sessionWorkspace } from "./auth";
import {
  composioCookie,
  createComposioLink,
  deleteComposioConnection,
} from "./composio";
import { queueComposioCleanup } from "./composio-cleanup";

export async function startComposioConnection(startFiltering: boolean) {
  const browser = opaque();
  // A private, unpredictable connection owner. It is authenticated by the
  // originating browser before any Google token can be exchanged.
  const userId = `sotto_${opaque()}`;
  const workspaceId = await sessionWorkspace();
  const link = await createComposioLink(userId);
  try {
    await query(
      "INSERT INTO composio_states(browser_hash,user_id,connection_id,workspace_id,start_filtering) VALUES($1,$2,$3,$4,$5)",
      [
        hash(browser),
        userId,
        link.connected_account_id,
        workspaceId,
        startFiltering,
      ],
    );
  } catch (error) {
    try {
      await deleteComposioConnection(link.connected_account_id);
    } catch {
      await queueComposioCleanup(link.connected_account_id);
    }
    throw error;
  }
  const response = NextResponse.redirect(link.redirect_url, 303);
  response.cookies.set(composioCookie, browser, {
    ...cookieOptions(),
    maxAge: 600,
  });
  return response;
}
