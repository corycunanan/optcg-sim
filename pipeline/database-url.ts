export interface PipelineDatabaseConfig {
  source: "DIRECT_DATABASE_URL" | "DATABASE_URL";
  url: string;
}

interface PipelineDatabaseEnv {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  DIRECT_DATABASE_URL?: string;
}

export function selectPipelineDatabaseUrl(
  env: PipelineDatabaseEnv = process.env
): PipelineDatabaseConfig {
  const directUrl = env.DIRECT_DATABASE_URL?.trim();
  if (directUrl) {
    return { source: "DIRECT_DATABASE_URL", url: directUrl };
  }

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "Pipeline import requires DIRECT_DATABASE_URL or DATABASE_URL."
    );
  }

  if (hasSingleConnectionLimit(databaseUrl)) {
    throw new Error(
      "DATABASE_URL uses connection_limit=1, which is unsafe for the parallel pipeline import. Set DIRECT_DATABASE_URL to a direct PostgreSQL connection and retry."
    );
  }

  return { source: "DATABASE_URL", url: databaseUrl };
}

function hasSingleConnectionLimit(databaseUrl: string): boolean {
  try {
    return new URL(databaseUrl).searchParams
      .getAll("connection_limit")
      .some((value) => Number(value) === 1);
  } catch {
    return false;
  }
}
