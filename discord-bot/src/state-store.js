import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_STATE = {
  lastVoteEventCreatedAt: "",
  lastConfirmationCheckedAt: "",
  processedVoteEventIds: [],
  sentConfirmationSlotIds: []
};

export async function loadState(config, logger) {
  const statePath = resolveStatePath(config.stateFile);
  try {
    const raw = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      processedVoteEventIds: Array.isArray(parsed.processedVoteEventIds) ? parsed.processedVoteEventIds : [],
      sentConfirmationSlotIds: Array.isArray(parsed.sentConfirmationSlotIds) ? parsed.sentConfirmationSlotIds : []
    };
  } catch (error) {
    if (error.code !== "ENOENT") logger.warn("Could not load bot state; starting fresh.", error.message);
    return { ...DEFAULT_STATE };
  }
}

export async function saveState(config, state) {
  const statePath = resolveStatePath(config.stateFile);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function rememberId(list, id, max = 500) {
  if (!id) return list;
  const next = list.filter((entry) => entry !== id);
  next.push(id);
  return next.slice(-max);
}

function resolveStatePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
