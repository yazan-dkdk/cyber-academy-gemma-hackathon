import type { Metadata } from "next";
import Image from "next/image";
import { GlowCard } from "@/components/ui/GlowCard";
import {
  BoltIcon,
  DocumentTextIcon,
  ShieldKeyIcon,
  ShieldLockIcon,
} from "@/components/ui/icons";

export const metadata: Metadata = {
  title: "Interactive Cybersecurity Labs",
  description: "Coming soon preview for Vincere Cryptex isolated cybersecurity labs.",
};

const capabilitySignals = [
  "Browser labs",
  "Docker-powered environments",
  "Safe isolated practice",
  "Enterprise simulation",
  "Red Team / Blue Team exercises",
];

const previewLabs = [
  {
    title: "Web Exploitation Lab",
    difficulty: "Intermediate",
    category: "Web Security",
    image: "/images/02-courses/web-application-attack-lab.png",
    teaser: "Inspect vulnerable request flows and practice evidence-driven remediation in a contained browser lab.",
  },
  {
    title: "Network Defense Lab",
    difficulty: "Beginner",
    category: "Blue Team",
    image: "/images/02-courses/network-defense-foundations.png",
    teaser: "Trace defensive telemetry, firewall decisions, and segmentation signals inside a safe training range.",
  },
  {
    title: "SOC Investigation Lab",
    difficulty: "Intermediate",
    category: "Incident Response",
    image: "/images/02-courses/incident-response-operations.png",
    teaser: "Triage alerts, timeline suspicious activity, and document escalation paths from simulated enterprise data.",
  },
  {
    title: "Active Directory Lab",
    difficulty: "Advanced",
    category: "Enterprise Simulation",
    image: "/images/02-courses/advanced-threat-hunting.png",
    teaser: "Follow identity signals, access paths, and blue-team containment decisions in a future enterprise scenario.",
  },
];

const phaseMarkers = [
  { label: "Runtime", value: "Preparing", tone: "cyan" },
  { label: "Isolation", value: "Designed", tone: "purple" },
  { label: "Access", value: "Coming Soon", tone: "pink" },
];

function toneClass(tone: string) {
  if (tone === "cyan") {
    return "border-primary/24 bg-primary/10 text-primary";
  }

  if (tone === "purple") {
    return "border-secondary/24 bg-secondary/10 text-secondary";
  }

  return "border-tertiary/24 bg-tertiary/10 text-tertiary";
}

export default function LabsPage() {
  return (
    <section className="dashboard-stage dashboard-3d-space dashboard-scan-energy relative flex flex-1 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
      <div className="dashboard-bg-grid pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.025)_1px,transparent_1px)] bg-[size:34px_34px] opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[linear-gradient(180deg,rgba(0,240,255,0.12),rgba(168,85,247,0.08)_44%,transparent_82%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-7">
        <section className="relative min-h-[34rem] overflow-hidden border border-primary/18 bg-[#060914] shadow-[0_0_48px_rgba(0,240,255,0.08)]">
          <Image
            src="/images/02-courses/web-application-attack-lab.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-36"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,17,0.96),rgba(5,8,17,0.72)_48%,rgba(5,8,17,0.3))]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,240,255,0.08)_1px,transparent_1px)] bg-[size:100%_44px] opacity-28" />

          <div className="relative z-10 flex min-h-[34rem] flex-col justify-between gap-10 px-6 py-8 sm:px-8 lg:px-10">
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-center gap-3">
                <span className="border border-primary/28 bg-primary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-primary">
                  Labs Phase
                </span>
                <span className="border border-secondary/28 bg-secondary/10 px-3 py-1 font-label text-[0.68rem] uppercase text-secondary">
                  Coming Soon
                </span>
              </div>
              <h1 className="mt-6 font-display text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Interactive Cybersecurity Labs &mdash; Coming Soon
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-foreground/74 sm:text-lg">
                Advanced isolated browser-based labs are currently under preparation for the next platform phase.
              </p>
              <p className="mt-4 max-w-2xl border border-tertiary/24 bg-tertiary/10 px-4 py-3 text-sm leading-6 text-foreground/72">
                Lab execution is intentionally disabled in this demo build.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {phaseMarkers.map((marker) => (
                <div key={marker.label} className={`border px-4 py-4 ${toneClass(marker.tone)}`}>
                  <p className="font-label text-[0.6rem] uppercase opacity-72">{marker.label}</p>
                  <p className="mt-2 text-lg font-semibold text-white">{marker.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          {capabilitySignals.map((signal, index) => {
            const Icon = index % 3 === 0 ? ShieldLockIcon : index % 3 === 1 ? ShieldKeyIcon : BoltIcon;

            return (
              <div
                key={signal}
                className="dashboard-card-3d border border-white/8 bg-white/[0.025] px-4 py-4 transition-all duration-300 hover:border-primary/24 hover:bg-primary/[0.045]"
              >
                <span className="flex h-10 w-10 items-center justify-center border border-primary/24 bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-4 text-sm font-semibold leading-6 text-white">{signal}</p>
              </div>
            );
          })}
        </section>

        <section className="grid gap-6 lg:grid-cols-4">
          {previewLabs.map((lab) => (
            <GlowCard
              key={lab.title}
              tone="cyan"
              className="group dashboard-card-3d dashboard-border-sweep dashboard-premium-card overflow-hidden"
            >
              <article className="relative z-10 flex h-full flex-col">
                <div className="relative h-44 overflow-hidden border-b border-white/8 bg-[#090c16]">
                  <Image
                    src={lab.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                    className="object-cover opacity-72 transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(5,8,17,0.82))]" />
                  <span className="absolute left-4 top-4 border border-tertiary/28 bg-tertiary/10 px-3 py-1 font-label text-[0.58rem] uppercase text-tertiary backdrop-blur-sm">
                    Coming Soon
                  </span>
                </div>

                <div className="flex flex-1 flex-col px-5 py-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center border border-secondary/24 bg-secondary/10 text-secondary">
                      <DocumentTextIcon className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-display text-xl font-semibold text-white">{lab.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-foreground/62">{lab.teaser}</p>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/8 pt-4">
                    <div>
                      <p className="font-label text-[0.56rem] uppercase text-foreground/38">
                        Difficulty
                      </p>
                      <p className="mt-1 text-sm font-semibold text-primary">{lab.difficulty}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-label text-[0.56rem] uppercase text-foreground/38">
                        Category
                      </p>
                      <p className="mt-1 text-sm font-semibold text-secondary">{lab.category}</p>
                    </div>
                  </div>
                </div>
              </article>
            </GlowCard>
          ))}
        </section>
      </div>
    </section>
  );
}
