import type { Policy } from "./types";

export const DEFAULT_COLD_LABEL = "Sotto/Cold";
export const READING_LABEL = "Sotto/Reading";
export const MAX_LABEL_NAME_LENGTH = 225;
const reserved = new Set([
  "inbox",
  "sent",
  "draft",
  "drafts",
  "spam",
  "trash",
  "chats",
  "chat",
  "important",
  "starred",
  "unread",
  "all",
  "all mail",
  "category_personal",
  "category_social",
  "category_promotions",
  "category_updates",
  "category_forums",
]);
export function isUserLabelName(name: string) {
  return (
    name.length > 0 &&
    name.length <= MAX_LABEL_NAME_LENGTH &&
    name === name.trim() &&
    !/[\u0000-\u001f\u007f]/.test(name) &&
    !name.startsWith("^") &&
    !reserved.has(name.toLowerCase())
  );
}
export function coldLabelName(policy?: Pick<Policy, "coldLabelName">) {
  return policy?.coldLabelName || DEFAULT_COLD_LABEL;
}
