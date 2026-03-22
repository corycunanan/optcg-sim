import type { CardData } from "@shared/game-types";

type CardDb = Record<string, CardData>;

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
  return (
    <div className="fixed inset-0 bg-black/75 z-100 flex items-center justify-center">
      <div className="bg-gb-surface border border-gb-border-strong rounded-md p-5 min-w-80 max-w-[480px] w-[90%] font-mono">
        <div className="font-bold text-gb-text-bright text-[13px] mb-3">
          {modal.title}
        </div>
        <div className="flex flex-col gap-1 max-h-[360px] overflow-y-auto">
          {modal.targets.map((t) => {
            const data = cardDb[t.cardId];
            return (
              <button
                key={t.instanceId}
                onClick={() => modal.onSelect(t.instanceId)}
                className="bg-gb-surface-raised border border-gb-border-strong rounded px-3 py-2 text-left cursor-pointer text-gb-text font-[inherit] text-xs transition-colors duration-100 hover:bg-gb-border-strong/50"
              >
                <div className="font-bold text-gb-accent-blue">{t.label}</div>
                {t.sublabel && <div className="text-[10px] text-gb-text-muted mt-0.5">{t.sublabel}</div>}
                {data && (
                  <div className="flex gap-2.5 mt-1 text-[10px]">
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
              className="flex-1 px-2 py-1 bg-gb-surface-raised border border-gb-border-strong text-gb-text-subtle cursor-pointer rounded text-xs font-mono hover:border-gb-text-muted"
            >
              Skip
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-2 py-1 bg-gb-surface-raised border border-gb-border-strong text-gb-text-subtle cursor-pointer rounded text-xs font-mono hover:border-gb-text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
