 Apples vs Snakes README

\# Apples vs Snakes

A real-time multiplayer browser game made with Next.js and Ably. Up to three players join the same room and try to stay alive while an AI snake chases them around. The snake gets longer and faster as points stack up, and the grid grows with it.

## How it works

One player creates a room and gets an 8-character code. Everyone else joins with that code. Once all guests are ready, the host starts the game.

The host browser runs the actual game engine and sends state to everyone else through Ably on every tick. Guests only send movement input. Collision checks and game rules stay on the host side.

## Gameplay

- The snake is AI-driven with A\* pathfinding. It goes after the nearest player or a blue apple.
- Players move on a wrapping grid, so walking off one edge brings them back on the other. The snake does not wrap; hitting a wall ends the game.
- The snake grows when it eats a player or a blue apple. Each point makes it faster and can expand the grid.
- Grid size starts at 10x10 and grows up to 22x22.
- Tick rate starts at 600ms and drops by 10ms per point, with a floor of 300ms.
- A round ends when every player is gone, the snake traps itself, or the snake hits a wall.

## Stack

- Next.js 14 with the App Router
- Ably Realtime for a pub/sub room channel, with one message type per game event
- React with the host keeping game state in refs and a requestAnimationFrame loop; guests just render what comes in over the channel
- No database, no backend game logic, and no extra dependencies beyond ably

## Architecture

Host browser                        Guest browsers
-----------                         --------------
useGameEngine (RAF loop)
  |-- stepSnake()
  |-- processPlayerMoves()
  |-- buildState()
       |
       v
Ably channel  <----  PLAYER\_INPUT  <----  Guest input
       |
       +---->  GAME\_STATE  ---->  setRenderedState()

Message types: GAME\_STATE, PLAYER\_INPUT, JOIN\_REQUEST, JOIN\_ACK, PLAYER\_READY, COUNTDOWN.

## Setup

1. Clone and install

git clone <repo>
cd apples-vs-snakes
npm install

2. Create an Ably account

Go to https://ably.com, create an app, and copy the API key from the dashboard.

3. Set environment variables

Create .env.local:

ABLY\_API\_KEY=your\_key\_here

The key never reaches the client. The browser gets short-lived tokens from /api/ably-token.

4. Run locally

npm run dev

Open http://localhost:3000 in two browser windows to test host and guest flows.

## Deployment

Deploy to Vercel. Add ABLY\_API\_KEY in the project settings. Do not prefix it with NEXT\_PUBLIC\_ — it needs to stay server-side only.

## Known limitations

- Room state lives entirely in the host’s browser. If the host closes the tab, the room is gone.
- Ably may detach idle channels with no traffic. There is no keepalive yet.
- Player identity is not verified beyond the session, so this assumes trusted players.
- Mobile browsers are supported with an on-screen D-pad. Swipe controls work too, but the D-pad is the better option.

## File structure

app/
  page.tsx                  Entry point
  game/
    Game.tsx                UI and client logic
    engine.ts               Authoritative game engine (host only)
    ably.ts                 Ably client wrapper
    types.ts                Shared types and message definitions
    utils.ts                Grid math, A\*, BFS, helpers
  api/
    ably-token/
      route.ts              Server-side token endpoint

## License

MIT
