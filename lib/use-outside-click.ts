"use client";

import { useEffect, useRef, type RefObject } from "react";

// Closes a dropdown/popover when the user clicks anywhere outside `ref`'s
// element. Pass `active` so the listener only attaches while it's actually open.
export function useOutsideClick<T extends HTMLElement>(
  onOutside: () => void,
  active: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!active) return;
    function handle(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [active, onOutside]);
  return ref;
}
