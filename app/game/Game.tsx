"use client";

import React, { useEffect, useRef, useState } from "react";

type Vec = { x: number; y: number };
type Dir = "up" | "down" | "left" | "right";

const INITIAL_SIZE = 7;
const INITIAL_PLAYER: Vec = { x: 5, y: 5 };
const INITIAL_SNAKE: Vec[] = [
  { x: 3, y: 3 },
  { x: 2, y: 3 },
  { x: 1, y: 3 },
];

function eq(a: Vec, b: Vec) {
  return a.x === b.x && a.y === b.y;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function keyOf(v: Vec) {
  return `${v.x},${v.y}`;
}

function addDir(p: Vec, d: Dir): Vec {
  switch (d) {
    case "up":
      return { x: p.x, y: p.y - 1 };
    case "down":
      return { x: p.x, y: p.y + 1 };
    case "left":
      return { x: p.x - 1, y: p.y };
    case "right":
      return { x: p.x + 1, y: p.y };
  }
}

function manhattan(a: Vec, b: Vec) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function torusManhattan(a: Vec, b: Vec, size: number) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.min(dx, size - dx) + Math.min(dy, size - dy);
}

function inBounds(p: Vec, size: number) {
  return p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
}

function neighbors(p: Vec): Vec[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
  ];
}

function wrapPos(p: Vec, size: number): Vec {
  return {
    x: ((p.x % size) + size) % size,
    y: ((p.y % size) + size) % size,
  };
}

function neighborsWrap(p: Vec, size: number): Vec[] {
  return [
    wrapPos({ x: p.x, y: p.y - 1 }, size),
    wrapPos({ x: p.x, y: p.y + 1 }, size),
    wrapPos({ x: p.x - 1, y: p.y }, size),
    wrapPos({ x: p.x + 1, y: p.y }, size),
  ];
}

function getNeighborsForMode(p: Vec, size: number, wrap: boolean): Vec[] {
  return wrap ? neighborsWrap(p, size) : neighbors(p).filter((n) => inBounds(n, size));
}

function randInt(n: number) {
  return Math.floor(Math.random() * n);
}

function computeGridSize(snakeLen: number) {
  return clamp(7 + Math.floor((snakeLen - 3) / 2), 7, 20);
}

function aStarPath(
  start: Vec,
  goal: Vec,
  size: number,
  blocked: Set<string>,
  wrap: boolean
): Vec[] {
  const startKey = keyOf(start);
  const goalKey = keyOf(goal);

  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([
    [startKey, wrap ? torusManhattan(start, goal, size) : manhattan(start, goal)],
  ]);

  const parse = (k: string): Vec => {
    const [xs, ys] = k.split(",");
    return { x: Number(xs), y: Number(ys) };
  };

  const lowestF = (): string | null => {
    let best: string | null = null;
    let bestVal = Infinity;
    for (const k of open) {
      const v = fScore.get(k) ?? Infinity;
      if (v < bestVal) {
        bestVal = v;
        best = k;
      }
    }
    return best;
  };

  const closed = new Set<string>();

  while (open.size > 0) {
    const currentKey = lowestF();
    if (!currentKey) break;

    open.delete(currentKey);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (currentKey === goalKey) {
      const pathKeys: string[] = [currentKey];
      let ck = currentKey;
      while (cameFrom.has(ck)) {
        ck = cameFrom.get(ck)!;
        pathKeys.push(ck);
      }
      pathKeys.reverse();
      return pathKeys.map(parse);
    }

    const current = parse(currentKey);

    for (const nb of getNeighborsForMode(current, size, wrap)) {
      const nk = keyOf(nb);
      if (blocked.has(nk) && nk !== goalKey) continue;

      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentative);
        fScore.set(
          nk,
          tentative + (wrap ? torusManhattan(nb, goal, size) : manhattan(nb, goal))
        );
        open.add(nk);
      }
    }
  }

  return [];
}

function reachableFreeCells(
  start: Vec,
  size: number,
  blocked: Set<string>,
  wrap: boolean
): Vec[] {
  const q: Vec[] = [start];
  const seen = new Set<string>([keyOf(start)]);
  const out: Vec[] = [];

  while (q.length > 0) {
    const cur = q.shift()!;
    for (const nb of getNeighborsForMode(cur, size, wrap)) {
      const nk = keyOf(nb);
      if (seen.has(nk)) continue;
      if (blocked.has(nk)) continue;
      seen.add(nk);
      out.push(nb);
      q.push(nb);
    }
  }

  return out;
}

export default function Game() {
  const [paused, setPaused] = useState(false);
  const [snakePhasesWalls, setSnakePhasesWalls] = useState(true);
  const [snakeTickMs, setSnakeTickMs] = useState(220);
  const [hasFocus, setHasFocus] = useState(false);

  // Force rerenders only when game state actually changes.
  const [, bumpRender] = useState(0);

  // authoritative refs
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef(INITIAL_SIZE);
  const playerRef = useRef<Vec>(INITIAL_PLAYER);
  const foodRef = useRef<Vec>({ x: 1, y: 1 });
  const snakeRef = useRef<Vec[]>(INITIAL_SNAKE);

  const scoreRef = useRef(0);
  const statusRef = useRef("");
  const isOverRef = useRef(false);

  const lastTRef = useRef<number | null>(null);
  const accSnakeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const pausedRef = useRef(paused);
  const snakePhasesWallsRef = useRef(snakePhasesWalls);
  const snakeTickMsRef = useRef(snakeTickMs);

  // keep refs in sync immediately
  pausedRef.current = paused;
  snakePhasesWallsRef.current = snakePhasesWalls;
  snakeTickMsRef.current = snakeTickMs;

  function endGame(msg: string) {
    isOverRef.current = true;
    statusRef.current = msg;
    bumpRender((n) => n + 1);
  }

  function placeFood(): boolean {
    const size = sizeRef.current;
    const wrap = snakePhasesWallsRef.current;
    const blocked = new Set<string>([
      keyOf(playerRef.current),
      ...snakeRef.current.map(keyOf),
    ]);

    const head = snakeRef.current[0];
    const reachable = reachableFreeCells(head, size, blocked, wrap);

    if (reachable.length === 0) {
      endGame("No reachable food cells. Press R to restart.");
      return false;
    }

    foodRef.current = reachable[randInt(reachable.length)];
    return true;
  }

  function resetGame() {
    lastTRef.current = null;
    accSnakeRef.current = 0;

    isOverRef.current = false;
    statusRef.current = "";
    scoreRef.current = 0;

    sizeRef.current = INITIAL_SIZE;
    playerRef.current = { ...INITIAL_PLAYER };
    snakeRef.current = INITIAL_SNAKE.map((v) => ({ ...v }));
    foodRef.current = { x: 1, y: 1 };

    pausedRef.current = false;
    setPaused(false);

    if (!placeFood()) return;

    bumpRender((n) => n + 1);
  }

  useEffect(() => {
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryMovePlayer(dir: Dir) {
    if (pausedRef.current || isOverRef.current) return;

    const size = sizeRef.current;
    const attempted = wrapPos(addDir(playerRef.current, dir), size);

    // Player can phase through walls, but not through the snake.
    const snakeKeys = new Set(snakeRef.current.map(keyOf));
    if (snakeKeys.has(keyOf(attempted))) return;

    playerRef.current = attempted;
    bumpRender((n) => n + 1);
  }

  function chooseSnakeStep(): Vec | null {
    const size = sizeRef.current;
    const wrap = snakePhasesWallsRef.current;
    const snake = snakeRef.current;
    const head = snake[0];
    const player = playerRef.current;
    const food = foodRef.current;

    const dp = wrap ? torusManhattan(head, player, size) : manhattan(head, player);
    const df = wrap ? torusManhattan(head, food, size) : manhattan(head, food);
    const target = dp <= df ? player : food;

    // Do not path through the player unless the player is the target.
    const blockedForPath = new Set<string>();
    for (let i = 0; i < snake.length - 1; i++) blockedForPath.add(keyOf(snake[i]));
    if (!eq(target, player)) blockedForPath.add(keyOf(player));

    const path = aStarPath(head, target, size, blockedForPath, wrap);
    const preferred = path.length >= 2 ? path[1] : null;

    const candidates: Vec[] = [];
    if (preferred) candidates.push(preferred);

    const fallbacks = getNeighborsForMode(head, size, wrap).sort((a, b) => {
      const da = wrap ? torusManhattan(a, target, size) : manhattan(a, target);
      const db = wrap ? torusManhattan(b, target, size) : manhattan(b, target);
      return da - db;
    });

    for (const p of fallbacks) {
      if (!candidates.some((c) => eq(c, p))) candidates.push(p);
    }

    const bodySet = new Set<string>(snake.map(keyOf));
    const tailKey = keyOf(snake[snake.length - 1]);

    for (const raw of candidates) {
      const c = wrap ? wrapPos(raw, size) : raw;
      if (!wrap && !inBounds(c, size)) continue;

      const ck = keyOf(c);
      const eatsPlayer = eq(c, player);
      const eatsFood = eq(c, food);
      const willGrow = eatsPlayer || eatsFood;

      if (bodySet.has(ck)) {
        // Moving into the tail is okay only if the tail is going to move away.
        if (!(ck === tailKey && !willGrow)) continue;
      }

      return c;
    }

    return null;
  }

  function stepSnake() {
    if (pausedRef.current || isOverRef.current) return;

    const size = sizeRef.current;
    const snake = snakeRef.current;
    const nextHead = chooseSnakeStep();

    if (!nextHead) {
      endGame("Snake stuck. Press R to restart.");
      return;
    }

    const headApplied = snakePhasesWallsRef.current ? wrapPos(nextHead, size) : nextHead;

    const eatsPlayer = eq(headApplied, playerRef.current);
    const eatsFood = eq(headApplied, foodRef.current);
    const willGrow = eatsPlayer || eatsFood;

    const next = [headApplied, ...snake];
    if (!willGrow) next.pop();

    const seen = new Set<string>();
    for (const s of next) {
      const k = keyOf(s);
      if (seen.has(k)) {
        snakeRef.current = next;
        endGame("Snake hit itself. Press R to restart.");
        return;
      }
      seen.add(k);
    }

    snakeRef.current = next;

    if (eatsPlayer) {
      endGame("You got caught. Press R to restart.");
      return;
    }

    if (eatsFood) {
      scoreRef.current += 1;
      const newSize = computeGridSize(snakeRef.current.length);
      sizeRef.current = newSize;

      if (!placeFood()) return;
    }

    bumpRender((n) => n + 1);
  }

  useEffect(() => {
    function loop(t: number) {
      if (lastTRef.current == null) lastTRef.current = t;
      const dt = t - lastTRef.current;
      lastTRef.current = t;

      if (!pausedRef.current && !isOverRef.current) {
        accSnakeRef.current += dt;
        const stepMs = Math.max(20, snakeTickMsRef.current);

        // one snake step max per frame avoids burst/teleport behavior
        if (accSnakeRef.current >= stepMs) {
          accSnakeRef.current = 0;
          stepSnake();
        }
      } else {
        lastTRef.current = null;
        accSnakeRef.current = 0;
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isInteractiveTarget(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return (
      el.isContentEditable ||
      el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.tagName === "BUTTON"
    );
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isInteractiveTarget(e.target)) return;
    if (e.repeat) return;

    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      const next = !pausedRef.current;
      pausedRef.current = next;
      setPaused(next);
      lastTRef.current = null;
      accSnakeRef.current = 0;
      return;
    }

    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      resetGame();
      return;
    }

    let d: Dir | null = null;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") d = "up";
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") d = "down";
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") d = "left";
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") d = "right";
    if (!d) return;

    e.preventDefault();
    tryMovePlayer(d);
  }

  const size = sizeRef.current;
  const player = playerRef.current;
  const food = foodRef.current;
  const snake = snakeRef.current;

  const snakeKeyToIndex = new Map<string, number>();
  snake.forEach((v, i) => snakeKeyToIndex.set(keyOf(v), i));

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocus={() => setHasFocus(true)}
      style={{
        height: "100dvh",
        width: "100dvw",
        display: "flex",
        flexDirection: "column",
        outline: "none",
      }}
    >
      <header
        style={{
          padding: "10px 12px",
          display: "flex",
          gap: 14,
          alignItems: "center",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>Apple vs A* Snake</div>
        <div style={{ opacity: 0.85 }}>
          Grid: {size}×{size}
        </div>
        <div style={{ opacity: 0.85 }}>Snake: {snake.length}</div>
        <div style={{ opacity: 0.85 }}>Score: {scoreRef.current}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ opacity: 0.85 }}>Snake speed</div>
          <input
            type="range"
            min={80}
            max={600}
            step={10}
            value={snakeTickMs}
            onChange={(e) => {
              const next = Number(e.target.value);
              snakeTickMsRef.current = next;
              setSnakeTickMs(next);
              lastTRef.current = null;
              accSnakeRef.current = 0;
            }}
          />
          <div style={{ width: 56, textAlign: "right", opacity: 0.85 }}>
            {snakeTickMs}ms
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={snakePhasesWalls}
            onChange={(e) => {
              const next = e.target.checked;
              snakePhasesWallsRef.current = next;
              setSnakePhasesWalls(next);
              resetGame();
            }}
          />
          <span style={{ opacity: 0.85 }}>Snake phases through walls</span>
        </label>

        <div style={{ marginLeft: "auto", opacity: 0.85 }}>
          Controls: WASD/Arrows • Space pause • R restart
        </div>
      </header>

      <main style={{ flex: 1, display: "grid", placeItems: "center" }}>
        <div
          onPointerDown={() => {
            rootRef.current?.focus({ preventScroll: true });
            setHasFocus(true);
          }}
          style={{
            width: "min(96vmin, 900px)",
            aspectRatio: "1 / 1",
            display: "grid",
            gridTemplateColumns: `repeat(${size}, 1fr)`,
            gridTemplateRows: `repeat(${size}, 1fr)`,
            gap: "0.6vmin",
            padding: "1vmin",
            borderRadius: 14,
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          {!hasFocus && (
            <div
              onPointerDown={() => {
                rootRef.current?.focus({ preventScroll: true });
                setHasFocus(true);
              }}
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                background: "rgba(0, 0, 0, 0.55)",
                borderRadius: 14,
                cursor: "pointer",
                zIndex: 5,
                userSelect: "none",
              }}
            >
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  fontFamily:
                    'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
                }}
              >
                Click to focus, then use WASD/Arrow keys
              </div>
            </div>
          )}

          {Array.from({ length: size * size }).map((_, idx) => {
            const x = idx % size;
            const y = Math.floor(idx / size);
            const k = `${x},${y}`;

            const isPlayer = eq(player, { x, y });
            const isFood = eq(food, { x, y });

            const si = snakeKeyToIndex.get(k);
            const isSnake = si !== undefined;
            const isHead = si === 0;
            const isTail = si === snake.length - 1;

            let bg = "rgba(230, 237, 243, 0.06)";
            let border = "1px solid rgba(255, 255, 255, 0.06)";

            if (isSnake) {
              bg = isHead ? "#7c3aed" : isTail ? "#5b21b6" : "#6d28d9";
              border = "1px solid rgba(0, 0, 0, 0.20)";
            }
            if (isFood) {
              bg = "#22c55e";
              border = "1px solid rgba(0, 0, 0, 0.20)";
            }
            if (isPlayer) {
              bg = "#f59e0b";
              border = "1px solid rgba(0, 0, 0, 0.20)";
            }

            return (
              <div
                key={k}
                style={{
                  borderRadius: 10,
                  background: bg,
                  border,
                  boxSizing: "border-box",
                }}
              />
            );
          })}
        </div>

        <div
          style={{
            position: "fixed",
            bottom: 14,
            left: 14,
            right: 14,
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial',
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 12,
              backdropFilter: "blur(6px)",
              maxWidth: 700,
              opacity: 0.95,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {isOverRef.current ? "Game Over" : paused ? "Paused" : "Playing"}
            </div>
            <div style={{ opacity: 0.9, lineHeight: 1.35 }}>
              {statusRef.current
                ? statusRef.current
                : "Orange = you. Green = food. Purple = A* snake. You always wrap. The snake follows the checkbox mode and restarts when toggled."}
            </div>
          </div>

          <div
            style={{
              padding: "10px 12px",
              background: "rgba(0, 0, 0, 0.35)",
              border: "1px solid rgba(255, 255, 255, 0.10)",
              borderRadius: 12,
              backdropFilter: "blur(6px)",
              opacity: 0.95,
              alignSelf: "flex-end",
            }}
          >
            <div style={{ opacity: 0.9 }}>Snake speed: {snakeTickMs}ms</div>
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              Space = pause • R = restart
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}