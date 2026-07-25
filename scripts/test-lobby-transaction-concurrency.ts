/**
 * Real PostgreSQL concurrency harness for lobby transactional flows (OPT-567).
 *
 * Run manually against the shared DEV Neon branch:
 *   pnpm test:db-concurrency
 *
 * This is intentionally excluded from `pnpm verify` and CI. Fixtures are
 * uniquely tagged, cleanup deletes only tagged rows, and the script refuses to
 * run against any database host other than the configured OPTCG DEV branch.
 *
 * The route handlers do not expose transaction hooks. To create deterministic
 * interleavings without modifying product code, these scenarios reproduce the
 * handlers' Prisma mutations and CAS predicates, then assert their persisted
 * contracts against PostgreSQL. pg_stat_activity proves each losing query is
 * waiting on the intended row lock before the winning transaction is released.
 */

import "dotenv/config";
import type { Prisma } from "@prisma/client";
import {
  assert,
  assertCommitted,
  assertExpectedConflict,
  deferred,
  type Deferred,
  errorMessage,
  ExpectedConflict,
  isDatabaseUnavailable,
  LobbyConcurrencyHarness,
  transaction,
  transactionBackendPid,
  validateDatabaseUrl,
} from "./lib/lobby-concurrency-harness";

interface ScenarioResult {
  name: string;
  status: "PASS" | "FAIL";
  detail?: string;
}

const scenarioResults: ScenarioResult[] = [];
const COORDINATION_TIMEOUT_MS = 10_000;

interface CoordinationWait {
  label: string;
  signal: Deferred;
  owner: Promise<unknown>;
  transactions: Promise<unknown>[];
  peers: Deferred[];
}

async function awaitCoordination({
  label,
  signal,
  owner,
  transactions,
  peers,
}: CoordinationWait): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const ownerSettledFirst = owner.then(
    () => {
      throw new Error(
        `Coordination failed before ${label}: owning transaction completed without signaling`
      );
    },
    (error: unknown) => {
      throw new Error(
        `Coordination failed before ${label}: owning transaction failed (${errorMessage(error)})`
      );
    }
  );
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `Coordination timed out after ${COORDINATION_TIMEOUT_MS}ms waiting for ${label}`
        )
      );
    }, COORDINATION_TIMEOUT_MS);
  });

  try {
    await Promise.race([signal.promise, ownerSettledFirst, timedOut]);
  } catch (error) {
    for (const peer of peers) peer.resolve();
    await Promise.allSettled(transactions);
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function observeBlockedThenRelease(
  harness: LobbyConcurrencyHarness,
  blockedPid: number,
  blockingPid: number,
  label: string,
  release: () => void
): Promise<unknown | null> {
  try {
    await harness.awaitBlocked(blockedPid, blockingPid, label);
    return null;
  } catch (error) {
    return error;
  } finally {
    release();
  }
}

async function runScenario(
  name: string,
  scenario: () => Promise<void>
): Promise<void> {
  try {
    await scenario();
    scenarioResults.push({ name, status: "PASS" });
    console.log(`PASS ${name}`);
  } catch (error) {
    const detail = errorMessage(error);
    scenarioResults.push({ name, status: "FAIL", detail });
    console.error(`FAIL ${name}: ${detail}`);
  }
}

async function closePersonalLobby(
  tx: Prisma.TransactionClient,
  userId: string,
  lobbyId: string,
  revision: number
): Promise<void> {
  const closed = await tx.lobby.updateMany({
    where: {
      id: lobbyId,
      hostUserId: userId,
      revision,
      status: { in: ["WAITING", "READY"] },
      guest: { is: null },
      invites: { none: { status: "PENDING" } },
    },
    data: { status: "CLOSED", revision: { increment: 1 } },
  });
  if (closed.count !== 1) throw new ExpectedConflict("personal lobby changed");

  await tx.user.updateMany({
    where: { id: userId, activeLobbyId: lobbyId },
    data: { activeLobbyId: null },
  });
}

async function silentSwitchRace(harness: LobbyConcurrencyHarness) {
  const [winner, loser, targetHost] = await Promise.all([
    harness.createUser("silent-winner"),
    harness.createUser("silent-loser"),
    harness.createUser("silent-target-host"),
  ]);
  const [winnerLobby, loserLobby, targetLobby] = await Promise.all([
    harness.createLobby("silent-winner-own", winner.id),
    harness.createLobby("silent-loser-own", loser.id),
    harness.createLobby("silent-target", targetHost.id),
  ]);
  await Promise.all([
    harness.pointUserAtLobby(winner.id, winnerLobby.id),
    harness.pointUserAtLobby(loser.id, loserLobby.id),
    harness.pointUserAtLobby(targetHost.id, targetLobby.id),
  ]);

  const winnerClient = harness.createClient();
  const loserClient = harness.createClient();
  const loserClosedOwnLobby = deferred();
  const targetLocked = deferred();
  const loserPidReady = deferred();
  const releaseWinner = deferred();
  let winnerPid = 0;
  let loserPid = 0;

  const winnerAttempt = transaction(winnerClient, async (tx) => {
    winnerPid = await transactionBackendPid(tx);
    await closePersonalLobby(tx, winner.id, winnerLobby.id, 0);
    await loserClosedOwnLobby.promise;
    await acquireTargetLock(tx, targetLobby.id);
    targetLocked.resolve();
    await releaseWinner.promise;
    await claimTargetSeat(tx, winner.id, targetLobby.id);
  });

  const loserAttempt = transaction(loserClient, async (tx) => {
    await closePersonalLobby(tx, loser.id, loserLobby.id, 0);
    loserClosedOwnLobby.resolve();
    await targetLocked.promise;
    loserPid = await transactionBackendPid(tx);
    loserPidReady.resolve();
    await acquireTargetLock(tx, targetLobby.id);
    await claimTargetSeat(tx, loser.id, targetLobby.id);
  });

  await awaitCoordination({
    label: "silent-switch loser backend PID",
    signal: loserPidReady,
    owner: loserAttempt,
    transactions: [winnerAttempt, loserAttempt],
    peers: [loserClosedOwnLobby, targetLocked, loserPidReady, releaseWinner],
  });
  const overlapError = await observeBlockedThenRelease(
    harness,
    loserPid,
    winnerPid,
    "silent-switch loser",
    releaseWinner.resolve
  );

  const [winnerResult, loserResult] = await Promise.allSettled([
    winnerAttempt,
    loserAttempt,
  ]);
  if (overlapError) throw overlapError;
  assertCommitted(winnerResult, "silent-switch winner");
  assertExpectedConflict(loserResult, "silent-switch loser");

  const [
    storedWinner,
    storedLoser,
    storedWinnerLobby,
    storedLoserLobby,
    target,
  ] = await Promise.all([
    harness.observer.user.findUniqueOrThrow({ where: { id: winner.id } }),
    harness.observer.user.findUniqueOrThrow({ where: { id: loser.id } }),
    harness.observer.lobby.findUniqueOrThrow({ where: { id: winnerLobby.id } }),
    harness.observer.lobby.findUniqueOrThrow({ where: { id: loserLobby.id } }),
    harness.observer.lobby.findUniqueOrThrow({
      where: { id: targetLobby.id },
      include: { guest: true },
    }),
  ]);

  assert(storedWinner.activeLobbyId === target.id, "winner membership missing");
  assert(storedWinnerLobby.status === "CLOSED", "winner old lobby stayed open");
  assert(
    storedWinnerLobby.revision === 1,
    "winner old revision did not advance once"
  );
  assert(
    storedLoser.activeLobbyId === loserLobby.id,
    "loser membership did not roll back"
  );
  assert(
    storedLoserLobby.status === "WAITING",
    "loser old lobby did not roll back"
  );
  assert(
    storedLoserLobby.revision === 0,
    "loser old revision did not roll back"
  );
  assert(
    target.status === "READY" && target.revision === 1,
    "target advanced incorrectly"
  );
  assert(
    target.guest?.userId === winner.id,
    "target does not have exactly one winner"
  );
}

async function acquireTargetLock(
  tx: Prisma.TransactionClient,
  targetLobbyId: string
): Promise<void> {
  const acquired = await tx.lobby.updateMany({
    where: {
      id: targetLobbyId,
      status: "WAITING",
      mode: "PVP",
      guest: { is: null },
    },
    data: { status: "READY", revision: { increment: 1 } },
  });
  if (acquired.count !== 1) throw new ExpectedConflict("target occupied");
}

async function claimTargetSeat(
  tx: Prisma.TransactionClient,
  userId: string,
  targetLobbyId: string
): Promise<void> {
  const claimed = await tx.user.updateMany({
    where: { id: userId, activeLobbyId: null },
    data: { activeLobbyId: targetLobbyId },
  });
  if (claimed.count !== 1) throw new ExpectedConflict("membership changed");
  await tx.lobbyGuest.create({ data: { lobbyId: targetLobbyId, userId } });
}

async function disbandRollback(harness: LobbyConcurrencyHarness) {
  const [host, oldGuest, invitee, targetHost, filler] = await Promise.all([
    harness.createUser("disband-host"),
    harness.createUser("disband-old-guest"),
    harness.createUser("disband-invitee"),
    harness.createUser("disband-target-host"),
    harness.createUser("disband-filler"),
  ]);
  const [oldLobby, targetLobby] = await Promise.all([
    harness.createLobby("disband-old", host.id, { status: "READY" }),
    harness.createLobby("disband-target", targetHost.id),
  ]);
  await Promise.all([
    harness.pointUserAtLobby(host.id, oldLobby.id),
    harness.pointUserAtLobby(targetHost.id, targetLobby.id),
    harness.seatGuest(oldLobby.id, oldGuest.id),
  ]);
  const invite = await harness.observer.lobbyInvite.create({
    data: {
      lobbyId: oldLobby.id,
      fromUserId: host.id,
      toUserId: invitee.id,
      expiresAt: new Date(Date.now() + 300_000),
    },
  });

  const fillerClient = harness.createClient();
  const switchClient = harness.createClient();
  const targetLocked = deferred();
  const releaseFiller = deferred();
  const switchPidReady = deferred();
  let fillerPid = 0;
  let switchPid = 0;

  const fillerAttempt = transaction(fillerClient, async (tx) => {
    fillerPid = await transactionBackendPid(tx);
    await acquireTargetLock(tx, targetLobby.id);
    targetLocked.resolve();
    await releaseFiller.promise;
    await claimTargetSeat(tx, filler.id, targetLobby.id);
  });

  const switchAttempt = transaction(switchClient, async (tx) => {
    const closed = await tx.lobby.updateMany({
      where: {
        id: oldLobby.id,
        hostUserId: host.id,
        revision: 0,
        status: { in: ["WAITING", "READY"] },
      },
      data: { status: "CLOSED", revision: { increment: 1 } },
    });
    if (closed.count !== 1) throw new ExpectedConflict("old lobby changed");
    await tx.lobbyGuest.deleteMany({ where: { lobbyId: oldLobby.id } });
    await tx.user.updateMany({
      where: { activeLobbyId: oldLobby.id },
      data: { activeLobbyId: null },
    });
    await tx.lobbyInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });

    await targetLocked.promise;
    switchPid = await transactionBackendPid(tx);
    switchPidReady.resolve();
    await acquireTargetLock(tx, targetLobby.id);
    await claimTargetSeat(tx, host.id, targetLobby.id);
  });

  await awaitCoordination({
    label: "confirmed-switch backend PID",
    signal: switchPidReady,
    owner: switchAttempt,
    transactions: [fillerAttempt, switchAttempt],
    peers: [targetLocked, releaseFiller, switchPidReady],
  });
  const overlapError = await observeBlockedThenRelease(
    harness,
    switchPid,
    fillerPid,
    "confirmed switch",
    releaseFiller.resolve
  );

  const [fillerResult, switchResult] = await Promise.allSettled([
    fillerAttempt,
    switchAttempt,
  ]);
  if (overlapError) throw overlapError;
  assertCommitted(fillerResult, "target filler");
  assertExpectedConflict(switchResult, "confirmed switch");

  const [storedHost, storedGuest, old, storedInvite, target] =
    await Promise.all([
      harness.observer.user.findUniqueOrThrow({ where: { id: host.id } }),
      harness.observer.user.findUniqueOrThrow({ where: { id: oldGuest.id } }),
      harness.observer.lobby.findUniqueOrThrow({
        where: { id: oldLobby.id },
        include: { guest: true },
      }),
      harness.observer.lobbyInvite.findUniqueOrThrow({
        where: { id: invite.id },
      }),
      harness.observer.lobby.findUniqueOrThrow({
        where: { id: targetLobby.id },
        include: { guest: true },
      }),
    ]);
  assert(
    old.status === "READY" && old.revision === 0,
    "old lobby did not roll back"
  );
  assert(old.guest?.userId === oldGuest.id, "old guest seat did not roll back");
  assert(storedHost.activeLobbyId === old.id, "host pointer did not roll back");
  assert(
    storedGuest.activeLobbyId === old.id,
    "ex-guest pointer did not roll back"
  );
  assert(
    storedInvite.status === "PENDING",
    "invite cancellation did not roll back"
  );
  assert(target.guest?.userId === filler.id, "target filler did not win");
}

async function kickCasRaces(harness: LobbyConcurrencyHarness) {
  await kickWinsAgainstLeave(harness);
  await solitaireWinsAgainstKick(harness);
  await revisionOnlyChangeWinsAgainstKick(harness);
}

async function createOccupiedLobby(
  harness: LobbyConcurrencyHarness,
  label: string
): Promise<{ hostId: string; guestId: string; lobbyId: string }> {
  const [host, guest] = await Promise.all([
    harness.createUser(`${label}-host`),
    harness.createUser(`${label}-guest`),
  ]);
  const lobby = await harness.createLobby(label, host.id, { status: "READY" });
  await Promise.all([
    harness.pointUserAtLobby(host.id, lobby.id),
    harness.seatGuest(lobby.id, guest.id),
  ]);
  return { hostId: host.id, guestId: guest.id, lobbyId: lobby.id };
}

async function kickWinsAgainstLeave(harness: LobbyConcurrencyHarness) {
  const fixture = await createOccupiedLobby(harness, "kick-leave");
  const kickClient = harness.createClient();
  const leaveClient = harness.createClient();
  const kickLocked = deferred();
  const releaseKick = deferred();
  const leavePidReady = deferred();
  let kickPid = 0;
  let leavePid = 0;

  const kickAttempt = transaction(kickClient, async (tx) => {
    kickPid = await transactionBackendPid(tx);
    await kickCas(tx, fixture);
    kickLocked.resolve();
    await releaseKick.promise;
    await removeGuestAndPointer(tx, fixture.lobbyId, fixture.guestId);
  });
  const leaveAttempt = transaction(leaveClient, async (tx) => {
    await kickLocked.promise;
    leavePid = await transactionBackendPid(tx);
    leavePidReady.resolve();
    const released = await tx.lobby.updateMany({
      where: {
        id: fixture.lobbyId,
        status: "READY",
        mode: "PVP",
        guest: { is: { userId: fixture.guestId } },
      },
      data: {
        status: "WAITING",
        hostReady: false,
        revision: { increment: 1 },
      },
    });
    if (released.count !== 1)
      throw new ExpectedConflict("guest leave lost CAS");
    await removeGuestAndPointer(tx, fixture.lobbyId, fixture.guestId);
  });

  await awaitCoordination({
    label: "guest-leave backend PID",
    signal: leavePidReady,
    owner: leaveAttempt,
    transactions: [kickAttempt, leaveAttempt],
    peers: [kickLocked, releaseKick, leavePidReady],
  });
  const overlapError = await observeBlockedThenRelease(
    harness,
    leavePid,
    kickPid,
    "guest leave",
    releaseKick.resolve
  );
  const [kickResult, leaveResult] = await Promise.allSettled([
    kickAttempt,
    leaveAttempt,
  ]);
  if (overlapError) throw overlapError;
  assertCommitted(kickResult, "kick");
  assertExpectedConflict(leaveResult, "guest leave");
  await assertEmptySeatAfterSingleRevision(harness, fixture);
}

async function solitaireWinsAgainstKick(harness: LobbyConcurrencyHarness) {
  const fixture = await createOccupiedLobby(harness, "kick-solitaire");
  const forceClient = harness.createClient();
  const kickClient = harness.createClient();
  const forceLocked = deferred();
  const releaseForce = deferred();
  const kickPidReady = deferred();
  let forcePid = 0;
  let kickPid = 0;

  const forceAttempt = transaction(forceClient, async (tx) => {
    forcePid = await transactionBackendPid(tx);
    const forced = await tx.lobby.updateMany({
      where: {
        id: fixture.lobbyId,
        status: "READY",
        mode: "PVP",
        revision: 0,
      },
      data: {
        mode: "SOLITAIRE",
        status: "READY",
        revision: { increment: 1 },
      },
    });
    if (forced.count !== 1) throw new ExpectedConflict("Solitaire lost CAS");
    forceLocked.resolve();
    await releaseForce.promise;
    await tx.lobbyGuest.deleteMany({ where: { lobbyId: fixture.lobbyId } });
    await tx.user.updateMany({
      where: { id: fixture.guestId, activeLobbyId: fixture.lobbyId },
      data: { activeLobbyId: null },
    });
    await tx.lobbyGuest.create({
      data: { lobbyId: fixture.lobbyId, userId: fixture.hostId },
    });
  });
  const kickAttempt = transaction(kickClient, async (tx) => {
    await forceLocked.promise;
    kickPid = await transactionBackendPid(tx);
    kickPidReady.resolve();
    await kickCas(tx, fixture);
    await removeGuestAndPointer(tx, fixture.lobbyId, fixture.guestId);
  });

  await awaitCoordination({
    label: "kick-against-Solitaire backend PID",
    signal: kickPidReady,
    owner: kickAttempt,
    transactions: [forceAttempt, kickAttempt],
    peers: [forceLocked, releaseForce, kickPidReady],
  });
  const overlapError = await observeBlockedThenRelease(
    harness,
    kickPid,
    forcePid,
    "kick against forced Solitaire",
    releaseForce.resolve
  );
  const [forceResult, kickResult] = await Promise.allSettled([
    forceAttempt,
    kickAttempt,
  ]);
  if (overlapError) throw overlapError;
  assertCommitted(forceResult, "forced Solitaire");
  assertExpectedConflict(kickResult, "kick");

  const [lobby, guest] = await Promise.all([
    harness.observer.lobby.findUniqueOrThrow({
      where: { id: fixture.lobbyId },
    }),
    harness.observer.user.findUniqueOrThrow({ where: { id: fixture.guestId } }),
  ]);
  const seat = await harness.observer.lobbyGuest.findUniqueOrThrow({
    where: { lobbyId: fixture.lobbyId },
  });
  assert(lobby.revision === 1, "revision did not advance exactly once");
  assert(lobby.mode === "SOLITAIRE", "forced Solitaire did not win");
  assert(seat.userId === fixture.hostId, "Solitaire host seat is incorrect");
  assert(guest.activeLobbyId === null, "ejected guest pointer was not cleared");
}

async function revisionOnlyChangeWinsAgainstKick(
  harness: LobbyConcurrencyHarness
) {
  const fixture = await createOccupiedLobby(harness, "kick-revision");
  const revisionClient = harness.createClient();
  const kickClient = harness.createClient();
  const revisionLocked = deferred();
  const releaseRevision = deferred();
  const kickPidReady = deferred();
  let revisionPid = 0;
  let kickPid = 0;

  const revisionAttempt = transaction(revisionClient, async (tx) => {
    revisionPid = await transactionBackendPid(tx);
    const advanced = await tx.lobby.updateMany({
      where: {
        id: fixture.lobbyId,
        status: "READY",
        mode: "PVP",
        revision: 0,
        guest: { is: { userId: fixture.guestId } },
      },
      data: { revision: { increment: 1 } },
    });
    if (advanced.count !== 1) {
      throw new ExpectedConflict("revision-only update lost CAS");
    }
    revisionLocked.resolve();
    await releaseRevision.promise;
  });
  const kickAttempt = transaction(kickClient, async (tx) => {
    await revisionLocked.promise;
    kickPid = await transactionBackendPid(tx);
    kickPidReady.resolve();
    await kickCas(tx, fixture);
    await removeGuestAndPointer(tx, fixture.lobbyId, fixture.guestId);
  });

  await awaitCoordination({
    label: "kick-against-revision-only-change backend PID",
    signal: kickPidReady,
    owner: kickAttempt,
    transactions: [revisionAttempt, kickAttempt],
    peers: [revisionLocked, releaseRevision, kickPidReady],
  });
  const overlapError = await observeBlockedThenRelease(
    harness,
    kickPid,
    revisionPid,
    "kick against revision-only change",
    releaseRevision.resolve
  );
  const [revisionResult, kickResult] = await Promise.allSettled([
    revisionAttempt,
    kickAttempt,
  ]);
  if (overlapError) throw overlapError;
  assertCommitted(revisionResult, "revision-only change");
  assertExpectedConflict(kickResult, "stale kick");

  const [lobby, guest, seat] = await Promise.all([
    harness.observer.lobby.findUniqueOrThrow({
      where: { id: fixture.lobbyId },
    }),
    harness.observer.user.findUniqueOrThrow({
      where: { id: fixture.guestId },
    }),
    harness.observer.lobbyGuest.findUniqueOrThrow({
      where: { lobbyId: fixture.lobbyId },
    }),
  ]);
  assert(lobby.revision === 1, "revision-only winner did not advance once");
  assert(lobby.status === "READY", "revision-only winner changed status");
  assert(lobby.mode === "PVP", "revision-only winner changed mode");
  assert(seat.userId === fixture.guestId, "stale kick removed the guest");
  assert(
    guest.activeLobbyId === fixture.lobbyId,
    "stale kick cleared the guest pointer"
  );
}

async function kickCas(
  tx: Prisma.TransactionClient,
  fixture: { hostId: string; guestId: string; lobbyId: string }
): Promise<void> {
  const reset = await tx.lobby.updateMany({
    where: {
      id: fixture.lobbyId,
      hostUserId: fixture.hostId,
      status: { in: ["WAITING", "READY"] },
      mode: "PVP",
      revision: 0,
      guest: { is: { userId: fixture.guestId } },
    },
    data: { status: "WAITING", revision: { increment: 1 } },
  });
  if (reset.count !== 1) throw new ExpectedConflict("kick lost CAS");
}

async function removeGuestAndPointer(
  tx: Prisma.TransactionClient,
  lobbyId: string,
  guestId: string
): Promise<void> {
  const removed = await tx.lobbyGuest.deleteMany({
    where: { lobbyId, userId: guestId },
  });
  if (removed.count !== 1) throw new ExpectedConflict("guest seat changed");
  await tx.user.updateMany({
    where: { id: guestId, activeLobbyId: lobbyId },
    data: { activeLobbyId: null },
  });
}

async function assertEmptySeatAfterSingleRevision(
  harness: LobbyConcurrencyHarness,
  fixture: { guestId: string; lobbyId: string }
): Promise<void> {
  const [lobby, guest, seatCount] = await Promise.all([
    harness.observer.lobby.findUniqueOrThrow({
      where: { id: fixture.lobbyId },
    }),
    harness.observer.user.findUniqueOrThrow({ where: { id: fixture.guestId } }),
    harness.observer.lobbyGuest.count({ where: { lobbyId: fixture.lobbyId } }),
  ]);
  assert(lobby.revision === 1, "revision did not advance exactly once");
  assert(lobby.status === "WAITING", "lobby did not reset to WAITING");
  assert(seatCount === 0, "guest seat was not removed exactly once");
  assert(guest.activeLobbyId === null, "guest pointer was not cleared");
}

async function inviteCancelVsAccept(harness: LobbyConcurrencyHarness) {
  const [host, invitee] = await Promise.all([
    harness.createUser("invite-host"),
    harness.createUser("invite-invitee"),
  ]);
  const lobby = await harness.createLobby("invite-target", host.id);
  await harness.pointUserAtLobby(host.id, lobby.id);
  const invite = await harness.observer.lobbyInvite.create({
    data: {
      lobbyId: lobby.id,
      fromUserId: host.id,
      toUserId: invitee.id,
      expiresAt: new Date(Date.now() + 300_000),
    },
  });

  const acceptClient = harness.createClient();
  const cancelClient = harness.createClient();
  const acceptLocked = deferred();
  const releaseAccept = deferred();
  const cancelPidReady = deferred();
  let acceptPid = 0;
  let cancelPid = 0;

  const acceptAttempt = transaction(acceptClient, async (tx) => {
    acceptPid = await transactionBackendPid(tx);
    const acquired = await tx.lobby.updateMany({
      where: { id: lobby.id, status: "WAITING" },
      data: { status: "READY", revision: { increment: 1 } },
    });
    if (acquired.count !== 1)
      throw new ExpectedConflict("accept lost lobby lock");
    acceptLocked.resolve();
    await releaseAccept.promise;
    const accepted = await tx.lobbyInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "ACCEPTED" },
    });
    if (accepted.count !== 1)
      throw new ExpectedConflict("accept lost invite CAS");
  });
  const cancelAttempt = transaction(cancelClient, async (tx) => {
    await acceptLocked.promise;
    cancelPid = await transactionBackendPid(tx);
    cancelPidReady.resolve();
    const locked = await tx.lobby.updateMany({
      where: { id: lobby.id, status: "WAITING" },
      data: { status: "WAITING" },
    });
    if (locked.count !== 1)
      throw new ExpectedConflict("cancel lost lobby lock");
    await tx.lobbyInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status: "CANCELED" },
    });
  });

  await awaitCoordination({
    label: "invite-cancel backend PID",
    signal: cancelPidReady,
    owner: cancelAttempt,
    transactions: [acceptAttempt, cancelAttempt],
    peers: [acceptLocked, releaseAccept, cancelPidReady],
  });
  const overlapError = await observeBlockedThenRelease(
    harness,
    cancelPid,
    acceptPid,
    "invite cancel",
    releaseAccept.resolve
  );
  const [acceptResult, cancelResult] = await Promise.allSettled([
    acceptAttempt,
    cancelAttempt,
  ]);
  if (overlapError) throw overlapError;
  assertCommitted(acceptResult, "invite accept");
  assertExpectedConflict(cancelResult, "invite cancel");

  const [storedLobby, storedInvite] = await Promise.all([
    harness.observer.lobby.findUniqueOrThrow({ where: { id: lobby.id } }),
    harness.observer.lobbyInvite.findUniqueOrThrow({
      where: { id: invite.id },
    }),
  ]);
  assert(storedLobby.status === "READY", "accepted lobby is not READY");
  assert(storedLobby.revision === 1, "accept revision did not advance once");
  assert(
    storedInvite.status === "ACCEPTED",
    "cancel overwrote accepted invite"
  );
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log("SKIP DATABASE_URL is not configured.");
    return;
  }
  validateDatabaseUrl(databaseUrl);

  const harness = new LobbyConcurrencyHarness();
  let connected = false;
  try {
    try {
      await harness.connect();
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        console.log(
          `SKIP development database is unreachable (${errorMessage(error)}).`
        );
        return;
      }
      throw error;
    }
    connected = true;

    console.log(`RUN ${harness.runTag}`);
    await runScenario("silent switch rollback", () =>
      silentSwitchRace(harness)
    );
    await runScenario("confirmed disband-and-join rollback", () =>
      disbandRollback(harness)
    );
    await runScenario("kick CAS interleavings", () => kickCasRaces(harness));
    await runScenario("invite cancel-vs-accept", () =>
      inviteCancelVsAccept(harness)
    );
  } finally {
    if (connected) {
      try {
        await harness.cleanup();
        console.log(`CLEANUP verified ${harness.runTag}`);
      } catch (error) {
        scenarioResults.push({
          name: "tagged fixture cleanup",
          status: "FAIL",
          detail: errorMessage(error),
        });
        console.error(`FAIL tagged fixture cleanup: ${errorMessage(error)}`);
      } finally {
        await harness.disconnect();
      }
    }
  }

  const passed = scenarioResults.filter(
    ({ status }) => status === "PASS"
  ).length;
  const failed = scenarioResults.filter(({ status }) => status === "FAIL");
  console.log(`SUMMARY ${passed} passed, ${failed.length} failed`);
  for (const result of scenarioResults) {
    console.log(
      `  ${result.status} ${result.name}${result.detail ? ` — ${result.detail}` : ""}`
    );
  }
  if (failed.length > 0) throw new Error(`${failed.length} scenario(s) failed`);
}

void main().catch((error) => {
  console.error(`FAIL harness: ${errorMessage(error)}`);
  process.exitCode = 1;
});
