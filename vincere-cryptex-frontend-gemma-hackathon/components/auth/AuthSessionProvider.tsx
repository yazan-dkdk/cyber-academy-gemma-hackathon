"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  getCurrentUser,
  type AuthSessionPayload,
  type AuthSessionState,
  type AuthUser,
} from "@/lib/auth-client";
import { SESSION_EXPIRED_EVENT } from "@/lib/session-events";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSessionState | null;
  errorMessage: string | null;
};

type AuthSessionContextValue = AuthState & {
  refreshSession: () => Promise<AuthSessionPayload | null>;
  setAuthenticatedSession: (payload: AuthSessionPayload) => void;
  clearSession: () => void;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

const unauthenticatedState: AuthState = {
  status: "unauthenticated",
  user: null,
  session: null,
  errorMessage: null,
};

function createAuthenticatedState(payload: AuthSessionPayload): AuthState {
  return {
    status: "authenticated",
    user: payload.user,
    session: payload.session,
    errorMessage: null,
  };
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    status: "loading",
    user: null,
    session: null,
    errorMessage: null,
  });

  async function refreshSession() {
    try {
      const payload = await getCurrentUser();
      setState(createAuthenticatedState(payload));
      return payload;
    } catch {
      setState(unauthenticatedState);
      return null;
    }
  }

  function setAuthenticatedSession(payload: AuthSessionPayload) {
    setState(createAuthenticatedState(payload));
  }

  function clearSession() {
    setState(unauthenticatedState);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const payload = await getCurrentUser();
        if (isMounted) {
          setState(createAuthenticatedState(payload));
        }
      } catch {
        if (!isMounted) {
          return;
        }

        setState(unauthenticatedState);
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleSessionExpired() {
      setState(unauthenticatedState);

      if (pathname !== "/login") {
        router.replace("/login");
      }
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [pathname, router]);

  return (
    <AuthSessionContext.Provider
      value={{
        ...state,
        refreshSession,
        setAuthenticatedSession,
        clearSession,
      }}
    >
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useAuthSession must be used within an AuthSessionProvider.");
  }

  return context;
}
