const STATUS_LABELS = {
  available: "Available",
  preferred: "Preferred",
  maybe: "Maybe",
  unavailable: "Unavailable"
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || "Unknown";
}

export function discordTimestamp(value, style = "F") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function formatTimeRange(startAt, endAt) {
  if (!startAt) return "TBD";
  if (!endAt) return discordTimestamp(startAt, "F");
  return `${discordTimestamp(startAt, "F")} - ${discordTimestamp(endAt, "t")}`;
}

export function formatShortRange(startAt, endAt) {
  if (!startAt) return "TBD";
  if (!endAt) return discordTimestamp(startAt, "f");
  return `${discordTimestamp(startAt, "f")} - ${discordTimestamp(endAt, "t")}`;
}

export function mentionUser(discordId) {
  return discordId ? `<@${discordId}>` : "";
}

export function trimForDiscord(value, maxLength = 1024) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text || "-";
  return `${text.slice(0, maxLength - 1)}…`;
}
