export function memoryMarkdown(patterns: string[]) {
  return [
    "# Sotto memory",
    "",
    "Private to this Gmail account. Recent owner corrections used as context, not sender blocks or model training.",
    "Returning a corrected email to the inbox removes that example. Existing conversations, allowed senders and protected mail remain protected.",
    "",
    ...(patterns.length
      ? patterns.map((p) => `- ${p.replace(/[\r\n]/g, " ")}`)
      : ["No learned corrections yet."]),
    "",
  ].join("\n");
}
