"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGameEngine, GameState } from "./engine";
import { Dir, PlayerId, PLAYER_COLOR_HEX, PlayerColor, AblyMsg, MsgReady, MsgCountdown } from "./types";
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
  return Math.random().toString(36).slice(2, 10).toUpperCase().slice(0, 8);
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
  const trimmedCode = code.trim().toUpperCase();

  function handleHostClick() {
    if (!connecting) onHost();
  }

  function handleJoinClick() {
    if (!connecting && trimmedCode.length >= 4) onJoin(trimmedCode);
  }

  return (
    <div style={{
      height: "100dvh", width: "100dvw",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: BG, color: "#e6edf3", gap: 20,
      fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
      // Prevent iOS from treating this as a scroll container that eats taps
      overflowY: "visible",
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
        <div style={{ marginTop: 4 }}>🎮 Use the D-pad to move on mobile.</div>
        <div>🌀 You can phase through walls — the snake can't.</div>
        <div>💀 Snake touches you = game over.</div>
      </div>

      <button
        onClick={handleHostClick}
        style={btnStyle(connecting ? "#555" : "#7c3aed")}
      >
        {connecting ? "Connecting…" : "Create Room (Host)"}
      </button>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().slice(0, 8))}
          placeholder="Room code"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          style={{
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#e6edf3", fontSize: 16,
            fontFamily: "inherit", width: 140, textAlign: "center",
          }}
        />
        <button
          onClick={handleJoinClick}
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
    letterSpacing: 1, touchAction: "manipulation",
  };
}

// ─── Waiting room ─────────────────────────────────────────────────────────────
function WaitingRoom({
  roomCode,
  players,
  isHost,
  onStart,
  onToggleReady,
  myId,
  myColor,
  readySet,
}: {
  roomCode: string;
  players: { id: PlayerId; color: PlayerColor }[];
  isHost: boolean;
  onStart: () => void;
  onToggleReady: () => void;
  myId: PlayerId;
  myColor: PlayerColor | null;
  readySet: Set<PlayerId>;
}) {
  const allReady = players.filter(p => p.id !== players[0]?.id).every(p => readySet.has(p.id));
  const canStart = isHost && players.length >= 1 && (players.length === 1 || allReady);

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

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
        {players.map((p, i) => {
          const isMe = p.id === myId;
          const isReady = i === 0 || readySet.has(p.id); // host always "ready"
          return (
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
              <span style={{ opacity: 0.85, flex: 1 }}>
                {i === 0 ? "Host" : "Guest"}{isMe ? " (you)" : ""}
              </span>
              <span style={{ fontSize: 12, opacity: isReady ? 1 : 0.35 }}>
                {isReady ? "✅ ready" : "⏳ waiting"}
              </span>
            </div>
          );
        })}
      </div>

      {isHost ? (
        <button
          onClick={() => { if (canStart) onStart(); }}
          style={btnStyle(canStart ? "#22c55e" : "#444")}
        >
          {allReady || players.length === 1 ? `Start Game (${players.length}/3)` : "Waiting for players…"}
        </button>
      ) : (
        <button
          onClick={onToggleReady}
          style={btnStyle(readySet.has(myId) ? "#555" : "#0ea5e9")}
        >
          {readySet.has(myId) ? "✅ Ready! (click to unready)" : "Click when Ready"}
        </button>
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
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown]     = useState<number | null>(null);
  const [readySet, setReadySet]       = useState<Set<PlayerId>>(new Set());

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
        if (msg.type === "PLAYER_READY") {
          setReadySet(prev => {
            const next = new Set(prev);
            if (msg.ready) next.add(msg.playerId); else next.delete(msg.playerId);
            return next;
          });
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
    const trimmed = code.trim().toUpperCase();
    console.log("[GUEST] joining", trimmed);
    setLobbyError('');
    setConnecting(true);
    try {
      const ch = await connectAbly(trimmed);
      console.log("[GUEST] connected");
      setConnecting(false);
      channelRef.current = ch;
      setRoomCode(trimmed);
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
        if (msg.type === "COUNTDOWN") {
          if (msg.count > 0) {
            setCountdown(msg.count);
          } else {
            setCountdown(null);
            setGameStarted(true);
          }
        }
        if (msg.type === "GAME_STATE") {
          if (screen !== "playing") setScreen("playing");
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
    engine.resetGame();
    engine.stopLoop();
    setGameStarted(false);
    setCountdown(null);
    setScreen("playing");
    const state = engine.buildState();
    channelRef.current?.publish({ type: "GAME_STATE", state });
    setRenderedState(state);
  }

  // ── Host: click-to-start → countdown → go ──────────────────────────
  function handleGameScreenClick() {
    rootRef.current?.focus({ preventScroll: true });
    setHasFocus(true);
    if (gameStarted || !isHost) return;
    // broadcast countdown 3-2-1-0 then start loop
    let n = 3;
    setCountdown(n);
    channelRef.current?.publish({ type: "COUNTDOWN", count: n });
    const iv = setInterval(() => {
      n -= 1;
      setCountdown(n);
      channelRef.current?.publish({ type: "COUNTDOWN", count: n });
      if (n <= 0) {
        clearInterval(iv);
        setCountdown(null);
        setGameStarted(true);
        engine.startLoop();
      }
    }, 1000);
  }

  // ── Guest: toggle ready ───────────────────────────────────────────────
  function handleToggleReady() {
    const isReady = readySet.has(myId);
    channelRef.current?.publish({ type: "PLAYER_READY", playerId: myId, ready: !isReady });
    // optimistic local update
    setReadySet(prev => {
      const next = new Set(prev);
      if (isReady) next.delete(myId); else next.add(myId);
      return next;
    });
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
        engine.stopLoop();
        engine.resetGame();
        setGameStarted(false);
        setCountdown(null);
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

  // ── Touch / swipe controls ───────────────────────────────────────────
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // tap, not swipe
    let d: Dir;
    if (Math.abs(dx) > Math.abs(dy)) {
      d = dx > 0 ? "right" : "left";
    } else {
      d = dy > 0 ? "down" : "up";
    }
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
        onToggleReady={handleToggleReady}
        myId={myId}
        myColor={myColor}
        readySet={readySet}
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
    <>
      <style>{`@keyframes pop { from { transform: scale(1.6); opacity: 0.4; } to { transform: scale(1); opacity: 1; } }`}</style>
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setHasFocus(true)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
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
          {/* Countdown overlay */}
          {countdown !== null && countdown > 0 && (
            <div style={{
              position: "absolute", inset: 0,
              display: "grid", placeItems: "center",
              background: "rgba(0,0,0,0.6)", borderRadius: 14,
              backdropFilter: "blur(4px)",
              zIndex: 8, userSelect: "none",
            }}>
              <div style={{
                fontSize: 96, fontWeight: 800, lineHeight: 1,
                color: countdown === 1 ? "#ef4444" : countdown === 2 ? "#facc15" : "#22c55e",
                textShadow: "0 0 40px currentColor",
                animation: "pop 0.4s ease-out",
              }}>
                {countdown}
              </div>
            </div>
          )}

          {/* Click-to-start overlay (host only, before countdown) */}
          {!gameStarted && countdown === null && isHost && (
            <div
              onPointerDown={handleGameScreenClick}
              style={{
                position: "absolute", inset: 0,
                display: "grid", placeItems: "center",
                background: "rgba(0,0,0,0.65)", borderRadius: 14,
                backdropFilter: "blur(3px)",
                cursor: "pointer", zIndex: 5, userSelect: "none",
              }}
            >
              <div style={{
                padding: "20px 36px", borderRadius: 12,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
                textAlign: "center", lineHeight: 1.8,
              }}>
                <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Ready!</div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>Click to start countdown</div>
              </div>
            </div>
          )}
          {/* Waiting overlay (guests before game starts) */}
          {!gameStarted && countdown === null && !isHost && (
            <div style={{
              position: "absolute", inset: 0,
              display: "grid", placeItems: "center",
              background: "rgba(0,0,0,0.55)", borderRadius: 14,
              backdropFilter: "blur(3px)",
              zIndex: 5, userSelect: "none",
            }}>
              <div style={{
                padding: "16px 28px", borderRadius: 12,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
                textAlign: "center", opacity: 0.85, fontSize: 14,
              }}>
                ⏳ Waiting for host to start…
              </div>
            </div>
          )}
          {/* Refocus overlay (lost focus mid-game) */}
          {gameStarted && !hasFocus && countdown === null && (
            <div
              onPointerDown={() => { rootRef.current?.focus({ preventScroll: true }); setHasFocus(true); }}
              style={{
                position: "absolute", inset: 0,
                display: "grid", placeItems: "center",
                background: "rgba(0,0,0,0.45)", borderRadius: 14,
                backdropFilter: "blur(2px)",
                cursor: "pointer", zIndex: 5, userSelect: "none",
              }}
            >
              <div style={{
                padding: "12px 20px", borderRadius: 10,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                fontSize: 14, opacity: 0.85,
              }}>
                Click to focus · WASD to move
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
              {/* Per-player survival times */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                {[...players].sort((a, b) => b.survivedMs - a.survivedMs).map(p => (
                  <div key={p.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 12px", borderRadius: 8,
                    background: "rgba(255,255,255,0.06)",
                    border: `1px solid ${PLAYER_COLOR_HEX[p.color]}44`,
                    fontSize: 13,
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: PLAYER_COLOR_HEX[p.color] }} />
                    <span style={{ flex: 1, opacity: 0.85 }}>
                      {p.id === myId ? "You" : p.color}
                    </span>
                    <span style={{ opacity: 0.7 }}>
                      {p.survivedMs > 0 ? `${(p.survivedMs / 1000).toFixed(1)}s` : "—"}
                    </span>
                    {!p.alive && <span style={{ fontSize: 11 }}>☠</span>}
                  </div>
                ))}
              </div>
              {isHost && (
                <button
                  onClick={() => {
                    engine.stopLoop();
                    engine.resetGame();
                    setGameStarted(false);
                    setCountdown(null);
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

      {/* ── Mobile D-pad ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 56px)",
        gridTemplateRows: "repeat(2, 56px)",
        gap: 6,
        justifyContent: "center",
        padding: "10px 0 14px",
      }}>
        {([
          [null, "up",    null   ],
          ["left","down","right"],
        ] as (Dir | null)[][]).flat().map((dir, i) => dir ? (
          <button
            key={dir}
            onPointerDown={e => { e.preventDefault(); tryMovePlayer(dir); }}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10, color: "#e6edf3",
              fontSize: 20, cursor: "pointer",
              display: "grid", placeItems: "center",
              WebkitTapHighlightColor: "transparent",
              userSelect: "none",
              touchAction: "manipulation",
            }}
          >
            {dir === "up" ? "▲" : dir === "down" ? "▼" : dir === "left" ? "◀" : "▶"}
          </button>
        ) : (
          <div key={i} />
        ))}
      </div>
    </div>
  </>
  );
}