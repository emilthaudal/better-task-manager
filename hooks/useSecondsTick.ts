import { useEffect, useRef, useState } from "react";

/**
 * Counts up by 1 every second while `enabled` is true.
 * Resets to 0 whenever `enabled` flips from false → true.
 */
export function useSecondsTick(enabled: boolean): number {
  const [seconds, setSeconds] = useState(0);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  });

  useEffect(() => {
    if (!enabled) return;
    // Reset counter to 0 when enabled flips true (safe: no cascading renders)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(() => 0);
    const id = setInterval(() => {
      if (enabledRef.current) setSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return seconds;
}
