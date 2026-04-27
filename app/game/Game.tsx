"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine, GameState } from "./engine";
import { Dir, PlayerId, PLAYER_COLOR_HEX, PlayerColor, AblyMsg } from "./types";
import { eq, keyOf } from "./utils";
import { connectAbly, AblyChannel } from "./ably";

// ─── colour palette ────────────────────────────────────────────────────────────
const BG          = "#080c10";
const CELL_EMPTY  = "rgba(255,255,255,0.055)";
const CELL_BORDER = "1px solid rgba(255,255,255,0.06)";
const SNAKE_HEAD  = "#7c3aed";
const SNAKE_BODY  = "#5b21b6";
const FOOD_NPC    = "#38bdf8";  // blue — NPC apple

function genPlayerId() {
  return Math.random().toString(36).slice(2, 9);
}

function genRoomCode() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

// ─── Lobby screen ─────────────────────────────────────────────────────────────
function Lobby({
  onHost,
  onJoin,
  error,
  connecting = false,
}: {
  onHost: () => void;
  onJoin: (code: string) => void;
  error: string;
  connecting?: boolean;
}) {
  const [code, setCode] = useState("");
  return (
    <div style={{
      height: "100dvh", width: "100dvw",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: BG, color: "#e6edf3", gap: 20,
      fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>
        🐍 MULTIPLAYER SNAKE
      </div>

      {/* Rules card */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12, padding: "16px 24px",
        fontSize: 13, lineHeight: 2, maxWidth: 360,
        color: "#e6edf3",
      }}>
        <div><span style={{ color: "#7c3aed", fontWeight: 700 }}>■ Purple snake</span> — hunts you. Avoid it.</div>
        <div><span style={{ color: "#7c3aed" }}>  </span>Gets longer &amp; faster every time it eats.</div>
        <div style={{ marginTop: 4 }}><span style={{ color: "#38bdf8", fontWeight: 700 }}>● Blue apples</span> — what the snake hunts.</div>
        <div style={{ marginTop: 4 }}>
          <span style={{ color: "#ef4444", fontWeight: 700 }}>● Red</span> ·{" "}
          <span style={{ color: "#facc15", fontWeight: 700 }}>Yellow</span> ·{" "}
          <span style={{ color: "#22c55e", fontWeight: 700 }}>Green</span>
          {" "}— that's you (up to 3 players).
        </div>
        <div style={{ marginTop: 4 }}>🎮 <strong>WASD</strong> to move.</div>
        <div>🌀 You can phase through walls — the snake can't.</div>
        <div>💀 Snake touches you = game over.</div>
      </div>

      <button
        onClick={onHost}
        disabled={connecting}
        style={btnStyle(connecting ? "#555" : "#7c3aed")}
      >
        {connecting ? "Connecting…" : "Create Room (Host)"}
      </button>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="Room code"
          style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#e6edf3", fontSize: 16,
            fontFamily: "inherit", width: 140, textAlign: "center",
          }}
        />
        <button
          onClick={() => !connecting && code.length >= 4 && onJoin(code)}
          disabled={connecting}
          style={btnStyle(connecting ? "#555" : "#0ea5e9")}
        >
          {connecting ? "Connecting…" : "Join Room"}
        </button>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    padding: "10px 24px", borderRadius: 10,
    background: color, border: "none",
    color: "#fff", fontWeight: 700, fontSize: 15,
    cursor: "pointer", fontFamily: "inherit",
    letterSpacing: 1,
  };
}

// ─── Waiting room ─────────────────────────────────────────────────────────────
function WaitingRoom({
  roomCode,
  players,
  isHost,
  onStart,
  myColor,
}: {
  roomCode: string;
  players: { id: PlayerId; color: PlayerColor }[];
  isHost: boolean;
  onStart: () => void;
  myColor: PlayerColor | null;
}) {
  return (
    <div style={{
      height: "100dvh", width: "100dvw",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: BG, color: "#e6edf3", gap: 20,
      fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
    }}>
      <div style={{ fontSize: 22, fontWeight: 800 }}>Room: <span style={{ color: "#a78bfa" }}>{roomCode}</span></div>
      <div style={{ opacity: 0.55, fontSize: 12 }}>Share this code with up to 2 friends</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 200 }}>
        {players.map(p => (
          <div key={p.id} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 14px", borderRadius: 8,
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${PLAYER_COLOR_HEX[p.color]}44`,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: 3,
              background: PLAYER_COLOR_HEX[p.color],
            }} />
            <span style={{ opacity: 0.85 }}>{p.id === players[0].id ? "Host" : "Guest"}</span>
            {p.color === myColor && <span style={{ opacity: 0.5, fontSize: 11 }}>(you)</span>}
          </div>
        ))}
      </div>

      {isHost && (
        <button
          onClick={onStart}
          disabled={players.length < 1}
          style={btnStyle(players.length >= 1 ? "#22c55e" : "#444")}
        >
          Start Game ({players.length}/3)
        </button>
      )}
      {!isHost && (
        <div style={{ opacity: 0.5, fontSize: 13 }}>Waiting for host to start…</div>
      )}
    </div>
  );
}

// ─── Main Game component ───────────────────────────────────────────────────────

type Screen = "lobby" | "waiting" | "playing";

export default function Game() {
  const [screen, setScreen]         = useState<Screen>("lobby");
  const [lobbyError, setLobbyError] = useState("");
  const [roomCode, setRoomCode]     = useState("");
  const [myId]                      = useState<PlayerId>(genPlayerId);
  const [myColor, setMyColor]       = useState<PlayerColor | null>(null);
  const [isHost, setIsHost]         = useState(false);

  // rendered game state (guests use this; host derives from engine)
  const [renderedState, setRenderedState] = useState<GameState | null>(null);

  // waiting-room player list (before game starts)
  const [waitingPlayers, setWaitingPlayers] = useState<{ id: PlayerId; color: PlayerColor }[]>([]);

  const channelRef  = useRef<AblyChannel | null>(null);
  const rootRef     = useRef<HTMLDivElement | null>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // host-only engine
  const engine = useGameEngine(myId);

  // ── host: wire engine tick → publish state ───────────────────────────
  useEffect(() => {
    engine.onTickRef.current = (state: GameState) => {
      console.log("[TICK] snake len:", state.snake.length, "players:", state.players.length);
      channelRef.current?.publish({ type: "GAME_STATE", state });
      setRenderedState(state);
    };
  }, []);

  // ── cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      engine.stopLoop();
      channelRef.current?.detach();
    };
  }, []);

  // ── Host: create room ────────────────────────────────────────────────
  async function handleHost() {
    console.log("[HOST] clicked");
    setLobbyError('');
    setConnecting(true);
    const code = genRoomCode();
    try {
      console.log("[HOST] calling connectAbly...");
      const ch = await connectAbly(code);
      console.log("[HOST] connected! setting up...");

      setConnecting(false);
      setRoomCode(code);
      setIsHost(true);
      channelRef.current = ch;

      const { color } = engine.addPlayer(myId);
      setMyColor(color);
      setWaitingPlayers([{ id: myId, color }]);

      ch.subscribe((msg: AblyMsg) => {
        console.log("[HOST] msg:", msg.type);
        if (msg.type === "JOIN_REQUEST") {
          const { playerId } = msg;
          const result = engine.addPlayer(playerId);
          if (result.accepted) {
            setWaitingPlayers(prev => {
              if (prev.find(p => p.id === playerId)) return prev;
              return [...prev, { id: playerId, color: result.color }];
            });
            ch.publish({ type: "JOIN_ACK", playerId, color: result.color, accepted: true });
          } else {
            ch.publish({ type: "JOIN_ACK", playerId, color: "red", accepted: false, reason: result.reason });
          }
        }
        if (msg.type === "PLAYER_INPUT") {
          engine.receiveInput(msg.playerId, msg.dir);
        }
      });

      setScreen("waiting");
    } catch (e: any) {
      console.error("[HOST] error:", e);
      setConnecting(false);
      setLobbyError(String(e?.message ?? e));
    }
  }

  // ── Guest: join room ─────────────────────────────────────────────────
  async function handleJoin(code: string) {
    console.log("[GUEST] joining", code);
    setLobbyError('');
    setConnecting(true);
    try {
      const ch = await connectAbly(code);
      console.log("[GUEST] connected");
      setConnecting(false);
      channelRef.current = ch;
      setRoomCode(code);
      setIsHost(false);

      ch.subscribe((msg: AblyMsg) => {
        console.log("[GUEST] msg:", msg.type);
        if (msg.type === "JOIN_ACK" && msg.playerId === myId) {
          if (!msg.accepted) {
            setLobbyError(msg.reason ?? "Could not join room.");
            ch.detach();
            return;
          }
          setMyColor(msg.color);
          setScreen("waiting");
        }
        if (msg.type === "GAME_STATE") {
          setScreen("playing");
          setRenderedState(msg.state);
          setWaitingPlayers(msg.state.players.map(p => ({ id: p.id, color: p.color })));
        }
      });

      console.log("[GUEST] publishing JOIN_REQUEST, myId:", myId);
      ch.publish({ type: "JOIN_REQUEST", playerId: myId });
    } catch (e: any) {
      console.error("[GUEST] error:", e);
      setConnecting(false);
      setLobbyError(String(e?.message ?? e));
    }
  }

  // ── Host: start game ─────────────────────────────────────────────────
  function handleStart() {
    console.log("[HOST] handleStart called, players:", engine.playersRef.current.size);
    engine.resetGame();
    engine.startLoop();
    setScreen("playing");
    // broadcast initial state
    const state = engine.buildState();
    channelRef.current?.publish({ type: "GAME_STATE", state });
    setRenderedState(state);
  }

  // ── Input: guests publish dir, host calls engine directly ────────────
  const tryMovePlayer = useCallback((dir: Dir) => {
    if (!renderedState || renderedState.isOver) return;
    if (isHost) {
      engine.receiveInput(myId, dir);
    } else {
      channelRef.current?.publish({
        type: "PLAYER_INPUT",
        playerId: myId,
        dir,
      });
    }
  }, [isHost, renderedState, myId]);

  // ── Keyboard ─────────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (screen !== "playing") return;
    if (e.repeat) return;

    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      if (isHost) {
        engine.resetGame();
        engine.startLoop();
        const state = engine.buildState();
        channelRef.current?.publish({ type: "GAME_STATE", state });
        setRenderedState(state);
      }
      return;
    }

    let d: Dir | null = null;
    if (e.key === "ArrowUp"    || e.key === "w" || e.key === "W") d = "up";
    if (e.key === "ArrowDown"  || e.key === "s" || e.key === "S") d = "down";
    if (e.key === "ArrowLeft"  || e.key === "a" || e.key === "A") d = "left";
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") d = "right";
    if (!d) return;
    e.preventDefault();
    tryMovePlayer(d);
  }

  // ─── render lobby / waiting ─────────────────────────────────────────
  if (screen === "lobby") {
    return (
      <Lobby
        onHost={handleHost}
        onJoin={handleJoin}
        error={lobbyError}
        connecting={connecting}
      />
    );
  }

  if (screen === "waiting") {
    return (
      <WaitingRoom
        roomCode={roomCode}
        players={waitingPlayers}
        isHost={isHost}
        onStart={handleStart}
        myColor={myColor}
      />
    );
  }

  // ─── playing ────────────────────────────────────────────────────────
  const state = renderedState;
  if (!state) {
    return (
      <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: BG, color: "#e6edf3" }}>
        Loading…
      </div>
    );
  }

  const { size, snake, npcFood, players, score, isOver, overReason, tickMs } = state;

  const snakeKeyToIndex = new Map<string, number>();
  snake.forEach((v, i) => snakeKeyToIndex.set(keyOf(v), i));

  const playerKeyToColor = new Map<string, string>();
  for (const p of players) {
    if (p.alive) playerKeyToColor.set(keyOf(p.pos), PLAYER_COLOR_HEX[p.color]);
  }
  const npcFoodKey = keyOf(npcFood);

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setHasFocus(true)}
      style={{
        height: "100dvh", width: "100dvw",
        display: "flex", flexDirection: "column",
        outline: "none", background: BG, color: "#e6edf3",
        fontFamily: "'JetBrains Mono','Fira Mono',monospace",
      }}
    >
      {/* ── header ── */}
      <header style={{
        padding: "8px 14px",
        display: "flex", gap: 16, alignItems: "center",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        flexWrap: "wrap", fontSize: 13,
      }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>🐍 Snake</span>
        <span style={{ opacity: 0.7 }}>Room: <b style={{ color: "#a78bfa" }}>{roomCode}</b></span>
        <span style={{ opacity: 0.7 }}>Grid: {size}×{size}</span>
        <span style={{ opacity: 0.7 }}>Score: {score}</span>
        <span style={{ opacity: 0.7 }}>Speed: {tickMs}ms</span>

        {/* player legend */}
        <div style={{ display: "flex", gap: 10 }}>
          {players.map(p => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 5, opacity: p.alive ? 1 : 0.35 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: PLAYER_COLOR_HEX[p.color] }} />
              <span style={{ fontSize: 11 }}>
                {p.id === myId ? "You" : p.color}
                {!p.alive ? " ☠" : ""}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginLeft: "auto", opacity: 0.5, fontSize: 11 }}>
          WASD to move · R=restart{!isHost ? " (host only)" : ""}
        </div>
      </header>

      {/* ── grid ── */}
      <main style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <div
          onPointerDown={() => { rootRef.current?.focus({ preventScroll: true }); setHasFocus(true); }}
          style={{
            width: "min(96vmin, 860px)",
            aspectRatio: "1 / 1",
            display: "grid",
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
            gap: "0.5vmin",
            padding: "1vmin",
            borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {!hasFocus && (
            <div
              onPointerDown={() => { rootRef.current?.focus({ preventScroll: true }); setHasFocus(true); }}
              style={{
                position: "absolute", inset: 0,
                display: "grid", placeItems: "center",
                background: "rgba(0,0,0,0.6)", borderRadius: 14,
                cursor: "pointer", zIndex: 5, userSelect: "none",
              }}
            >
              <div style={{
                padding: "12px 18px", borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}>
                Click to focus · WASD / Arrow keys
              </div>
            </div>
          )}

          {isOver && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.72)", borderRadius: 14,
              zIndex: 10, gap: 12,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>Game Over</div>
              <div style={{ opacity: 0.8, fontSize: 14, textAlign: "center", maxWidth: 320 }}>{overReason}</div>
              {isHost && (
                <button
                  onClick={() => {
                    engine.resetGame();
                    engine.startLoop();
                    const s = engine.buildState();
                    channelRef.current?.publish({ type: "GAME_STATE", state: s });
                    setRenderedState(s);
                  }}
                  style={btnStyle("#7c3aed")}
                >
                  Play Again
                </button>
              )}
              {!isHost && <div style={{ opacity: 0.5, fontSize: 12 }}>Waiting for host to restart…</div>}
            </div>
          )}

          {Array.from({ length: size * size }).map((_, idx) => {
            const x = idx % size;
            const y = Math.floor(idx / size);
            const k = `${x},${y}`;

            const si  = snakeKeyToIndex.get(k);
            const isSnake  = si !== undefined;
            const isHead   = si === 0;
            const cellKey   = `${x},${y}`;
            const isNpcFood = cellKey === npcFoodKey;
            const pColor   = playerKeyToColor.get(k);

            let bg     = CELL_EMPTY;
            let border = CELL_BORDER;
            let radius = 6;

            if (isSnake) {
              bg     = isHead ? SNAKE_HEAD : SNAKE_BODY;
              border = "1px solid rgba(0,0,0,0.22)";
              radius = isHead ? 10 : 6;
            }
            if (isNpcFood) {
              bg     = FOOD_NPC;
              border = "1px solid rgba(0,0,0,0.22)";
              radius = 999;
            }
            if (pColor) {
              bg     = pColor;
              border = "1px solid rgba(0,0,0,0.22)";
              radius = 8;
            }

            return (
              <div
                key={k}
                style={{
                  borderRadius: radius,
                  background: bg,
                  border,
                  boxSizing: "border-box",
                  transition: "background 0.05s",
                }}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}