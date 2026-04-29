/**
 * ably.ts — thin wrapper around Ably Realtime
 *
 * Each call to connectAbly creates its own Ably Realtime client so that
 * echoMessages: false works correctly per-connection (host and guest are
 * separate clients even if on the same browser tab during testing).
 */

import { AblyMsg } from "./types";

declare const Ably: any; // loaded from CDN

function createAblyClient(): any {
  if (typeof Ably === "undefined") throw new Error("Ably SDK not loaded yet — check your layout.tsx script tag");
  // authUrl calls your server-side API route — the real key never touches the browser
  return new Ably.Realtime({ authUrl: "/api/ably-token", echoMessages: false });
}

export type AblyChannel = {
  publish: (msg: AblyMsg) => void;
  subscribe: (cb: (msg: AblyMsg) => void) => void;
  unsubscribe: () => void;
  detach: () => void;
};

export async function connectAbly(roomCode: string): Promise<AblyChannel> {
  const client  = createAblyClient();
  const channel = client.channels.get(`snake-room-${roomCode}`);

  try {
    await channel.attach();
  } catch (e) {
    client.close();
    throw e;
  }

  let _cb: ((msg: AblyMsg) => void) | null = null;

  channel.subscribe("game", (ablyMsg: any) => {
    _cb?.(ablyMsg.data as AblyMsg);
  });

  return {
    publish(msg: AblyMsg) {
      channel.publish("game", msg);
    },
    subscribe(cb: (msg: AblyMsg) => void) {
      _cb = cb;
    },
    unsubscribe() {
      _cb = null;
    },
    detach() {
      channel.detach();
      client.close();
    },
  };
}