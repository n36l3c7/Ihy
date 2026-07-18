import { create } from "zustand";

interface CastState {
  available: boolean; // Cast SDK loaded and a device is reachable
  connected: boolean; // an active session exists
  deviceName: string | null;
  remoteTime: number; // playback position reported by the receiver
  setAvailable: (available: boolean) => void;
  setConnected: (connected: boolean, deviceName?: string | null) => void;
  setRemoteTime: (seconds: number) => void;
}

export const useCastStore = create<CastState>((set) => ({
  available: false,
  connected: false,
  deviceName: null,
  remoteTime: 0,
  setAvailable: (available) => set({ available }),
  setConnected: (connected, deviceName = null) =>
    set({ connected, deviceName, ...(connected ? {} : { remoteTime: 0 }) }),
  setRemoteTime: (remoteTime) => set({ remoteTime }),
}));
