import {
  type RemoteState,
  selectOrderedTracks,
  usePlayerStore,
} from "../stores/playerStore";
import { setCommandSender, type SyncCommand } from "./syncBus";

const TAB_ID = Math.random().toString(36).slice(2);
const HEARTBEAT_MS = 2000;
const LEADER_TIMEOUT_MS = 6000;

type Message =
  | { type: "hello"; from: string }
  | { type: "claim"; from: string }
  | { type: "state"; from: string; state: RemoteState }
  | { type: "command"; from: string; command: SyncCommand };

let channel: BroadcastChannel | null = null;
let started = false;
let lastStateAt = 0;

function serialize(): RemoteState {
  const state = usePlayerStore.getState();
  return {
    tracks: selectOrderedTracks(state),
    position: state.position,
    isPlaying: state.isPlaying,
    repeat: state.repeat,
    volume: state.volume,
    playbackRate: state.playbackRate,
    currentTime: state.lastKnownTime,
  };
}

function broadcastState(): void {
  if (usePlayerStore.getState().syncRole === "leader") {
    channel?.postMessage({ type: "state", from: TAB_ID, state: serialize() } as Message);
  }
}

function applyCommand(command: SyncCommand): void {
  const store = usePlayerStore.getState();
  const args = command.args as never[];
  switch (command.name) {
    case "playQueue":
      store.playQueue(args[0], args[1]);
      break;
    case "togglePlay":
      store.togglePlay();
      break;
    case "setPlaying":
      store.setPlaying(args[0]);
      break;
    case "next":
      store.next();
      break;
    case "previous":
      store.previous();
      break;
    case "toggleShuffle":
      store.toggleShuffle();
      break;
    case "cycleRepeat":
      store.cycleRepeat();
      break;
    case "setVolume":
      store.setVolume(args[0]);
      break;
    case "setPlaybackRate":
      store.setPlaybackRate(args[0]);
      break;
    case "setSleepEndsAt":
      store.setSleepEndsAt(args[0]);
      break;
    case "setStopAfterTrack":
      store.setStopAfterTrack(args[0]);
      break;
    case "jumpTo":
      store.jumpTo(args[0]);
      break;
    case "removeAt":
      store.removeAt(args[0]);
      break;
    case "moveTo":
      store.moveTo(args[0], args[1]);
      break;
    case "enqueueNext":
      store.enqueueNext(args[0]);
      break;
    case "enqueueEnd":
      store.enqueueEnd(args[0]);
      break;
    case "seek":
      usePlayerStore.setState({ remoteSeekRequest: args[0] });
      break;
  }
}

/** Spotify Connect-style tab sync: exactly one tab plays audio, the
 *  others mirror its state and act as remote controls. Starting playback
 *  in any tab moves the playback there. */
export function initPlayerSync(): void {
  if (started || typeof BroadcastChannel === "undefined") return;
  started = true;
  channel = new BroadcastChannel("ihy-player-sync");
  setCommandSender((command) =>
    channel?.postMessage({ type: "command", from: TAB_ID, command } as Message),
  );

  channel.onmessage = (event: MessageEvent<Message>) => {
    const message = event.data;
    if (message.from === TAB_ID) return;
    const store = usePlayerStore.getState();
    switch (message.type) {
      case "hello":
        broadcastState();
        break;
      case "claim":
        lastStateAt = Date.now();
        if (store.syncRole === "leader") {
          // Another tab took playback over: stop here, become a remote
          usePlayerStore.setState({ isPlaying: false });
          store.setSyncRole("remote");
        } else if (store.syncRole === "standalone") {
          store.setSyncRole("remote");
        }
        break;
      case "state":
        if (store.syncRole !== "leader") {
          lastStateAt = Date.now();
          if (store.syncRole !== "remote") store.setSyncRole("remote");
          store.applyRemoteState(message.state);
        }
        break;
      case "command":
        if (store.syncRole === "leader") applyCommand(message.command);
        break;
    }
  };

  // Starting playback in this tab claims leadership
  usePlayerStore.subscribe((state, previous) => {
    if (state.isPlaying && !previous.isPlaying && state.syncRole === "standalone") {
      state.setSyncRole("leader");
      channel?.postMessage({ type: "claim", from: TAB_ID } as Message);
      broadcastState();
    }
  });

  // Leader: broadcast state changes (throttled)
  let throttle: number | undefined;
  usePlayerStore.subscribe((state) => {
    if (state.syncRole !== "leader" || throttle !== undefined) return;
    throttle = window.setTimeout(() => {
      throttle = undefined;
      broadcastState();
    }, 500);
  });

  // Heartbeat + leader-loss detection
  window.setInterval(() => {
    const store = usePlayerStore.getState();
    if (store.syncRole === "leader") {
      broadcastState();
    } else if (store.syncRole === "remote" && Date.now() - lastStateAt > LEADER_TIMEOUT_MS) {
      // The playing tab is gone; keep the state here, paused
      usePlayerStore.setState({ isPlaying: false, syncRole: "standalone" });
    }
  }, HEARTBEAT_MS);

  channel.postMessage({ type: "hello", from: TAB_ID } as Message);
}
