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
  "playground",
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
  playground: "Playground",
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
  list: Scenario[]
): Record<ScenarioCategory, Scenario[]> {
  const out: Record<ScenarioCategory, Scenario[]> = {
    playground: [],
    draws: [],
    movement: [],
    combat: [],
    ko: [],
    life: [],
    effects: [],
    prompts: [],
    phase: [],
  };
  for (const s of list) out[s.category].push(s);
  return out;
}

export default function SandboxHubPage() {
  const grouped = groupByCategory(scenarios);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
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
          <h2 className="mb-4 font-display text-xl text-content-primary">
            Layout Reference
          </h2>
          <Link
            href="/sandbox/scaffold"
            className="group border-border bg-card hover:border-border-strong block rounded-lg border p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-content-primary text-base font-semibold">
                  Board Scaffold
                </h3>
                <p className="text-content-tertiary mt-1 text-sm">
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
              <h2 className="mb-4 font-display text-xl text-content-primary">
                {CATEGORY_LABELS[cat]}
              </h2>

              {items.length === 0 ? (
                <div className="border-border bg-card rounded-lg border border-dashed px-6 py-10 text-center">
                  <p className="text-content-tertiary text-sm">
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
    </div>
  );
}

function ScenarioTile({ scenario }: { scenario: Scenario }) {
  return (
    <Link
      href={`/sandbox/${scenario.id}`}
      className="group border-border bg-card hover:border-border-strong flex h-full flex-col gap-3 rounded-lg border p-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-content-primary text-sm font-semibold">
          {scenario.title}
        </h3>
        <Badge variant="secondary">{CATEGORY_LABELS[scenario.category]}</Badge>
      </div>
      <p className="text-content-tertiary text-xs">{scenario.description}</p>
    </Link>
  );
}
