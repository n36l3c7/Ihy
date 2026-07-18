/** Indirection between the player store and the cross-tab sync layer:
 *  the store sends commands here when the tab is a remote; playerSync
 *  installs the actual sender. Avoids a circular import. */

export interface SyncCommand {
  name: string;
  args: unknown[];
}

type Sender = (command: SyncCommand) => void;

let sender: Sender | null = null;

export function setCommandSender(nextSender: Sender | null): void {
  sender = nextSender;
}

export function sendCommand(name: string, ...args: unknown[]): void {
  sender?.({ name, args });
}
