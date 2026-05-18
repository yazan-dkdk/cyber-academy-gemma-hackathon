import type { Metadata } from "next";
import Link from "next/link";
import { platformAreas } from "@/lib/platform-content";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Operator guidance for the Vincere Cryptex frontend, including access expectations and module overviews.",
};

export default function DocumentationPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 lg:px-8 lg:py-20">
      <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_28px_90px_rgba(3,9,24,0.42)] backdrop-blur-2xl lg:p-10">
        <div className="space-y-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-cyan-200/80">
            Platform Documentation
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">
            Operator-facing guidance for the frontend shell.
          </h1>
          <p className="max-w-3xl text-base leading-8 text-slate-300">
            This documentation page explains the current frontend structure, the expected use of
            each navigation area, and the access behavior presented in the interface. It avoids
            inventing backend behavior that does not exist yet.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/terms"
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 hover:border-cyan-300/30 hover:bg-white/[0.06]"
          >
            Terms of service
          </Link>
          <Link
            href="/privacy"
            className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 hover:border-pink-300/35 hover:bg-white/[0.06]"
          >
            Privacy policy
          </Link>
        </div>
      </section>

      <section
        id="access"
        className="rounded-[32px] border border-white/10 bg-[#09111d]/75 p-8 shadow-[0_24px_72px_rgba(2,8,23,0.35)] backdrop-blur-xl lg:p-10"
      >
        <div className="space-y-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-violet-200/80">
            Access & Sessions
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[0.1em] text-white">
            Login UI behavior
          </h2>
          <p className="max-w-3xl text-sm leading-7 text-slate-400">
            The landing page now uses the backend authentication service directly:
            <span className="text-slate-200"> Email</span>, <span className="text-slate-200">Password</span>,
            and a <span className="text-slate-200">Login</span> action that establishes an
            HttpOnly cookie-backed session. Protected views validate access through
            <span className="text-slate-200"> /api/auth/me</span> before rendering dashboard
            content.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-white">Credentials</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                The sign-in form submits directly to the NestJS auth API with secure cookie
                handling enabled.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-white">Session checks</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Dashboard access depends on the live session check, so unauthorized visitors are
                redirected back to the secure login route.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-sm font-semibold text-white">Extension-ready</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                Identity providers, MFA, and additional role-aware policy checks can still be
                layered in without redesigning the screen.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-cyan-200/80">
            Navigation Model
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[0.1em] text-white">
            What each header area represents
          </h2>
        </div>

        <div className="grid gap-5">
          {platformAreas.map((area) => (
            <section
              key={area.id}
              id={area.id}
              className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_60px_rgba(3,9,24,0.32)] backdrop-blur-xl"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl space-y-3">
                  <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-slate-500">
                    {area.label}
                  </p>
                  <h3 className="text-2xl font-semibold text-white">{area.title}</h3>
                  <p className="text-sm leading-7 text-slate-400">{area.summary}</p>
                </div>
                <Link
                  href={`/#${area.id}`}
                  className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 hover:border-cyan-300/35 hover:bg-white/[0.06]"
                >
                  View on home
                </Link>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {area.bullets.map((bullet) => (
                  <div
                    key={bullet}
                    className="rounded-2xl border border-white/8 bg-[#09111d]/68 p-4 text-sm leading-6 text-slate-300"
                  >
                    {bullet}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section
        id="alerts"
        className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_24px_72px_rgba(2,8,23,0.35)] backdrop-blur-xl lg:p-10"
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-pink-200/80">
              Header Utilities
            </p>
            <h2 className="mt-3 font-display text-3xl uppercase tracking-[0.1em] text-white">
              Notification and profile icons
            </h2>
          </div>
          <div className="space-y-4 text-sm leading-7 text-slate-400">
            <p>
              The notification icon points to this documentation section so the interface has a
              meaningful destination today while remaining ready for live alert feeds later.
            </p>
            <p>
              The profile icon points to the access guidance section, which is a realistic place
              to explain identity, roles, and future account settings in an early frontend build.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
