import { useEffect, useRef, useState } from "react";

/**
 * Counts up by 1 every second while `resetKey` is non-null.
 * Resets to 0 whenever `resetKey` changes (e.g. a new `lastUpdated` timestamp),
 * not just when it first becomes non-null — so the display stays in sync with
 * repeated background refreshes, not just the initial load.
 */
export function useSecondsTick(resetKey: unknown): number {
  const [seconds, setSeconds] = useState(0);
  const enabled = resetKey !== null && resetKey !== undefined;
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  });

  useEffect(() => {
    if (!enabled) return;
    // Reset counter to 0 whenever resetKey changes (safe: no cascading renders)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(() => 0);
    const id = setInterval(() => {
      if (enabledRef.current) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [resetKey, enabled]);
  return seconds;
}
