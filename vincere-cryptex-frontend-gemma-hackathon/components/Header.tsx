"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { ShieldLockIcon } from "@/components/ui/icons";
import { isStudentUser } from "@/lib/auth-roles";
import { isUnauthenticatedError, logout } from "@/lib/auth-client";

const guestNavLinks = [
  { href: "/courses", label: "Courses" },
  { href: "/labs", label: "Labs Preview" },
  { href: "/challenges", label: "Challenges" },
  { href: "/learning-paths", label: "Learning Paths" },
];

const studentNavLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/courses", label: "Courses" },
  { href: "/labs", label: "Labs" },
  { href: "/challenges", label: "Challenges" },
  { href: "/learning-paths", label: "Learning Paths" },
];

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { clearSession, status, user } = useAuthSession();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const isAuthenticated = status === "authenticated";
  const isStudent = isAuthenticated && isStudentUser(user);
  const navLinks = isStudent ? studentNavLinks : guestNavLinks;

  async function handleSignOut() {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);

    try {
      await logout();
      clearSession();

      startTransition(() => {
        router.push("/login");
      });
    } catch (error) {
      if (isUnauthenticatedError(error)) {
        clearSession();

        startTransition(() => {
          router.push("/login");
        });

        return;
      }

      setIsSigningOut(false);
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/24 bg-[#080b13]/78 backdrop-blur-2xl">
      <div className="mx-auto flex min-h-20 w-full max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-10 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="group min-w-0">
            <span className="block truncate font-display text-[1.35rem] font-bold uppercase text-white transition-colors group-hover:text-primary sm:text-[1.65rem]">
              Vincere Cryptex
            </span>
          </Link>

          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-primary/18 bg-primary/[0.03] text-primary shadow-[0_0_22px_rgba(0,240,255,0.12)] xl:hidden">
            <ShieldLockIcon className="h-5 w-5" />
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-x-4 gap-y-3 md:gap-x-6">
          {navLinks.map((link) => {
            const isRouteLink = !link.href.includes("#");
            const isActive =
              isRouteLink && (pathname === link.href || pathname.startsWith(`${link.href}/`));

            return (
              <Link
                key={link.href}
                href={link.href}
                data-active={isActive ? "true" : "false"}
                className="nav-link"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden h-10 w-10 shrink-0 items-center justify-center border border-primary/18 bg-primary/[0.03] text-primary shadow-[0_0_22px_rgba(0,240,255,0.12)] xl:inline-flex">
            <ShieldLockIcon className="h-5 w-5" />
          </span>

          {isAuthenticated ? (
            <button
              type="button"
              className="nav-action nav-action--primary"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? "Signing Out" : "Sign Out"}
            </button>
          ) : (
            <>
              <Link href="/login" className="nav-action nav-action--ghost">
                Sign In
              </Link>
              <Link href="/register" className="nav-action nav-action--primary">
                Create Account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
