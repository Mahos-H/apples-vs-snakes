/**
 * engine.ts — host-only authoritative game engine
 *
 * The host runs this. Guests only send Dir inputs and render GameState.
 * Snake never wraps (walls are hard limits; hitting wall = game over).
 * Players always wrap.
 * Speed: 600ms start, -10ms per food eaten, floor 300ms.
 */

import { useRef, useState } from "react";
import {
  Vec, Dir, PlayerState, PlayerId, GameState,
  PLAYER_COLORS, PlayerColor,
} from "./types";
import {
  eq, keyOf, inBounds, randInt, movePlayer, snakeNeighbors,
  computeGridSize, computeTickMs, aStarPath, reachableFreeCells,
  manhattan,
} from "./utils";

export type { Vec, Dir, GameState, PlayerState };

const INITIAL_SIZE   = 10;
const INITIAL_SNAKE: Vec[] = [
  { x: 3, y: 3 },
  { x: 2, y: 3 },
  { x: 1, y: 3 },
];

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}

export function useGameEngine(hostId: PlayerId) {
  const [, bumpRender] = useState(0);
  const rerender = () => bumpRender((n) => n + 1);

  // ── authoritative refs ──────────────────────────────────────────────
  const sizeRef    = useRef(INITIAL_SIZE);
  const snakeRef   = useRef<Vec[]>(INITIAL_SNAKE.map(v => ({ ...v })));
  const npcFoodsRef     = useRef<Vec[]>([]);           // blue NPC apples
  const playerFoodsRef  = useRef<Map<PlayerId, Vec>>(new Map()); // per-player colored apples
  const scoreRef   = useRef(0);
  const tickMsRef  = useRef(600);
  const isOverRef  = useRef(false);
  const overReasonRef = useRef("");

  // players: keyed by playerId
  const playersRef = useRef<Map<PlayerId, PlayerState>>(new Map());

  // pending inputs from guests (processed on next snake tick)
  const pendingInputsRef = useRef<Map<PlayerId, Dir>>(new Map());

  // ── loop refs ───────────────────────────────────────────────────────
  const lastTRef   = useRef<number | null>(null);
  const accRef     = useRef(0);
  const rafRef     = useRef<number | null>(null);
  const pausedRef  = useRef(false);
  const [paused, setPausedState] = useState(false);

  // ── callback ref: called every tick so Game.tsx can publish state ───
  const onTickRef  = useRef<((state: GameState) => void) | null>(null);

  // ────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────

  function allOccupied(): Set<string> {
    const s = new Set<string>(snakeRef.current.map(keyOf));
    for (const p of playersRef.current.values()) {
      if (p.alive) s.add(keyOf(p.pos));
    }
    for (const f of npcFoodsRef.current) s.add(keyOf(f));
    for (const f of playerFoodsRef.current.values()) s.add(keyOf(f));
    return s;
  }

  function randomFreeCell(): Vec | null {
    const size    = sizeRef.current;
    const head    = snakeRef.current[0];
    const blocked = allOccupied();
    const free    = reachableFreeCells(head, size, blocked);
    if (free.length === 0) return null;
    return free[randInt(free.length)];
  }

  // NPC apple count = number of alive players (minimum 1)
  function targetNpcCount(): number {
    return Math.max(1, playersRef.current.size);
  }

  function addNpcFood() {
    const cell = randomFreeCell();
    if (!cell) return;
    npcFoodsRef.current = [...npcFoodsRef.current, cell];
  }

  function fillNpcFoods() {
    const target = targetNpcCount();
    npcFoodsRef.current = npcFoodsRef.current.filter((_, i) => i < target);
    while (npcFoodsRef.current.length < target) addNpcFood();
  }

  function placePlayerFood(id: PlayerId) {
    const cell = randomFreeCell();
    if (!cell) return;
    playerFoodsRef.current.set(id, cell);
  }

  function initAllFoods() {
    npcFoodsRef.current    = [];
    playerFoodsRef.current = new Map();
    for (const p of playersRef.current.values()) {
      if (p.alive) placePlayerFood(p.id);
    }
    fillNpcFoods();
  }

  function spawnPlayer(id: PlayerId, color: PlayerColor): Vec {
    const size    = sizeRef.current;
    const blocked = allOccupied();
    const free: Vec[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const v = { x, y };
        if (!blocked.has(keyOf(v))) free.push(v);
      }
    if (free.length === 0) return { x: randInt(size), y: randInt(size) };
    return free[randInt(free.length)];
  }

  function endGame(reason: string) {
    isOverRef.current   = true;
    overReasonRef.current = reason;
    rerender();
  }

  function buildState(): GameState {
    return {
      players:    Array.from(playersRef.current.values()),
      snake:      snakeRef.current,
      npcFoods:    npcFoodsRef.current,
      playerFoods: Object.fromEntries(playerFoodsRef.current),
      size:       sizeRef.current,
      tickMs:     tickMsRef.current,
      isOver:     isOverRef.current,
      overReason: overReasonRef.current,
      score:      scoreRef.current,
      hostId,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Public API: player management (called by host when guests join/leave)
  // ────────────────────────────────────────────────────────────────────

  function addPlayer(id: PlayerId): { color: PlayerColor; accepted: boolean; reason?: string } {
    const existing = playersRef.current;
    if (existing.has(id)) {
      const p = existing.get(id)!;
      return { color: p.color, accepted: true };
    }
    if (existing.size >= 3) {
      return { color: "red", accepted: false, reason: "Room is full (max 3 players)." };
    }
    const usedColors = new Set(Array.from(existing.values()).map(p => p.color));
    const color = PLAYER_COLORS.find(c => !usedColors.has(c)) ?? "red";
    const pos   = spawnPlayer(id, color);
    existing.set(id, { id, color, pos, alive: true });
    placePlayerFood(id);
    fillNpcFoods();
    rerender();
    return { color, accepted: true };
  }

  function removePlayer(id: PlayerId) {
    playersRef.current.delete(id);
    rerender();
  }

  // ────────────────────────────────────────────────────────────────────
  // Input: host receives guest dir, queues it
  // ────────────────────────────────────────────────────────────────────

  function receiveInput(id: PlayerId, dir: Dir) {
    pendingInputsRef.current.set(id, dir);
  }

  // ────────────────────────────────────────────────────────────────────
  // Player movement (processed each tick from pending queue)
  // ────────────────────────────────────────────────────────────────────

  function processPlayerMoves() {
    const size    = sizeRef.current;
    const inputs  = pendingInputsRef.current;
    const players = playersRef.current;
    const snakeKeys = new Set(snakeRef.current.map(keyOf));

    for (const [id, dir] of inputs) {
      const p = players.get(id);
      if (!p || !p.alive) continue;
      const next = movePlayer(p.pos, dir, size); // wraps
      if (snakeKeys.has(keyOf(next))) continue;  // blocked by snake body
      p.pos = next;
    }
    // check if any player ate their personal apple
    for (const p of players.values()) {
      if (!p.alive) continue;
      const pf = playerFoodsRef.current.get(p.id);
      if (pf && eq(p.pos, pf)) {
        scoreRef.current += 1;
        placePlayerFood(p.id);
      }
    }
    pendingInputsRef.current.clear();
  }

  // ────────────────────────────────────────────────────────────────────
  // Snake AI: target nearest apple (player or food), A* no-wrap
  // ────────────────────────────────────────────────────────────────────

  function chooseSnakeStep(): Vec | null {
    const size   = sizeRef.current;
    const snake  = snakeRef.current;
    const head   = snake[0];
    const players = playersRef.current;

    // snake targets: all NPC apples + alive players (NOT personal player apples)
    const targets: Vec[] = [...npcFoodsRef.current];
    for (const p of players.values()) {
      if (p.alive) targets.push(p.pos);
    }

    // pick nearest by manhattan
    let bestTarget = targets[0];
    let bestDist   = Infinity;
    for (const t of targets) {
      const d = manhattan(head, t);
      if (d < bestDist) { bestDist = d; bestTarget = t; }
    }

    // blocked = snake body minus tail (tail will move away)
    const blocked = new Set<string>();
    for (let i = 0; i < snake.length - 1; i++) blocked.add(keyOf(snake[i]));

    const path = aStarPath(head, bestTarget, size, blocked);
    if (path.length >= 2) return path[1];

    // fallback: pick any safe in-bounds neighbor not in body
    const bodySet = new Set<string>(snake.map(keyOf));
    const tailKey = keyOf(snake[snake.length - 1]);
    const cands   = snakeNeighbors(head, size).sort((a, b) =>
      manhattan(a, bestTarget) - manhattan(b, bestTarget)
    );
    for (const c of cands) {
      const ck = keyOf(c);
      if (bodySet.has(ck) && !(ck === tailKey)) continue;
      return c;
    }
    return null;
  }

  // ────────────────────────────────────────────────────────────────────
  // Snake step
  // ────────────────────────────────────────────────────────────────────

  function stepSnake() {
    if (pausedRef.current || isOverRef.current) return;

    // 1. move all players from pending inputs
    processPlayerMoves();

    // 2. choose snake next head
    const nextHead = chooseSnakeStep();
    if (!nextHead) {
      endGame("Snake is trapped — you survived!");
      return;
    }

    // 3. wall check (snake never wraps)
    if (!inBounds(nextHead, sizeRef.current)) {
      endGame("Snake hit a wall — you survived!");
      return;
    }

    const players = playersRef.current;

    // 4. does snake eat a player apple?
    let atePlayer: PlayerId | null = null;
    for (const p of players.values()) {
      if (p.alive && eq(nextHead, p.pos)) {
        atePlayer = p.id;
        break;
      }
    }

    // 5. does snake eat an NPC apple?
    const ateNpcIdx = npcFoodsRef.current.findIndex(f => eq(nextHead, f));
    const ateFood   = ateNpcIdx !== -1;

    const willGrow = atePlayer !== null || ateFood;

    // 6. advance snake body
    const next = [nextHead, ...snakeRef.current];
    if (!willGrow) next.pop();

    // 7. self-collision check
    const seen = new Set<string>();
    for (const s of next) {
      const k = keyOf(s);
      if (seen.has(k)) {
        snakeRef.current = next;
        endGame("Snake hit itself — you survived!");
        return;
      }
      seen.add(k);
    }

    snakeRef.current = next;

    // 8. resolve eaten apple
    if (atePlayer) {
      const p = players.get(atePlayer)!;
      p.alive = false;   // permanently gone
      scoreRef.current += 1;
    }

    if (ateFood) {
      scoreRef.current += 1;
      npcFoodsRef.current = npcFoodsRef.current.filter((_, i) => i !== ateNpcIdx);
      addNpcFood(); // replace eaten NPC apple
    }

    if (willGrow) {
      sizeRef.current  = computeGridSize(snakeRef.current.length);
      tickMsRef.current = computeTickMs(scoreRef.current);
    }

    // 9. check if all players eliminated
    const alivePlayers = Array.from(players.values()).filter(p => p.alive);
    if (players.size > 0 && alivePlayers.length === 0) {
      endGame("All players eliminated! Snake wins.");
      return;
    }

    rerender();
    onTickRef.current?.(buildState());
  }

  // ────────────────────────────────────────────────────────────────────
  // RAF game loop (host only)
  // ────────────────────────────────────────────────────────────────────

  function startLoop() {
    function loop(t: number) {
      if (lastTRef.current == null) lastTRef.current = t;
      const dt = t - lastTRef.current;
      lastTRef.current = t;

      if (!pausedRef.current && !isOverRef.current) {
        accRef.current += dt;
        const stepMs = Math.max(20, tickMsRef.current);
        if (accRef.current >= stepMs) {
          accRef.current = 0;
          stepSnake();
        }
      } else {
        lastTRef.current  = null;
        accRef.current    = 0;
      }

      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function stopLoop() {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }

  // ────────────────────────────────────────────────────────────────────
  // Reset
  // ────────────────────────────────────────────────────────────────────

  function resetGame() {
    isOverRef.current   = false;
    overReasonRef.current = "";
    scoreRef.current    = 0;
    tickMsRef.current   = 600;
    sizeRef.current     = INITIAL_SIZE;
    snakeRef.current    = INITIAL_SNAKE.map(v => ({ ...v }));

    // re-spawn all current players at random positions
    const players = playersRef.current;
    for (const p of players.values()) {
      p.alive = true;
      p.pos   = spawnPlayer(p.id, p.color);
    }

    initAllFoods();
    lastTRef.current = null;
    accRef.current   = 0;
    rerender();
    onTickRef.current?.(buildState());
  }

  function setPaused(next: boolean) {
    pausedRef.current = next;
    setPausedState(next);
    lastTRef.current = null;
    accRef.current   = 0;
  }

  return {
    // state
    paused, setPaused,
    sizeRef, snakeRef, npcFoodsRef, playerFoodsRef, scoreRef, tickMsRef,
    isOverRef, overReasonRef, playersRef,
    // loop
    startLoop, stopLoop, rafRef,
    // player management
    addPlayer, removePlayer, receiveInput,
    // game control
    resetGame,
    buildState,
    // tick callback
    onTickRef,
  };
}