import Link from "next/link";

export type LegalSection = {
  title: string;
  paragraphs: string[];
  bullets?: string[];
};

type LegalDocumentProps = {
  eyebrow: string;
  title: string;
  summary: string;
  lastUpdated: string;
  sections: LegalSection[];
};

export function LegalDocument({
  eyebrow,
  title,
  summary,
  lastUpdated,
  sections,
}: LegalDocumentProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-12 lg:px-8 lg:py-20">
      <section className="rounded-[32px] border border-white/10 bg-white/[0.04] p-8 shadow-[0_28px_90px_rgba(3,9,24,0.42)] backdrop-blur-2xl lg:p-10">
        <div className="space-y-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.34em] text-cyan-200/80">
            {eyebrow}
          </p>
          <h1 className="font-display text-4xl uppercase tracking-[0.1em] text-white sm:text-5xl">
            {title}
          </h1>
          <p className="max-w-3xl text-base leading-8 text-slate-300">{summary}</p>
          <p className="text-sm text-slate-500">Last updated: {lastUpdated}</p>
        </div>
      </section>

      <article className="rounded-[32px] border border-white/10 bg-[#09111d]/74 p-8 shadow-[0_24px_80px_rgba(2,8,23,0.38)] backdrop-blur-xl lg:p-10">
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="text-2xl font-semibold text-white">{section.title}</h2>
              <div className="space-y-4">
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-7 text-slate-400 sm:text-[15px]">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.bullets ? (
                <ul className="space-y-3 rounded-3xl border border-white/8 bg-white/[0.03] p-5 text-sm leading-7 text-slate-300">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </article>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/privacy"
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 hover:border-pink-300/35 hover:bg-white/[0.06]"
        >
          Privacy policy
        </Link>
        <Link
          href="/terms"
          className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-200 hover:border-cyan-300/35 hover:bg-white/[0.06]"
        >
          Terms of service
        </Link>
        <Link
          href="/documentation"
          className="rounded-full border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-2 text-sm text-cyan-100 hover:border-cyan-300/45 hover:bg-cyan-400/14"
        >
          Documentation
        </Link>
      </div>
    </div>
  );
}
