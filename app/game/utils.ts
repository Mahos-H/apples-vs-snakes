import { Vec, Dir } from "./types";

export function eq(a: Vec, b: Vec) {
  return a.x === b.x && a.y === b.y;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function keyOf(v: Vec) {
  return `${v.x},${v.y}`;
}

export function addDir(p: Vec, d: Dir): Vec {
  switch (d) {
    case "up":    return { x: p.x,     y: p.y - 1 };
    case "down":  return { x: p.x,     y: p.y + 1 };
    case "left":  return { x: p.x - 1, y: p.y     };
    case "right": return { x: p.x + 1, y: p.y     };
  }
}

export function manhattan(a: Vec, b: Vec) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function inBounds(p: Vec, size: number) {
  return p.x >= 0 && p.y >= 0 && p.x < size && p.y < size;
}

export function wrapPos(p: Vec, size: number): Vec {
  return {
    x: ((p.x % size) + size) % size,
    y: ((p.y % size) + size) % size,
  };
}

/** Players wrap; this is for player movement only */
export function movePlayer(p: Vec, d: Dir, size: number): Vec {
  return wrapPos(addDir(p, d), size);
}

export function neighbors(p: Vec): Vec[] {
  return [
    { x: p.x,     y: p.y - 1 },
    { x: p.x,     y: p.y + 1 },
    { x: p.x - 1, y: p.y     },
    { x: p.x + 1, y: p.y     },
  ];
}

/** Snake never wraps — only in-bounds neighbors */
export function snakeNeighbors(p: Vec, size: number): Vec[] {
  return neighbors(p).filter((n) => inBounds(n, size));
}

export function randInt(n: number) {
  return Math.floor(Math.random() * n);
}

export function computeGridSize(snakeLen: number) {
  return clamp(10 + Math.floor((snakeLen - 3) / 2), 10, 22);
}

export function computeTickMs(score: number): number {
  return clamp(600 - score * 10, 300, 600);
}

/* ─── A* (snake, no wrap, walls are hard stops) ─── */

export function aStarPath(
  start: Vec,
  goal: Vec,
  size: number,
  blocked: Set<string>,
): Vec[] {
  const startKey = keyOf(start);
  const goalKey  = keyOf(goal);

  const open    = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore   = new Map<string, number>([[startKey, 0]]);
  const fScore   = new Map<string, number>([[startKey, manhattan(start, goal)]]);
  const closed   = new Set<string>();

  const parse = (k: string): Vec => {
    const [xs, ys] = k.split(",");
    return { x: Number(xs), y: Number(ys) };
  };

  const lowestF = (): string | null => {
    let best: string | null = null;
    let bestVal = Infinity;
    for (const k of open) {
      const v = fScore.get(k) ?? Infinity;
      if (v < bestVal) { bestVal = v; best = k; }
    }
    return best;
  };

  while (open.size > 0) {
    const currentKey = lowestF();
    if (!currentKey) break;
    open.delete(currentKey);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (currentKey === goalKey) {
      const path: string[] = [currentKey];
      let ck = currentKey;
      while (cameFrom.has(ck)) { ck = cameFrom.get(ck)!; path.push(ck); }
      path.reverse();
      return path.map(parse);
    }

    const current = parse(currentKey);
    // snake neighbors: in-bounds only (no wrap — wall = pruned branch)
    for (const nb of snakeNeighbors(current, size)) {
      const nk = keyOf(nb);
      if (blocked.has(nk) && nk !== goalKey) continue;
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentative < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentative);
        fScore.set(nk, tentative + manhattan(nb, goal));
        open.add(nk);
      }
    }
  }
  return [];
}

/* ─── BFS for reachable free cells ─── */

export function reachableFreeCells(
  start: Vec,
  size: number,
  blocked: Set<string>,
): Vec[] {
  const q: Vec[]      = [start];
  const seen          = new Set<string>([keyOf(start)]);
  const out: Vec[]    = [];

  while (q.length > 0) {
    const cur = q.shift()!;
    // use in-bounds neighbors (no wrap) for BFS over open board space
    for (const nb of neighbors(cur)) {
      if (!inBounds(nb, size)) continue;
      const nk = keyOf(nb);
      if (seen.has(nk) || blocked.has(nk)) continue;
      seen.add(nk);
      out.push(nb);
      q.push(nb);
    }
  }
  return out;
}