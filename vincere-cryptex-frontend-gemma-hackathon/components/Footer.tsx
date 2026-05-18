import Link from "next/link";

const footerLinks = [
  { href: "/courses", label: "Courses" },
  { href: "/labs", label: "Labs Preview" },
  { href: "/challenges", label: "Challenges" },
  { href: "/learning-paths", label: "Learning Paths" },
  { href: "/documentation", label: "Documentation" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-outline-variant/20 bg-[#080b13]/92 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <p className="font-display text-2xl font-bold text-white">Vincere Cryptex</p>
          <p className="font-label text-[0.72rem] uppercase text-foreground/48">
            2026 Vincere Cryptex. All rights reserved.
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-3 xl:justify-center">
          {footerLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="font-label text-[0.72rem] uppercase text-foreground/46 hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3 font-label text-[0.72rem] uppercase text-foreground/52">
          <span className="h-2 w-2 bg-primary shadow-[0_0_14px_rgba(0,240,255,0.8)]" />
          System status: Operational
        </div>
      </div>
    </footer>
  );
}
