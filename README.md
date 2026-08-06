# Mini Game Arcade

A Node.js and Socket.IO browser arcade containing:

- **Number Hunt** — real-time 2-player number finding and X-card race.
- **Colour Memory** — solo or real-time 2-player colour matching.
- **Pixel Drawing** — real-time 2-player pixel-art memory and recreation.
- **Connect Dots** — real-time 2-player non-crossing path puzzle race.
- **Maze Race** — real-time 2-player race through the same generated maze.
- **Connect Four** — real-time 2-player strategy with client-side display colours.
- **Timer** — real-time 2-player hidden-timer accuracy challenge.
- **Memory Match** — real-time 2-player race to match every card pair.
- **Higher or Lower** — turn-based 2-player secret-number guessing with higher/lower clues.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

For 2-player games, both devices must open the same hosted app. One player creates a room and shares the five-character room code with the other player. Every multiplayer game uses the same room-code, player-waiting and game-settings layout.

## Recent additions

### Higher or Lower

1. The host chooses a number range of 1–100, 1–200, 1–500, 1–1,000, 1–1,500, 1–2,000, 1–3,000 or 1–5,000 and the number of rounds.
2. Both players privately choose and lock a secret number; the opponent receives only a locked status.
3. Players take turns guessing the opponent's number and receive a Higher or Lower clue after every incorrect guess.
4. The remaining valid range narrows automatically, and the starting player alternates each round.
5. The first exact guess wins the round. Final ranking uses round wins, with total guesses as a secondary statistic.


### Memory Match

1. The host chooses a 4×4, 6×6, 8×8, 10×10 or 12×12 board and the number of rounds.
2. Both players receive the same shuffled set of card pairs, but play on independent boards.
3. Flip two cards at a time. Matching cards stay visible; an incorrect pair flips back after a short delay.
4. Live progress shows how many pairs each player has found.
5. The first player to match every pair wins the round; final ranking uses round points and winning time.

### Timer

1. The host chooses a target-time range and number of rounds.
2. Both players receive the same random target, shown in seconds and hundredths, such as `5:00s` or `7:77s`.
3. Each player presses Start, estimates the time without seeing a running clock, then presses Stop.
4. Times remain hidden until both players lock in or the round expires.
5. The smallest absolute difference from the target wins the round; final ranking uses points, completed rounds and total error.


### Maze Race

1. The host chooses one of six difficulty levels from 9×9 to 31×31, a time limit and the number of rounds.
2. Both players receive the same perfect maze after a short countdown.
3. Drag from the green entrance through open passages to the red exit. Tapping neighbouring cells and keyboard arrow keys also work.
4. The server validates that the route stays inside the maze and never crosses a wall.
5. The first valid escape wins the round. On timeout, the generated solution is shown.

### Connect Four

1. The host chooses a standard, wide or large board and the number of rounds.
2. Players alternate dropping discs into non-full columns.
3. The first player to connect four horizontally, vertically or diagonally wins the round.
4. The starting player alternates each round.
5. Each device can independently choose the colours used to display its own and the opponent's discs. These colours are not sent to or imposed on the other player.

### Connect Dots input update

Pointer movement is sampled between browser events and coalesced where supported, making fast slide gestures less likely to skip grid squares.

## Existing game rules

### Connect Dots

- Connect every pair of matching dots using horizontal or vertical moves.
- Different coloured lines cannot overlap, cross or pass through another coloured dot.
- The first player with a valid complete board wins the round.

### Pixel Drawing

- Memorise the same recognisable pixel image and recreate it on an adjustable 6×6 to 10×10 grid.
- Images use a white background and only a few colours from the fixed palette.
- Accuracy combines exact square matches, shape placement and colour correctness.

### Colour Memory

- Memorise a random colour, then recreate its hue, saturation and brightness.
- Accuracy is weighted by hue, saturation and brightness.

## Project structure

```text
server.js
server/
  games/
    number-hunt.js
    colour-memory.js
    pixel-drawing.js
    connect-dots.js
    maze.js
    connect-four.js
    timer.js
    memory-match.js
    higher-lower.js
public/
  index.html
  assets/
    css/
      common.css
      game-entry.css
      landing.css
      multiplayer-lobby.css
  games/
    number-hunt/
    colour-memory/
    pixel-drawing/
    connect-dots/
    maze/
    connect-four/
    timer/
    memory-match/
    higher-lower/
```

## Production deployment

This project uses Socket.IO and stores active rooms in the Node process. Do not deploy the Socket.IO server as ordinary Vercel serverless functions. See [`DEPLOYMENT.md`](DEPLOYMENT.md) for either:

- a complete stateful deployment on Render or Railway; or
- a Vercel static frontend connected to a Render/Railway Socket.IO backend.
