"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useAuthSession } from "@/components/auth/AuthSessionProvider";
import { CryptexHero } from "@/components/landing/CryptexHero";
import { isStudentUser } from "@/lib/auth-roles";
import {
  buttonMotion,
  cardMotion,
  revealContainer,
  revealItem,
  revealSoft,
  useLandingParallax,
  viewportOnce,
} from "@/components/landing/motion-utils";

const features = [
  {
    index: "01",
    title: "Interactive Cyber Ranges",
    description:
      "Deploy isolated practice environments and train inside realistic attack scenarios.",
    tone: "cyan",
    visual: "range",
  },
  {
    index: "02",
    title: "Real CTF Challenges",
    description:
      "Solve practical security missions, submit flags, use hints carefully, and build real skill.",
    tone: "purple",
    visual: "ctf",
  },
  {
    index: "03",
    title: "Structured Learning Paths",
    description:
      "Move from beginner concepts to Red Team and Blue Team specialization with clear progression.",
    tone: "pink",
    visual: "paths",
  },
];

const recentActivity = [
  "Linux privilege escalation lab resumed",
  "Web exploitation quiz scored",
  "Blue Team alert triage mission unlocked",
  "Network pivot challenge solved",
];

const redTeamSignals = [
  "nmap -sV target",
  "sqlmap --risk=2 --level=3",
  "payload staged",
  "exploit chain initialized",
  "reverse shell connected",
  "privilege escalation",
  "data exfiltration",
  "lateral movement",
];

const blueTeamBinaryRows = [
  "010011001001",
  "101100100110",
  "001101101010",
  "110010010011",
  "011010110100",
  "100101101001",
];

const MotionLink = motion.create(Link);

export function LandingPage() {
  const { status, user } = useAuthSession();
  const isStudent = status === "authenticated" && isStudentUser(user);
  const primaryHref = isStudent ? "/dashboard" : "/register";
  const ambientY = useLandingParallax(130);
  const glowY = useLandingParallax(-90);
  const visualY = useLandingParallax(-46);

  return (
    <div className="landing-page overflow-hidden">
      <motion.div className="landing-ambient-grid" style={{ y: ambientY }} aria-hidden="true" />
      <motion.div className="landing-ambient-glow" style={{ y: glowY }} aria-hidden="true" />

      <motion.section
        className="landing-hero relative mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-[1600px] items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:px-10 lg:py-20"
        initial="hidden"
        animate="visible"
        variants={revealContainer}
      >
        <motion.div className="relative z-10 max-w-3xl" variants={revealItem}>
          <motion.p className="landing-kicker" variants={revealSoft}>
            Cybersecurity Training Platform
          </motion.p>
          <h1 className="mt-5 font-display text-5xl font-bold leading-[0.96] text-white sm:text-6xl lg:text-7xl">
            <span className="typing-headline">Become the Operator They Can&rsquo;t Stop.</span>
          </h1>
          <motion.p
            className="mt-7 max-w-2xl font-display text-2xl font-semibold leading-tight text-primary sm:text-3xl"
            variants={revealSoft}
          >
            Break systems. Defend networks. Master cyber warfare.
          </motion.p>
          <motion.p className="mt-6 max-w-2xl text-base leading-8 text-foreground/72 sm:text-lg" variants={revealSoft}>
            Vincere Cryptex combines guided cybersecurity courses, realistic labs, CTF challenges,
            and progress-driven dashboards in one secure training platform.
          </motion.p>

          <motion.div className="mt-9 flex flex-col gap-4 sm:flex-row" variants={revealSoft}>
            <MotionLink
              href={primaryHref}
              className="landing-button landing-button--primary"
              variants={buttonMotion}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              Start Learning
            </MotionLink>
            <MotionLink
              href="/courses"
              className="landing-button landing-button--secondary"
              variants={buttonMotion}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              Explore Courses
            </MotionLink>
          </motion.div>
        </motion.div>

        <motion.div className="relative z-10 min-h-[420px] lg:min-h-[620px]" variants={revealItem} style={{ y: visualY }}>
          <CryptexHero />
        </motion.div>
      </motion.section>

      <motion.section
        id="labs-preview"
        className="landing-section mx-auto w-full max-w-[1600px] px-4 py-16 sm:px-6 lg:px-10 lg:py-24"
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={revealContainer}
      >
        <motion.div className="max-w-3xl" variants={revealItem}>
          <p className="landing-kicker">Training Stack</p>
          <h2 className="section-title-glitch mt-4 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
            Built for hands-on operators.
          </h2>
        </motion.div>

        <motion.div className="mt-10 grid gap-5 lg:grid-cols-3" variants={revealContainer}>
          {features.map((feature) => (
            <motion.article
              key={feature.title}
              className="landing-card"
              data-accent={feature.tone}
              variants={revealItem}
              whileHover={cardMotion.hover}
            >
              <div className="relative z-10 flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="feature-index">{feature.index}</p>
                  <h3 className="mt-5 font-display text-2xl font-semibold text-white">{feature.title}</h3>
                  <p className="mt-4 text-sm leading-7 text-foreground/68">{feature.description}</p>
                </div>
                <FeatureVisual type={feature.visual} />
              </div>
            </motion.article>
          ))}
        </motion.div>
      </motion.section>

      <motion.section
        className="landing-section border-y border-outline-variant/22"
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={revealContainer}
      >
        <div className="grid min-h-[560px] lg:grid-cols-2">
          <motion.article
            className="team-panel team-panel--red"
            variants={revealItem}
            whileHover={{ scale: 1.016 }}
            transition={{ type: "spring", stiffness: 150, damping: 22 }}
          >
            <span className="red-distortion" aria-hidden="true" />
            <div className="team-script-lanes" aria-hidden="true">
              {redTeamSignals.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
            <div className="relative z-10 max-w-xl">
              <p className="landing-kicker text-red-200/72">Red Team</p>
              <h2 className="section-title-glitch mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
                Offensive tradecraft, sharpened safely.
              </h2>
              <p className="mt-6 text-base leading-8 text-foreground/74">
                Learn web exploitation, vulnerability discovery, offensive methodology, and
                real-world attack thinking.
              </p>
              <MotionLink
                href="/learning-paths?track=red-team"
                className="landing-button landing-button--red mt-9"
                variants={buttonMotion}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
              >
                Explore Red Team
              </MotionLink>
            </div>
          </motion.article>

          <motion.article
            className="team-panel team-panel--blue"
            variants={revealItem}
            whileHover={{ scale: 1.016 }}
            transition={{ type: "spring", stiffness: 150, damping: 22 }}
          >
            <span className="blue-shield-pulse" aria-hidden="true" />
            <div className="blue-binary-rain" aria-hidden="true">
              {blueTeamBinaryRows.map((row) => (
                <span key={row}>{row}</span>
              ))}
            </div>
            <div className="blue-node-field" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className="relative z-10 max-w-xl">
              <p className="landing-kicker">Blue Team</p>
              <h2 className="section-title-glitch mt-4 font-display text-4xl font-bold text-white sm:text-5xl">
                Detection muscle for modern defense.
              </h2>
              <p className="mt-6 text-base leading-8 text-foreground/74">
                Learn detection, monitoring, incident response, hardening, and defensive security
                operations.
              </p>
              <MotionLink
                href="/learning-paths?track=blue-team"
                className="landing-button landing-button--primary mt-9"
                variants={buttonMotion}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
              >
                Explore Blue Team
              </MotionLink>
            </div>
          </motion.article>
        </div>
      </motion.section>

      <motion.section
        className="landing-section mx-auto grid w-full max-w-[1600px] gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.78fr_1.22fr] lg:px-10 lg:py-24"
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={revealContainer}
      >
        <motion.div className="max-w-xl self-center" variants={revealItem}>
          <p className="landing-kicker">Command Center</p>
          <h2 className="section-title-glitch mt-4 font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
            Every mission leaves telemetry.
          </h2>
          <p className="mt-6 text-base leading-8 text-foreground/70">
            Track momentum across courses, active labs, challenge submissions, and assessment
            scores from a dashboard that feels alive because the work is alive.
          </p>
        </motion.div>

        <motion.div className="dashboard-preview" variants={revealItem} whileHover={{ y: -8, scale: 1.01 }}>
          <div className="dashboard-preview__header">
            <div>
              <p className="dashboard-label">Operator Progress</p>
              <h3>Vincere Cryptex Command Center</h3>
            </div>
            <div className="dashboard-status">Live</div>
          </div>

          <div className="dashboard-grid">
            <MetricPanel label="Course Progress" value="68%" accent="cyan" />
            <MetricPanel label="Challenges Solved" value="42" accent="purple" />
            <MetricPanel label="Quiz Score" value="94%" accent="pink" />
          </div>

          <div className="active-lab-panel">
            <div>
              <p className="dashboard-label">Active Lab</p>
              <h4>Web Exploitation: Broken Access Control</h4>
            </div>
            <div className="lab-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
          </div>

          <div className="activity-panel">
            <p className="dashboard-label">Recent Activity</p>
            <div className="mt-4 grid gap-3">
              {recentActivity.map((activity) => (
                <div key={activity} className="activity-row">
                  <span />
                  {activity}
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.section>

      <motion.section
        className="landing-section px-4 py-16 sm:px-6 lg:px-10 lg:py-24"
        initial="hidden"
        whileInView="visible"
        viewport={viewportOnce}
        variants={revealContainer}
      >
        <motion.div className="final-cta mx-auto max-w-5xl px-6 py-12 text-center sm:px-10 lg:py-16" variants={revealItem}>
          <p className="landing-kicker">Access Granted</p>
          <h2 className="section-title-glitch mt-5 font-display text-4xl font-bold leading-tight text-white sm:text-6xl">
            Unlock the Vincere Cryptex.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-foreground/70">
            Start your cybersecurity journey with hands-on training, guided missions, and practical
            labs.
          </p>
          <MotionLink
            href={primaryHref}
            className="landing-button landing-button--primary mt-9"
            variants={buttonMotion}
            initial="rest"
            whileHover="hover"
            whileTap="tap"
          >
            Create Free Account
          </MotionLink>
        </motion.div>
      </motion.section>
    </div>
  );
}

function FeatureVisual({ type }: { type: string }) {
  if (type === "range") {
    return (
      <div className="feature-visual feature-visual--range" aria-hidden="true">
        <div className="range-zone range-zone--dmz">DMZ</div>
        <div className="range-zone range-zone--lab">LAB</div>
        <div className="range-zone range-zone--vault">VAULT</div>
        <span className="range-node range-node--entry" />
        <span className="range-node range-node--pivot" />
        <span className="range-node range-node--target" />
        <span className="range-route range-route--one" />
        <span className="range-route range-route--two" />
        <span className="range-scanner" />
      </div>
    );
  }

  if (type === "ctf") {
    return (
      <div className="feature-visual feature-visual--ctf" aria-hidden="true">
        <div className="terminal-row">
          <span>FLAG FOUND</span>
          <strong>OK</strong>
        </div>
        <div className="terminal-row">
          <span>HASH CHECK</span>
          <strong>OK</strong>
        </div>
        <div className="terminal-row">
          <span>SUBMIT FLAG</span>
          <strong>...</strong>
        </div>
        <div className="terminal-row">
          <span>ACCESS GRANTED</span>
          <strong>SUCCESS</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="feature-visual feature-visual--paths" aria-hidden="true">
      <span>Beginner</span>
      <span>Web Exploitation</span>
      <span>Red/Blue Path</span>
      <span>Advanced Labs</span>
    </div>
  );
}

function MetricPanel({
  accent,
  label,
  value,
}: {
  accent: "cyan" | "purple" | "pink";
  label: string;
  value: string;
}) {
  return (
    <div className="metric-panel" data-accent={accent}>
      <p className="dashboard-label">{label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <strong>{value}</strong>
        <div className="meter" aria-hidden="true">
          <span />
        </div>
      </div>
    </div>
  );
}
