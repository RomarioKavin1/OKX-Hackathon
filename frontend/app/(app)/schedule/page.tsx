import Link from "next/link";
import type { Metadata } from "next";
import { Panel, Pill, SectionHeading, Stat, buttonClasses, cx } from "@/components/ui";
import { WC2026, WC_GROUPS, WC_FIXTURES, WC_FLAG, type WCMatch } from "@/lib/data/worldcup2026";

export const metadata: Metadata = {
  title: "Schedule",
  description: "The real 2026 FIFA World Cup draw and group-stage fixtures.",
};

function fmtKickoff(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", month: "short", timeZone: "UTC",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(d);
  return { day, time: `${time} UTC` };
}

const PLAYABLE = new Set(["Brazil", "France", "Argentina", "England"]);

function Side({ team, align }: { team: string; align: "left" | "right" }) {
  const playable = PLAYABLE.has(team);
  return (
    <div className={cx("flex min-w-0 items-center gap-2", align === "right" && "flex-row-reverse text-right")}>
      <span aria-hidden className="text-lg leading-none">{WC_FLAG[team]}</span>
      <span className={cx("truncate text-sm", playable ? "font-semibold text-ink" : "text-ink-2")}>
        {team}
      </span>
    </div>
  );
}

function FixtureRow({ m }: { m: WCMatch }) {
  const { day, time } = fmtKickoff(m.kickoff);
  return (
    <li className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-3 sm:gap-5">
      <Side team={m.home} align="right" />
      <div className="flex flex-col items-center">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{day}</span>
        <span className="display text-base leading-none text-ink">{time.replace(" UTC", "")}</span>
        <span className="text-[10px] text-muted">{m.city}</span>
      </div>
      <Side team={m.away} align="left" />
    </li>
  );
}

export default function SchedulePage() {
  const featured = WC_GROUPS.filter((g) => ["C", "I", "J", "L"].includes(g.letter));
  const start = new Date(WC2026.start);
  const end = new Date(WC2026.end);
  const window = `${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(start)} – ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(end)}`;

  return (
    <div className="flex flex-col gap-10 py-2">
      <SectionHeading
        kicker="The tournament"
        title="2026 World Cup"
        action={
          <Link href="/play" className={buttonClasses("cta", "md")}>
            Set your XI →
          </Link>
        }
      />

      {/* tournament meta */}
      <Panel variant="ink" className="grid gap-6 p-6 sm:grid-cols-4">
        <Stat value={window} label="Group stage opens" tone="on-panel" />
        <Stat value={WC2026.teams} label="Teams" tone="on-panel" />
        <Stat value={WC2026.groups} label="Groups" tone="on-panel" />
        <div className="sm:col-span-1">
          <div className="display text-lg leading-tight text-on-panel">{WC2026.hosts}</div>
          <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-on-panel-muted">Hosts</div>
        </div>
      </Panel>

      {/* featured fixtures */}
      <section className="flex flex-col gap-5">
        <SectionHeading
          kicker="Your squads play"
          title="Featured fixtures"
        />
        <p className="-mt-2 max-w-2xl text-sm text-muted">
          PANENKA ships player cards for Brazil, France, Argentina and England. Here is every
          group-stage match for their four groups, drawn live on 5 December 2025.
        </p>
        <div className="grid gap-5 lg:grid-cols-2">
          {featured.map((g) => {
            const teamName = g.teams.find((t) => t.playable)!.name;
            const matches = WC_FIXTURES.filter((m) => m.group === g.letter);
            return (
              <Panel key={g.letter} className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-line bg-paper-3 px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <Pill tone="cobalt">Group {g.letter}</Pill>
                    <span className="text-sm font-semibold text-ink">
                      {WC_FLAG[teamName]} {teamName}
                    </span>
                  </span>
                  <Link href="/portfolio" className="text-xs font-semibold text-cobalt-ink hover:underline">
                    Your cards →
                  </Link>
                </div>
                <ul className="divide-y divide-line">
                  {matches.map((m, i) => (
                    <FixtureRow key={i} m={m} />
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      </section>

      {/* full draw */}
      <section className="flex flex-col gap-5">
        <SectionHeading kicker="48 teams" title="The full draw" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WC_GROUPS.map((g) => (
            <Panel key={g.letter} className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="display text-xl text-flame">Group {g.letter}</span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {g.teams.map((t) => (
                  <li
                    key={t.name}
                    className={cx(
                      "flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                      t.playable ? "bg-cobalt/10 font-semibold text-ink" : "text-ink-2",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="text-base leading-none">{t.flag}</span>
                      {t.name}
                    </span>
                    {t.playable && <Pill tone="cobalt">Cards</Pill>}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      </section>

      <p className="text-xs text-muted">
        Live scores and scoring begin when the tournament kicks off on{" "}
        {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(start)}.
        Until then, the on-chain scoring demo replays a finished match.
      </p>
    </div>
  );
}
