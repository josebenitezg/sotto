import { z } from "zod";
import { coldLabelName, isUserLabelName, READING_LABEL } from "../labels";
import type { Policy } from "../types";
import { HttpError } from "./auth";
import { query } from "./db";
import { Gmail } from "./google";

export const coldLabelNameSchema = z
  .string()
  .trim()
  .refine(
    (name) =>
      isUserLabelName(name) &&
      name.toLowerCase() !== READING_LABEL.toLowerCase(),
  );

// Called only after workspace ownership and mailbox-write checks, under the account lock.
export async function updateColdLabel(
  accountId: string,
  policy: Policy,
  name: string,
  gmail: Gmail,
) {
  name = coldLabelNameSchema.parse(name);
  const labels = await gmail.labels();
  const current =
    labels.find((label) => label.id === policy.coldLabelId) ??
    labels.find((label) => label.name === coldLabelName(policy));
  const target = labels.find(
    (label) => label.name.toLowerCase() === name.toLowerCase(),
  );
  if (target && target.id !== current?.id)
    throw new HttpError(
      409,
      "Another Gmail label already uses that name. Choose a different name.",
    );
  if (
    current &&
    (current.type === "system" || !/^Label_[a-zA-Z0-9_-]+$/.test(current.id))
  )
    throw new HttpError(409, "Choose a custom Gmail label name.");
  if (!current) {
    // Before the first move there may be no label to rename. Save the choice;
    // the existing move path creates it only when it is actually needed.
    await query(
      "UPDATE accounts SET policy=jsonb_set(policy - 'coldLabelId','{coldLabelName}',$2::jsonb) WHERE id=$1",
      [accountId, JSON.stringify(name)],
    );
    return;
  }
  const id = current.id;
  // Retain the immutable ID before renaming. A retry can recover if Gmail
  // succeeds but the response or final database write is interrupted.
  await query(
    "UPDATE accounts SET policy=jsonb_set(policy,'{coldLabelId}',$2::jsonb) WHERE id=$1",
    [accountId, JSON.stringify(id)],
  );
  if (current && current.name !== name) await gmail.renameLabel(id, name);
  await query(
    "UPDATE accounts SET policy=jsonb_set(policy,'{coldLabelName}',$2::jsonb) WHERE id=$1",
    [accountId, JSON.stringify(name)],
  );
}
