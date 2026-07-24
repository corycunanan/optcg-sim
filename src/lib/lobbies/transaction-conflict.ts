import { Prisma } from "@prisma/client";

const POSTGRES_DEADLOCK_CODE = "40P01";

export function isRetryableTransactionConflict(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return true;
  }

  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    error.message.includes(POSTGRES_DEADLOCK_CODE)
  );
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
