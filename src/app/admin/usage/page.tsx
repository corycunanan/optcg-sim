import Link from "next/link";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";
import { getUsageSummary } from "@/lib/metrics/usage";

export const dynamic = "force-dynamic";

/** OPT-1063: games started/completed and daily active players, last 30 days. */
export default async function AdminUsagePage() {
  const summary = await getUsageSummary();
  const newestFirst = [...summary.days].reverse();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Game usage</PageHeaderTitle>
          <PageHeaderDescription>
            Games and players for the last {summary.windowDays} days, since{" "}
            {summary.since} (UTC days).
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatBox label="Started" value={summary.totals.started} />
          <StatBox label="Finished" value={summary.totals.finished} />
          <StatBox label="Abandoned" value={summary.totals.abandoned} />
          <StatBox label="In progress" value={summary.totals.inProgress} />
          <StatBox label="Players" value={summary.totals.activePlayers} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="border-border bg-card rounded-lg border p-5 lg:col-span-2">
            <SectionTitle>By day</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-content-tertiary border-border border-b text-left">
                    <th className="py-2 pr-4 font-semibold">Day</th>
                    <NumericHeader>Started</NumericHeader>
                    <NumericHeader>Finished</NumericHeader>
                    <NumericHeader>Abandoned</NumericHeader>
                    <NumericHeader>Players</NumericHeader>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst.map((day) => (
                    <tr
                      key={day.day}
                      className="border-border text-content-secondary border-b last:border-b-0"
                    >
                      <td className="py-2 pr-4 font-mono">{day.day}</td>
                      <NumericCell value={day.started} />
                      <NumericCell value={day.finished} />
                      <NumericCell value={day.abandoned} />
                      <NumericCell value={day.activePlayers} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex flex-col gap-4">
            <CountList
              title="How games ended"
              rows={summary.endReasons.map((row) => ({
                label: row.reasonCode,
                count: row.count,
              }))}
              empty="No games ended in this window."
            />
            <CountList
              title="By mode"
              rows={summary.modes.map((row) => ({
                label: row.mode,
                count: row.count,
              }))}
              empty="No games started in this window."
            />
          </div>
        </div>

        <p className="text-content-tertiary mt-8 text-sm">
          Counts come from game sessions. A failed start removes its session, so
          it is not counted.{" "}
          <Link href="/admin" className="text-gold-600 hover:underline">
            Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-content-tertiary mb-4 text-sm font-semibold tracking-widest uppercase">
      {children}
    </h2>
  );
}

function NumericHeader({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pl-4 text-right font-semibold">{children}</th>;
}

function NumericCell({ value }: { value: number }) {
  return (
    <td className="text-content-primary py-2 pl-4 text-right tabular-nums">
      {value.toLocaleString()}
    </td>
  );
}

function CountList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { label: string; count: number }[];
  empty: string;
}) {
  return (
    <section className="border-border bg-card rounded-lg border p-5">
      <SectionTitle>{title}</SectionTitle>
      {rows.length === 0 ? (
        <p className="text-content-tertiary text-sm">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="text-content-secondary font-mono">
                {row.label}
              </span>
              <span className="text-content-primary font-semibold tabular-nums">
                {row.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-border bg-card rounded-lg border p-5">
      <div className="text-content-tertiary text-sm font-semibold tracking-widest uppercase">
        {label}
      </div>
      <div className="text-content-primary mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value.toLocaleString()}
      </div>
    </div>
  );
}
