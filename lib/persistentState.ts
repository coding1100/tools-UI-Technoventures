"use client";

import { Dispatch, SetStateAction, useEffect, useState } from "react";

/**
 * useState that survives reloads and moving between tools, kept in this
 * browser's localStorage for 7 days after the last change. Values must be
 * JSON-serialisable. Storage failures (private mode, quota) fall back to plain
 * in-memory state.
 */

const PREFIX = "team-tools:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Stored<T> = { value: T; expiresAt: number };

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as Stored<T>;
    if (stored.expiresAt > Date.now()) return stored.value;
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Unreadable or blocked storage: start fresh.
  }
  return undefined;
}

function write<T>(key: string, value: T) {
  try {
    const stored: Stored<T> = { value, expiresAt: Date.now() + TTL_MS };
    localStorage.setItem(PREFIX + key, JSON.stringify(stored));
  } catch {
    // Quota exceeded or blocked storage: keep working in memory.
  }
}

/** Removes everything this app stored, e.g. on sign-out on a shared computer. */
export function clearPersistentState() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Nothing to clear.
  }
}

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState(initial);
  const [loaded, setLoaded] = useState(false);

  // Read after mount so server and first client render match.
  useEffect(() => {
    const stored = read<T>(key);
    if (stored !== undefined) setValue(stored);
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (loaded) write(key, value);
  }, [key, value, loaded]);

  return [value, setValue];
}
