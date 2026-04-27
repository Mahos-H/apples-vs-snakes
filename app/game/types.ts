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
};

/** Full authoritative game state published by host every tick */
export type GameState = {
  players: PlayerState[];
  snake: Vec[];
  npcFoods:    Vec[];                  // blue — NPC apples (always present, snake eats them)
  playerFoods: Record<PlayerId, Vec>;  // colored apple per player (only that player eats it)
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

export type AblyMsg =
  | MsgGameState
  | MsgPlayerInput
  | MsgJoinRequest
  | MsgJoinAck;