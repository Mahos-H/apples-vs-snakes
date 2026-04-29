
# Apples vs Snakes

A real-time multiplayer browser game built with Next.js and Ably. Up to three players share a room and try to stay alive while an AI snake chases them. As points go up, the snake speeds up, gets longer, and the grid expands.

## How it works

One player creates a room and gets an 8-character code. Others join with it. Once everyone’s ready, the host starts the game.

The host runs the game engine locally and pushes state to everyone else through Ably every tick. Guests only send movement input. All game logic and collisions stay on the host.

## Gameplay

- The snake uses A* pathfinding and goes after the nearest player or a blue apple.
- Players move on a wrapping grid, so edges loop. The snake doesn’t — hitting a wall ends the game.
- The snake grows when it eats a player or a blue apple. Each point makes it faster and can expand the grid.
- Grid size starts at 10x10 and scales up to 22x22.
- Tick rate starts at 600ms and drops by 10ms per point, down to 300ms.
- A round ends when all players are gone, the snake traps itself, or it hits a wall.

## Stack

- Next.js 14 (App Router)
- Ably Realtime for pub/sub (one channel per room)
- React — host keeps game state in refs with a requestAnimationFrame loop, guests just render incoming state
- No database, no backend game logic, no extra deps beyond ably

## Architecture

Host browser                        Guest browsers
-----------                         --------------
useGameEngine (RAF loop)
  |-- stepSnake()
  |-- processPlayerMoves()
  |-- buildState()
       |
       v
Ably channel  <----  PLAYER_INPUT  <----  Guest input
       |
       +---->  GAME_STATE  ---->  setRenderedState()

Message types: GAME_STATE, PLAYER_INPUT, JOIN_REQUEST, JOIN_ACK, PLAYER_READY, COUNTDOWN.

## Setup

1. Clone and install

git clone <repo>
cd apples-vs-snakes
npm install

2. Create an Ably account

Go to https://ably.com, create an app, and copy the API key.

3. Set environment variables

Create .env.local:

ABLY_API_KEY=your_key_here

The key stays server-side. The browser gets short-lived tokens from /api/ably-token.

4. Run locally

npm run dev

Open http://localhost:3000 in two browser windows to test host + guest.

## Deployment

Deploy to Vercel. Add ABLY_API_KEY in project settings. Do not use NEXT_PUBLIC_ — keep it server-side.

## Known limitations

- Room state lives in the host’s browser. If the host closes the tab, the room is gone.
- Ably may detach idle channels with no traffic (no keepalive yet).
- No real player identity/verification — assumes trusted users.
- Mobile works with an on-screen D-pad. Swipe exists, but D-pad is better.

## File structure

app/
  page.tsx                  Entry point
  game/
    Game.tsx                UI + client logic
    engine.ts               Game engine (host only)
    ably.ts                 Ably wrapper
    types.ts                Shared types / messages
    utils.ts                Grid math, A*, BFS, helpers
  api/
    ably-token/
      route.ts              Token endpoint

## License

MIT

