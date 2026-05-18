"use client";

export const SESSION_EXPIRED_EVENT = "vincere-cryptex:session-expired";

export function notifySessionExpired() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
