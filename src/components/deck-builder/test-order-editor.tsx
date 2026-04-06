"use client";

import { useCallback, useMemo } from "react";
import type { DeckCardEntry, DeckLeaderEntry, TestDeckOrder } from "@/lib/deck-builder/state";

interface TestOrderEditorProps {
  leader: DeckLeaderEntry | null;
  cards: Map<string, DeckCardEntry>;
  testOrder: TestDeckOrder | null;
  onChangeTestOrder: (testOrder: TestDeckOrder | null) => void;
}

export function TestOrderEditor({
  leader,
  cards,
  testOrder,
  onChangeTestOrder,
}: TestOrderEditorProps) {
  const leaderLife = leader?.life ?? 5;
  const lifeSlots = leaderLife;
  const handSlots = 5;

  // Build available card options with remaining quantities
  const cardOptions = useMemo(() => {
    const entries = Array.from(cards.values());
    return entries.map((e) => ({
      cardId: e.cardId,
      name: e.card.name,
      quantity: e.quantity,
    }));
  }, [cards]);

  // Count how many times each cardId is used across all slots
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!testOrder) return counts;
    for (const id of [...testOrder.life, ...testOrder.hand]) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [testOrder]);

  // Get remaining quantity for a card, excluding the current slot's usage
  const getRemainingQty = useCallback(
    (cardId: string, currentSlotValue: string | null) => {
      const option = cardOptions.find((o) => o.cardId === cardId);
      if (!option) return 0;
      const used = usageCounts.get(cardId) ?? 0;
      // If current slot already holds this card, one usage is "ours"
      const adjustment = currentSlotValue === cardId ? 1 : 0;
      return option.quantity - used + adjustment;
    },
    [cardOptions, usageCounts],
  );

  const totalCards = Array.from(cards.values()).reduce((sum, e) => sum + e.quantity, 0);
  const hasEnoughCards = totalCards >= lifeSlots + handSlots;

  if (!leader) {
    return (
      <div className="text-content-tertiary text-sm">
        Select a leader first to configure test order.
      </div>
    );
  }

  if (!hasEnoughCards) {
    return (
      <div className="text-content-tertiary text-sm">
        Add at least {lifeSlots + handSlots} cards to your deck to configure test order.
      </div>
    );
  }

  const life = testOrder?.life ?? new Array(lifeSlots).fill("");
  const hand = testOrder?.hand ?? new Array(handSlots).fill("");

  const updateSlot = (zone: "life" | "hand", index: number, cardId: string) => {
    const newLife = [...life];
    const newHand = [...hand];

    if (zone === "life") {
      newLife[index] = cardId;
    } else {
      newHand[index] = cardId;
    }

    // If all slots are empty, clear the test order
    const allEmpty = [...newLife, ...newHand].every((id) => id === "");
    if (allEmpty) {
      onChangeTestOrder(null);
      return;
    }

    onChangeTestOrder({ life: newLife, hand: newHand });
  };

  const isComplete =
    testOrder !== null &&
    testOrder.life.length === lifeSlots &&
    testOrder.hand.length === handSlots &&
    testOrder.life.every((id) => id !== "") &&
    testOrder.hand.every((id) => id !== "");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-content-primary">Test Deck Order</h3>
        <p className="text-xs text-content-tertiary">
          Configure which cards appear in your life area and opening hand for testing.
          Remaining cards will be shuffled normally.
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2">
        <div
          className={`size-2 rounded-full ${isComplete ? "bg-green-500" : "bg-content-tertiary"}`}
        />
        <span className="text-xs text-content-secondary">
          {isComplete
            ? "Test order active — will be used next game"
            : testOrder
              ? "Incomplete — fill all slots to activate"
              : "Not configured — deck will shuffle normally"}
        </span>
      </div>

      {/* Life section */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium text-content-secondary uppercase tracking-wider">
          Life ({lifeSlots} cards)
        </h4>
        <div className="space-y-2">
          {life.map((cardId, i) => (
            <SlotSelect
              key={`life-${i}`}
              label={`Life ${i + 1}`}
              value={cardId}
              options={cardOptions}
              getRemainingQty={getRemainingQty}
              onChange={(id) => updateSlot("life", i, id)}
            />
          ))}
        </div>
      </section>

      {/* Hand section */}
      <section className="space-y-3">
        <h4 className="text-xs font-medium text-content-secondary uppercase tracking-wider">
          Opening Hand (5 cards)
        </h4>
        <div className="space-y-2">
          {hand.map((cardId, i) => (
            <SlotSelect
              key={`hand-${i}`}
              label={`Hand ${i + 1}`}
              value={cardId}
              options={cardOptions}
              getRemainingQty={getRemainingQty}
              onChange={(id) => updateSlot("hand", i, id)}
            />
          ))}
        </div>
      </section>

      {/* Clear button */}
      {testOrder && (
        <button
          onClick={() => onChangeTestOrder(null)}
          className="rounded-md border border-border px-3 py-2 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-2 hover:text-content-primary"
        >
          Clear Test Order
        </button>
      )}
    </div>
  );
}

function SlotSelect({
  label,
  value,
  options,
  getRemainingQty,
  onChange,
}: {
  label: string;
  value: string;
  options: { cardId: string; name: string; quantity: number }[];
  getRemainingQty: (cardId: string, currentSlotValue: string | null) => number;
  onChange: (cardId: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-xs text-content-tertiary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-content-primary"
      >
        <option value="">— empty —</option>
        {options.map((opt) => {
          const remaining = getRemainingQty(opt.cardId, value);
          const isCurrentValue = value === opt.cardId;
          const isAvailable = remaining > 0 || isCurrentValue;
          return (
            <option key={opt.cardId} value={opt.cardId} disabled={!isAvailable}>
              {opt.name} ({opt.cardId}) — {remaining} left
            </option>
          );
        })}
      </select>
    </div>
  );
}
