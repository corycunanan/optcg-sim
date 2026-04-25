import Link from "next/link";
import {
  Badge,
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
} from "@/components/ui";
import { scenarios } from "@/lib/sandbox/scenarios";
import type { Scenario, ScenarioCategory } from "@/lib/sandbox/scenarios";

export const metadata = {
  title: "Sandbox — OPTCG Simulator",
};

const CATEGORY_ORDER: ScenarioCategory[] = [
  "draws",
  "movement",
  "combat",
  "ko",
  "life",
  "effects",
  "prompts",
  "phase",
];

const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  draws: "Draws",
  movement: "Movement",
  combat: "Combat",
  ko: "KO",
  life: "Life",
  effects: "Effects",
  prompts: "Prompts",
  phase: "Phase",
};

function groupByCategory(
  list: Scenario[],
): Record<ScenarioCategory, Scenario[]> {
  const out = {
    draws: [],
    movement: [],
    combat: [],
    ko: [],
    life: [],
    effects: [],
    prompts: [],
    phase: [],
  } as Record<ScenarioCategory, Scenario[]>;
  for (const s of list) out[s.category].push(s);
  return out;
}

export default function SandboxHubPage() {
  const grouped = groupByCategory(scenarios);

  return (
    <>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Sandbox</PageHeaderTitle>
          <PageHeaderDescription>
            Atomic animation scenarios and layout reference.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="mx-auto w-full max-w-5xl space-y-12 px-6 py-8">
        <section>
          <h2 className="mb-4 font-display text-xl font-bold tracking-tight text-content-primary">
            Layout Reference
          </h2>
          <Link
            href="/sandbox/scaffold"
            className="group block rounded-lg border border-border bg-surface-1 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-content-primary">
                  Board Scaffold
                </h3>
                <p className="mt-1 text-sm text-content-tertiary">
                  Static board layout for visual checks and design QA.
                </p>
              </div>
              <Badge variant="outline">Reference</Badge>
            </div>
          </Link>
        </section>

        {CATEGORY_ORDER.map((cat) => {
          const items = grouped[cat];
          return (
            <section key={cat}>
              <h2 className="mb-4 font-display text-xl font-bold tracking-tight text-content-primary">
                {CATEGORY_LABELS[cat]}
              </h2>

              {items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border bg-surface-1 px-6 py-10 text-center">
                  <p className="text-sm text-content-tertiary">
                    No scenarios yet
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((scenario) => (
                    <ScenarioTile key={scenario.id} scenario={scenario} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function ScenarioTile({ scenario }: { scenario: Scenario }) {
  return (
    <Link
      href={`/sandbox/${scenario.id}`}
      className="group flex h-full flex-col gap-3 rounded-lg border border-border bg-surface-1 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-bold text-content-primary">
          {scenario.title}
        </h3>
        <Badge variant="secondary">{CATEGORY_LABELS[scenario.category]}</Badge>
      </div>
      <p className="text-xs text-content-tertiary">{scenario.description}</p>
    </Link>
  );
}
