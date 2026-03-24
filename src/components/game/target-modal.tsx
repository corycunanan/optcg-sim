import { useEffect, useRef } from "react";
import type { CardDb } from "@shared/game-types";

export interface ModalTarget {
  instanceId: string;
  cardId: string;
  label: string;
  sublabel?: string;
}

export interface ModalState {
  title: string;
  targets: ModalTarget[];
  onSelect: (instanceId: string) => void;
  optional?: boolean;
  onSkip?: () => void;
}

export function TargetModal({ modal, onClose, cardDb }: { modal: ModalState; onClose: () => void; cardDb: CardDb }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/75 z-100 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="target-modal-title">
      <div ref={panelRef} tabIndex={-1} className="bg-gb-surface border border-gb-border-strong rounded-md p-5 min-w-80 max-w-[480px] w-[90%] font-mono outline-none">
        <div id="target-modal-title" className="font-bold text-gb-text-bright text-sm mb-3">
          {modal.title}
        </div>
        <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
          {modal.targets.map((t) => {
            const data = cardDb[t.cardId];
            return (
              <button
                key={t.instanceId}
                onClick={() => modal.onSelect(t.instanceId)}
                className="bg-gb-surface-raised border border-gb-border-strong rounded px-3 py-2 text-left cursor-pointer text-gb-text font-[inherit] text-xs transition-colors duration-100 hover:bg-gb-border-strong/50 focus-visible:ring-2 focus-visible:ring-gb-accent-blue focus-visible:ring-offset-1 focus-visible:ring-offset-gb-surface"
              >
                <div className="font-bold text-gb-accent-blue">{t.label}</div>
                {t.sublabel && <div className="text-xs text-gb-text-muted mt-0.5">{t.sublabel}</div>}
                {data && (
                  <div className="flex gap-2.5 mt-1 text-xs">
                    {data.cost !== null && <span className="text-gb-accent-amber">Cost {data.cost}</span>}
                    {data.power !== null && <span className="text-gb-accent-green">Pwr {data.power.toLocaleString()}</span>}
                    {data.counter !== null && <span className="text-gb-accent-purple">Ctr +{data.counter}</span>}
                    <span className="text-gb-text-muted">{data.type}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-3">
          {modal.optional && modal.onSkip && (
            <button
              onClick={modal.onSkip}
              className="flex-1 px-2 py-1 bg-gb-surface-raised border border-gb-border-strong text-gb-text-subtle cursor-pointer rounded text-xs font-mono hover:border-gb-text-muted focus-visible:ring-2 focus-visible:ring-gb-accent-blue"
            >
              Skip
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-2 py-1 bg-gb-surface-raised border border-gb-border-strong text-gb-text-subtle cursor-pointer rounded text-xs font-mono hover:border-gb-text-muted focus-visible:ring-2 focus-visible:ring-gb-accent-blue"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
