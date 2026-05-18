"use client";

import { useCallback, useRef, type PointerEvent } from "react";
import { useReducedMotion } from "framer-motion";

type CardTiltOptions = {
  maxRotateX?: number;
  maxRotateY?: number;
  parallax?: number;
};

export function useCardTilt<TElement extends HTMLElement>(options: CardTiltOptions = {}) {
  const ref = useRef<TElement>(null);
  const frameRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();
  const {
    maxRotateX = 14,
    maxRotateY = 17,
    parallax = 42,
  } = options;

  const handlePointerMove = useCallback(
    (event: PointerEvent<TElement>) => {
      if (reduceMotion || !ref.current) {
        return;
      }

      const bounds = ref.current.getBoundingClientRect();
      const relativeX = (event.clientX - bounds.left) / bounds.width;
      const relativeY = (event.clientY - bounds.top) / bounds.height;
      const rotateY = (relativeX - 0.5) * maxRotateY;
      const rotateX = (0.5 - relativeY) * maxRotateX;

      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }

      frameRef.current = window.requestAnimationFrame(() => {
        if (!ref.current) {
          return;
        }

        ref.current.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
        ref.current.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
        ref.current.style.setProperty("--parallax-x", `${((relativeX - 0.5) * parallax).toFixed(2)}px`);
        ref.current.style.setProperty("--parallax-y", `${((relativeY - 0.5) * parallax).toFixed(2)}px`);
        ref.current.style.setProperty("--pointer-x", `${(relativeX * 100).toFixed(2)}%`);
        ref.current.style.setProperty("--pointer-y", `${(relativeY * 100).toFixed(2)}%`);
      });
    },
    [maxRotateX, maxRotateY, parallax, reduceMotion],
  );

  const handlePointerLeave = useCallback(() => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!ref.current) {
      return;
    }

    ref.current.style.setProperty("--tilt-x", "0deg");
    ref.current.style.setProperty("--tilt-y", "0deg");
    ref.current.style.setProperty("--parallax-x", "0px");
    ref.current.style.setProperty("--parallax-y", "0px");
    ref.current.style.setProperty("--pointer-x", "50%");
    ref.current.style.setProperty("--pointer-y", "50%");
  }, []);

  return {
    ref,
    tiltHandlers: reduceMotion
      ? {}
      : {
          onPointerMove: handlePointerMove,
          onPointerLeave: handlePointerLeave,
        },
  };
}
