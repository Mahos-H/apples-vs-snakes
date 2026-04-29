export type Vec = { x: number; y: number };
export type Dir = "up" | "down" | "left" | "right";

export type PlayerId = string;

export type PlayerColor = "red" | "yellow" | "green";

export const PLAYER_COLORS: PlayerColor[] = ["red", "yellow", "green"];
export const PLAYER_COLOR_HEX: Record<PlayerColor, string> = {
  red:    "#ef4444",
  yellow: "#facc15",
  green:  "#22c55e",
};

export type PlayerState = {
  id: PlayerId;
  color: PlayerColor;
  pos: Vec;
  alive: boolean;
  survivedMs: number;  // ms survived this round
};

/** Full authoritative game state published by host every tick */
export type GameState = {
  players: PlayerState[];
  snake: Vec[];
  npcFood:     Vec;                    // blue — exactly 1 NPC apple, snake eats it
  size: number;
  tickMs: number;
  isOver: boolean;
  overReason: string;
  score: number;    // snake score
  hostId: PlayerId;
};

export type MsgGameState = {
  type: "GAME_STATE";
  state: GameState;
};

export type MsgPlayerInput = {
  type: "PLAYER_INPUT";
  playerId: PlayerId;
  dir: Dir;
};

export type MsgJoinRequest = {
  type: "JOIN_REQUEST";
  playerId: PlayerId;
};

export type MsgJoinAck = {
  type: "JOIN_ACK";
  playerId: PlayerId;
  color: PlayerColor;
  accepted: boolean;
  reason?: string;
};

export type MsgReady = {
  type: "PLAYER_READY";
  playerId: PlayerId;
  ready: boolean;
};

export type MsgCountdown = {
  type: "COUNTDOWN";
  count: number; // 3, 2, 1, 0 (0 = go!)
};

export type AblyMsg =
  | MsgGameState
  | MsgPlayerInput
  | MsgJoinRequest
  | MsgJoinAck
  | MsgReady
  | MsgCountdown;