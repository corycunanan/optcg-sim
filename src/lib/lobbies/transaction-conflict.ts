import { Prisma } from "@prisma/client";

const POSTGRES_DEADLOCK_CODE = "40P01";

export function isRetryableTransactionConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }

  return errorHasCode(error, POSTGRES_DEADLOCK_CODE, new Set());
}

export async function retryTransactionOnce<T>(
  client: {
    $transaction<Result>(
      operation: (tx: Prisma.TransactionClient) => Promise<Result>
    ): Promise<Result>;
  },
  operation: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await client.$transaction(operation);
  } catch (error) {
    if (!isRetryableTransactionConflict(error)) throw error;
    return client.$transaction(operation);
  }
}

function errorHasCode(
  value: unknown,
  expectedCode: string,
  seen: Set<object>
): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) {
    return false;
  }
  seen.add(value);

  const record = value as Record<string, unknown>;
  if (record.code === expectedCode) return true;

  return (
    errorHasCode(record.meta, expectedCode, seen) ||
    errorHasCode(record.cause, expectedCode, seen)
  );
}
