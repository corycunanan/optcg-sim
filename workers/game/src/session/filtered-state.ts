import {
  computeEffectAvailability,
  effectAvailabilityForRecipient,
} from "../engine/availability.js";
import type { CardData, GameState } from "../types.js";
import {
  type FilteredStateMessage,
  type FilteredStateMessageBuilder,
  type FilteredStateRecipient,
  SessionTransport,
} from "./transport.js";

/** Builds every recipient-filtered state envelope, including connect snapshots. */
export class SessionFilteredState {
  constructor(
    private readonly transport: SessionTransport,
    private readonly readState: () => GameState,
    private readonly readCardDb: () => Map<string, CardData>
  ) {}

  buildStateSnapshot(
    recipient: FilteredStateRecipient,
    canUndo?: boolean
  ): FilteredStateMessage {
    return this.createStateSnapshotBuilder(canUndo)(recipient);
  }

  createStateSnapshotBuilder(
    canUndo?: boolean
  ): (recipient: FilteredStateRecipient) => FilteredStateMessage {
    return this.createBuilder((state) => ({
      type: "game:state",
      state,
      ...(canUndo === undefined ? {} : { canUndo }),
    }));
  }

  broadcastState(canUndo?: boolean, exclude?: WebSocket): void {
    const build = this.createStateSnapshotBuilder(canUndo);
    this.transport.broadcastFilteredMessages(build, exclude, this.readState().id);
  }

  broadcast(
    buildEnvelope: FilteredStateMessageBuilder,
    exclude?: WebSocket
  ): void {
    this.transport.broadcastFilteredMessages(
      this.createBuilder(buildEnvelope),
      exclude,
      this.readState().id
    );
  }

  private createBuilder(
    buildEnvelope: FilteredStateMessageBuilder
  ): (recipient: FilteredStateRecipient) => FilteredStateMessage {
    const state = this.readState();
    const cardDb = this.readCardDb();
    const availability = computeEffectAvailability(state, cardDb);
    return (recipient) =>
      this.transport.buildFilteredStateForRecipient(
        state,
        cardDb,
        recipient,
        (filteredState, recipientPlayerIndex) =>
          buildEnvelope(
            {
              ...filteredState,
              effectAvailability: effectAvailabilityForRecipient(
                state,
                availability,
                recipientPlayerIndex
              ),
            },
            recipientPlayerIndex
          )
      );
  }
}
