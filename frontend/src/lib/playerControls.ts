import { usePlayerStore } from "../stores/playerStore";
import { sendCommand } from "./syncBus";

/** Seek relative to the current position, sync-role aware. */
export function seekRelative(deltaSeconds: number): void {
  const store = usePlayerStore.getState();
  if (store.position < 0) return;
  const target = Math.max(0, store.lastKnownTime + deltaSeconds);
  if (store.syncRole === "remote") {
    sendCommand("seek", target);
  } else {
    usePlayerStore.setState({ remoteSeekRequest: target });
  }
}
