import { notFound } from "next/navigation";
import { scenarios } from "@/lib/sandbox/scenarios";
import { ScenarioRunner } from "@/components/sandbox/scenario-runner";

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

  return <ScenarioRunner scenario={scenario} />;
}
