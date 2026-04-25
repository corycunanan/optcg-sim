import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
  PageHeaderDescription,
} from "@/components/ui";
import { scenarios } from "@/lib/sandbox/scenarios";

export const metadata = {
  title: "Scenario — OPTCG Simulator",
};

export default async function SandboxScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) notFound();

  return (
    <>
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{scenario.title}</PageHeaderTitle>
          <PageHeaderDescription>{scenario.description}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="rounded-lg border border-dashed border-border bg-surface-1 p-8 text-center">
          <Badge variant="outline" className="mb-4">
            {scenario.inputMode === "interactive" ? "Interactive" : "Spectator"}
          </Badge>
          <h2 className="font-display text-xl font-bold tracking-tight text-content-primary">
            Player coming soon
          </h2>
          <p className="mt-2 text-sm text-content-tertiary">
            The scenario player is being built in OPT-291. This route will host
            the board, control bar, and info panel once that ticket lands.
          </p>
          <Link
            href="/sandbox"
            className="mt-6 inline-block text-sm font-medium text-navy-900 hover:underline"
          >
            ← Back to Sandbox
          </Link>
        </div>
      </div>
    </>
  );
}
