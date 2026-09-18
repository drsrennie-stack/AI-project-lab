"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

interface SaveCtx {
  state: SaveState;
  message: string;
  /** Wrap any Supabase write. Returns the result so callers can read data or error. */
  track: <T extends { error: { message: string } | null }>(p: PromiseLike<T>) => Promise<T>;
  fail: (message: string) => void;
  /** Register a callback that runs after every successful write. Returns an unsubscribe function. */
  onSaved: (fn: () => void) => () => void;
}

const Ctx = createContext<SaveCtx | null>(null);

export function SaveProvider({ children }: { children: ReactNode }) {
  const pending = useRef(0);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState("");
  const listeners = useRef(new Set<() => void>());
  const onSaved = useCallback((fn: () => void) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  const fail = useCallback((msg: string) => {
    setState("error");
    setMessage(msg);
  }, []);

  const track = useCallback(async <T extends { error: { message: string } | null }>(p: PromiseLike<T>) => {
    pending.current += 1;
    setState("saving");
    try {
      const result = await p;
      pending.current -= 1;
      if (result.error) {
        setState("error");
        setMessage(friendlyError(result.error.message));
      } else {
        listeners.current.forEach((fn) => fn());
        if (pending.current === 0) {
          setState("saved");
          setMessage("");
        }
      }
      return result;
    } catch (e) {
      pending.current -= 1;
      setState("error");
      setMessage(e instanceof Error ? friendlyError(e.message) : "Something went wrong");
      throw e;
    }
  }, []);

  const value = useMemo(() => ({ state, message, track, fail, onSaved }), [state, message, track, fail, onSaved]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function friendlyError(msg: string): string {
  if (/row-level security/i.test(msg)) return "You do not have permission to change that.";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Connection lost. Check your internet and try again.";
  return msg;
}

export function useSave() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSave must be used inside SaveProvider");
  return ctx;
}

export function SaveIndicator() {
  const { state, message } = useSave();
  const text = state === "saving" ? "SAVING..." : state === "saved" ? "SAVED" : state === "error" ? `NOT SAVED: ${message}` : "SAVED";
  const cls = state === "error" ? "chip-danger" : state === "saving" ? "chip-terra" : "chip";
  return (
    <span role="status" aria-live="polite" className={cls}>
      <span aria-hidden="true">{state === "saving" ? "○" : state === "error" ? "!" : "✓"}</span>
      {text}
    </span>
  );
}
