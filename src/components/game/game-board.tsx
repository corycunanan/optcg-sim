"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import {
  useGameWs,
  type CardInstance,
  type DonInstance,
  type GameAction,
  type GameState,
  type LifeCard,
  type PlayerState,
} from "@/hooks/use-game-ws";
import { cn } from "@/lib/utils";

interface GameBoardProps {
  gameId: string;
  workerUrl: string;
}

export function GameBoard({ gameId, workerUrl }: GameBoardProps) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";

  // Determine this player's index from game state (set after first message)
  const [playerIndex, setPlayerIndex] = useState<0 | 1 | null>(null);

  const { gameState, connectionStatus, lastError, activePrompt, gameOver, sendAction } =
    useGameWs(gameId, workerUrl, userId, playerIndex);

  // Derive player index from game state
  if (gameState && playerIndex === null) {
    const idx = gameState.players.findIndex((p) => p.playerId === userId);
    if (idx === 0 || idx === 1) setPlayerIndex(idx);
  }

  const myIndex = playerIndex ?? 0;
  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;

  if (connectionStatus === "connecting" && !gameState) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[--surface-nav]">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[--navy-700] border-t-[--gold-500] mx-auto" />
          <p className="text-sm text-[--text-inverse]">Connecting to game server...</p>
        </div>
      </div>
    );
  }

  if (gameOver) {
    const iWon = gameOver.winner === myIndex;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[--surface-nav]">
        <div className="text-center space-y-4">
          <h1 className={cn(
            "font-[family-name:var(--font-barlow-condensed)] text-6xl font-bold",
            iWon ? "text-[--gold-500]" : "text-[--red-600]"
          )}>
            {gameOver.winner === null ? "DRAW" : iWon ? "VICTORY" : "DEFEAT"}
          </h1>
          <p className="text-[--text-inverse] text-sm">{gameOver.reason}</p>
          <button
            onClick={() => window.location.href = "/"}
            className="mt-4 px-6 py-2 rounded-md bg-[--navy-800] text-[--text-inverse] text-sm hover:bg-[--navy-700] transition-colors"
          >
            Return to lobby
          </button>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[--surface-nav]">
        <p className="text-sm text-[--text-inverse]">Waiting for game state...</p>
      </div>
    );
  }

  const me = gameState.players[myIndex];
  const opp = gameState.players[oppIndex];
  const turn = gameState.turn;
  const isMyTurn = turn.activePlayerIndex === myIndex;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[oklch(15%_0.02_245)] text-[--text-inverse] overflow-hidden select-none">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[oklch(12%_0.02_245)] border-b border-[--navy-700] shrink-0">
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-xs px-2 py-1 rounded font-medium",
            connectionStatus === "connected" ? "bg-[--success] text-white" : "bg-[--warning] text-white"
          )}>
            {connectionStatus.toUpperCase()}
          </span>
          <span className="text-xs text-[--text-tertiary]">Game #{gameId.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-4">
          <TurnIndicator turn={turn} isMyTurn={isMyTurn} />
        </div>
        <button
          onClick={() => sendAction({ type: "CONCEDE" })}
          className="text-xs px-3 py-1 rounded bg-[--red-600] hover:bg-[--red-500] text-white transition-colors"
        >
          Concede
        </button>
      </div>

      {/* ── Main board ── */}
      <div className="flex flex-1 min-h-0 gap-2 p-3">
        {/* ── Player zones ── */}
        <div className="flex flex-col flex-1 min-w-0 gap-2">
          {/* Opponent side */}
          <PlayerZone
            player={opp}
            isMine={false}
            isActive={!isMyTurn}
            playerLabel="Opponent"
            sendAction={sendAction}
            gameState={gameState}
            myIndex={myIndex}
          />

          {/* Battlefield divider */}
          <div className="h-px bg-[--navy-700] shrink-0" />

          {/* My side */}
          <PlayerZone
            player={me}
            isMine={true}
            isActive={isMyTurn}
            playerLabel="You"
            sendAction={sendAction}
            gameState={gameState}
            myIndex={myIndex}
          />
        </div>

        {/* ── Side panel ── */}
        <SidePanel
          gameState={gameState}
          isMyTurn={isMyTurn}
          myIndex={myIndex}
          sendAction={sendAction}
          activePrompt={activePrompt}
          lastError={lastError}
        />
      </div>
    </div>
  );
}

// ─── Turn indicator ────────────────────────────────────────────────────────────

function TurnIndicator({
  turn,
  isMyTurn,
}: {
  turn: GameState["turn"];
  isMyTurn: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-[--text-tertiary]">Turn {turn.number}</span>
      <span className="text-[--navy-500]">·</span>
      <span className={cn(
        "font-medium px-2 py-0.5 rounded",
        isMyTurn ? "bg-[--gold-500] text-[oklch(15%_0.02_245)]" : "bg-[--navy-700] text-[--text-inverse]"
      )}>
        {turn.phase}
      </span>
      {turn.battleSubPhase && (
        <>
          <span className="text-[--navy-500]">›</span>
          <span className="text-[--text-tertiary]">{turn.battleSubPhase}</span>
        </>
      )}
    </div>
  );
}

// ─── Player zone ──────────────────────────────────────────────────────────────

function PlayerZone({
  player,
  isMine,
  isActive,
  playerLabel,
  sendAction,
  gameState,
  myIndex,
}: {
  player: PlayerState;
  isMine: boolean;
  isActive: boolean;
  playerLabel: string;
  sendAction: (action: GameAction) => void;
  gameState: GameState;
  myIndex: 0 | 1;
}) {
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE").length;
  const restedDon = player.donCostArea.filter((d) => d.state === "RESTED").length;

  return (
    <div className={cn(
      "flex flex-col gap-1 flex-1 min-h-0",
      isActive && "ring-1 ring-[--gold-500]/30 rounded-lg"
    )}>
      {/* Row label + stats */}
      <div className="flex items-center gap-2 px-1 shrink-0">
        <span className={cn(
          "text-xs font-medium",
          isActive ? "text-[--gold-500]" : "text-[--text-secondary]"
        )}>
          {playerLabel}
        </span>
        <span className="text-xs text-[--text-tertiary]">
          Life: {player.life.length} · Hand: {player.hand.length} · Deck: {player.deck.length}
        </span>
        <span className="text-xs text-[--text-tertiary]">
          DON!!: {activeDon}A / {restedDon}R
        </span>
        {!player.connected && (
          <span className="text-xs px-1 rounded bg-[--warning] text-white">Disconnected</span>
        )}
      </div>

      {/* Life + Leader + Characters + Stage */}
      <div className="flex items-start gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Life cards */}
        <LifeArea life={player.life} isMine={isMine} />

        {/* Leader */}
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className="text-[8px] text-[--text-tertiary] uppercase tracking-wide">Leader</span>
          <CardSlot
            card={player.leader}
            isMine={isMine}
            isLeader={true}
            onAttack={isMine && isActive ? (id) => sendAction({ type: "DECLARE_ATTACK", attackerInstanceId: id, targetInstanceId: gameState.players[myIndex === 0 ? 1 : 0].leader.instanceId }) : undefined}
          />
        </div>

        {/* Characters */}
        <div className="flex-1 min-w-0">
          <span className="text-[8px] text-[--text-tertiary] uppercase tracking-wide block mb-1">Characters</span>
          <div className="flex flex-wrap gap-1">
            {player.characters.map((card) => (
              <CardSlot
                key={card.instanceId}
                card={card}
                isMine={isMine}
                isLeader={false}
                onAttack={isMine && isActive ? (id) => sendAction({ type: "DECLARE_ATTACK", attackerInstanceId: id, targetInstanceId: gameState.players[myIndex === 0 ? 1 : 0].leader.instanceId }) : undefined}
              />
            ))}
            {player.characters.length === 0 && (
              <div className="w-16 h-22 rounded border border-dashed border-[--navy-700] flex items-center justify-center opacity-40">
                <span className="text-[8px] text-[--text-tertiary]">Empty</span>
              </div>
            )}
          </div>
        </div>

        {/* Stage */}
        {player.stage && (
          <div className="shrink-0">
            <span className="text-[8px] text-[--text-tertiary] uppercase tracking-wide block mb-1">Stage</span>
            <CardSlot card={player.stage} isMine={isMine} isLeader={false} />
          </div>
        )}

        {/* Hand (only show mine face-up) */}
        {isMine && (
          <div className="flex-1 min-w-0">
            <span className="text-[8px] text-[--text-tertiary] uppercase tracking-wide block mb-1">Hand ({player.hand.length})</span>
            <div className="flex flex-wrap gap-1">
              {player.hand.map((card) => (
                <CardSlot
                  key={card.instanceId}
                  card={card}
                  isMine={isMine}
                  isLeader={false}
                  onPlay={isActive ? (id) => sendAction({ type: "PLAY_CARD", cardInstanceId: id }) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Opponent hand (face-down count) */}
        {!isMine && player.hand.length > 0 && (
          <div className="flex gap-1">
            {player.hand.map((c) => (
              <div
                key={c.instanceId}
                className="w-14 h-20 rounded bg-[--navy-800] border border-[--navy-700] flex items-center justify-center shrink-0"
              >
                <span className="text-[8px] text-[--text-tertiary]">?</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Life area ───────────────────────────────────────────────────────────────

function LifeArea({ life, isMine }: { life: LifeCard[]; isMine: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <span className="text-[8px] text-[--text-tertiary] uppercase tracking-wide">Life</span>
      <div className="flex flex-col gap-0.5">
        {life.map((card, i) => (
          <div
            key={card.instanceId}
            className={cn(
              "w-12 h-4 rounded flex items-center justify-center text-[8px] font-medium border",
              card.face === "UP" || isMine
                ? "bg-[--navy-800] border-[--gold-500]/50 text-[--gold-500]"
                : "bg-[--navy-900] border-[--navy-700] text-[--text-tertiary]"
            )}
          >
            {isMine ? card.cardId.slice(0, 8) : `L${i + 1}`}
          </div>
        ))}
        {life.length === 0 && (
          <div className="w-12 h-4 rounded border border-dashed border-[--red-600]/50 flex items-center justify-center">
            <span className="text-[8px] text-[--red-600]">0</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card slot ────────────────────────────────────────────────────────────────

function CardSlot({
  card,
  isMine,
  isLeader,
  onPlay,
  onAttack,
}: {
  card: CardInstance;
  isMine: boolean;
  isLeader: boolean;
  onPlay?: (id: string) => void;
  onAttack?: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isRested = card.state === "RESTED";
  const donCount = card.attachedDon.length;

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "w-14 h-20 rounded border text-[8px] flex flex-col items-center justify-center gap-0.5 transition-all duration-150 cursor-default",
          isRested && "rotate-90 origin-center",
          isLeader && "border-[--gold-500]/60 bg-[--navy-700]",
          !isLeader && isMine && "border-[--navy-600] bg-[--navy-800] hover:border-[--gold-500]/40",
          !isLeader && !isMine && "border-[--navy-700] bg-[--navy-900]",
        )}
      >
        <span className="text-[--text-tertiary] text-center px-0.5 leading-tight">{card.cardId}</span>
        {donCount > 0 && (
          <span className="px-1 rounded-full bg-[--gold-500] text-[oklch(15%_0.02_245)] text-[6px] font-bold">
            +{donCount}
          </span>
        )}
        {isLeader && (
          <span className="text-[6px] text-[--gold-500] uppercase tracking-wide">Leader</span>
        )}
      </div>

      {/* Action tooltip */}
      {hovered && isMine && (onPlay || onAttack) && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex gap-1 z-10">
          {onPlay && (
            <button
              onClick={() => onPlay(card.instanceId)}
              className="text-[8px] px-2 py-0.5 rounded bg-[--navy-900] border border-[--navy-700] text-[--text-inverse] hover:bg-[--navy-800] whitespace-nowrap"
            >
              Play
            </button>
          )}
          {onAttack && !isRested && (
            <button
              onClick={() => onAttack(card.instanceId)}
              className="text-[8px] px-2 py-0.5 rounded bg-[--red-600] text-white hover:bg-[--red-500] whitespace-nowrap"
            >
              Attack
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Side panel ───────────────────────────────────────────────────────────────

function SidePanel({
  gameState,
  isMyTurn,
  myIndex,
  sendAction,
  activePrompt,
  lastError,
}: {
  gameState: GameState;
  isMyTurn: boolean;
  myIndex: 0 | 1;
  sendAction: (action: GameAction) => void;
  activePrompt: { promptType: string; options: { validTargets?: string[]; optional?: boolean; timeoutMs?: number } } | null;
  lastError: string | null;
}) {
  const turn = gameState.turn;
  const inBattle = !!turn.battleSubPhase;

  return (
    <div className="w-48 shrink-0 flex flex-col gap-2 overflow-y-auto">
      {/* Phase actions */}
      <div className="rounded-lg bg-[oklch(12%_0.02_245)] border border-[--navy-700] p-3 space-y-2">
        <h3 className="text-xs font-medium text-[--text-inverse]">Actions</h3>

        {isMyTurn && !inBattle && (
          <button
            onClick={() => sendAction({ type: "ADVANCE_PHASE" })}
            className="w-full text-xs py-1.5 rounded-md bg-[--navy-800] border border-[--navy-700] text-[--text-inverse] hover:bg-[--navy-700] transition-colors"
          >
            {turn.phase === "END" ? "End Turn" : `End ${turn.phase}`}
          </button>
        )}

        {inBattle && (
          <button
            onClick={() => sendAction({ type: "PASS" })}
            className="w-full text-xs py-1.5 rounded-md bg-[--navy-800] border border-[--navy-700] text-[--text-inverse] hover:bg-[--navy-700] transition-colors"
          >
            Pass
          </button>
        )}

        {isMyTurn && turn.phase === "MAIN" && !inBattle && (
          <div className="space-y-1">
            <DonAttachPanel
              player={gameState.players[myIndex]}
              sendAction={sendAction}
            />
          </div>
        )}
      </div>

      {/* Active prompt */}
      {activePrompt && (
        <div className="rounded-lg bg-[--warning-soft] border border-[--warning] p-3 space-y-2">
          <h3 className="text-xs font-medium text-[oklch(30%_0.02_80)]">Waiting for input</h3>
          <p className="text-[10px] text-[oklch(40%_0.02_80)]">{activePrompt.promptType}</p>
          {activePrompt.promptType === "REVEAL_TRIGGER" && (
            <div className="flex gap-1">
              <button
                onClick={() => sendAction({ type: "REVEAL_TRIGGER", reveal: true })}
                className="flex-1 text-[10px] py-1 rounded bg-[--navy-900] text-[--text-inverse] border border-[--navy-700] hover:bg-[--navy-800]"
              >
                Reveal
              </button>
              <button
                onClick={() => sendAction({ type: "REVEAL_TRIGGER", reveal: false })}
                className="flex-1 text-[10px] py-1 rounded bg-[--navy-900] text-[--text-inverse] border border-[--navy-700] hover:bg-[--navy-800]"
              >
                Add to Hand
              </button>
            </div>
          )}
          {activePrompt.options.optional && (
            <button
              onClick={() => sendAction({ type: "PASS" })}
              className="w-full text-[10px] py-1 rounded bg-[--navy-900] text-[--text-inverse] border border-[--navy-700] hover:bg-[--navy-800]"
            >
              Skip
            </button>
          )}
        </div>
      )}

      {/* Error */}
      {lastError && (
        <div className="rounded-lg bg-[--error-soft] border border-[--red-600] p-2">
          <p className="text-[10px] text-[--red-600]">{lastError}</p>
        </div>
      )}

      {/* Event log */}
      <div className="rounded-lg bg-[oklch(12%_0.02_245)] border border-[--navy-700] p-3 flex-1 min-h-0">
        <h3 className="text-xs font-medium text-[--text-inverse] mb-2">Log</h3>
        <div className="space-y-1 text-[9px] text-[--text-tertiary] max-h-48 overflow-y-auto">
          {(gameState.eventLog as { type: string; timestamp: number }[]).slice(-20).reverse().map((ev, i) => (
            <div key={i}>{ev.type}</div>
          ))}
          {gameState.eventLog.length === 0 && (
            <div className="text-[--text-tertiary] italic">No events yet</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DON!! attach panel ───────────────────────────────────────────────────────

function DonAttachPanel({
  player,
  sendAction,
}: {
  player: PlayerState;
  sendAction: (action: GameAction) => void;
}) {
  const activeDon = player.donCostArea.filter((d) => d.state === "ACTIVE").length;
  if (activeDon === 0) return null;

  const targets = [player.leader, ...player.characters];

  return (
    <div>
      <p className="text-[9px] text-[--text-tertiary] mb-1">Attach DON!! ({activeDon} available)</p>
      <div className="flex flex-col gap-1">
        {targets.map((card) => (
          <button
            key={card.instanceId}
            onClick={() => sendAction({ type: "ATTACH_DON", targetInstanceId: card.instanceId, count: 1 })}
            className="text-[9px] px-2 py-0.5 rounded bg-[--navy-700] text-[--text-inverse] hover:bg-[--navy-600] text-left truncate transition-colors"
          >
            +1 → {card.cardId}
          </button>
        ))}
      </div>
    </div>
  );
}
