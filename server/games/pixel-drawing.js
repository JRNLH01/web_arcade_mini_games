const GRID_OPTIONS = new Set([6, 7, 8, 9, 10]);
const FLASH_OPTIONS = new Set([3, 5, 7, 10]);
const DRAW_OPTIONS = new Set([15, 20, 30, 45, 60, 90]);
const ROUND_OPTIONS = new Set([1, 3, 5]);
const RESULT_DELAY_MS = 6500;

const PALETTE = {
  white: "#ffffff",
  blue: "#246bfd",
  green: "#36b85c",
  red: "#ef3f45",
  black: "#17191f",
  yellow: "#f5df3f",
  purple: "#8c52d9",
  orange: "#f28b32",
  brown: "#8a5735"
};
const COLOUR_KEYS = Object.keys(PALETTE);
const DRAW_COLOURS = COLOUR_KEYS.filter((colour) => colour !== "white");

module.exports = function registerPixelDrawing(namespace) {
  const rooms = new Map();

  function makeRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let index = 0; index < 5; index += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return rooms.has(code) ? makeRoomCode() : code;
  }

  function cleanName(name, number) {
    return String(name || "").trim().slice(0, 18) || `Player ${number}`;
  }

  function chooseOption(value, allowed, fallback) {
    const parsed = Number(value);
    return allowed.has(parsed) ? parsed : fallback;
  }

  function randomItem(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function shuffled(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function makeBlankGrid(size) {
    return Array(size * size).fill("white");
  }

  function setCell(grid, size, row, column, colour) {
    if (row < 0 || column < 0 || row >= size || column >= size) return;
    grid[row * size + column] = colour;
  }

  function getCell(grid, size, row, column) {
    if (row < 0 || column < 0 || row >= size || column >= size) return "white";
    return grid[row * size + column];
  }

  function mirrorColumns(size, distance) {
    if (size % 2 === 0) {
      return [size / 2 - 1 - distance, size / 2 + distance];
    }
    if (distance === 0) return [Math.floor(size / 2)];
    return [Math.floor(size / 2) - distance, Math.floor(size / 2) + distance];
  }

  function drawSymmetricCell(grid, size, row, distance, colour) {
    for (const column of mirrorColumns(size, distance)) {
      setCell(grid, size, row, column, colour);
    }
  }

  function fillRect(grid, size, top, left, bottom, right, colour) {
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        setCell(grid, size, row, column, colour);
      }
    }
  }

  function fillEllipse(grid, size, centreRow, centreColumn, radiusRow, radiusColumn, colour) {
    const safeRowRadius = Math.max(0.7, radiusRow);
    const safeColumnRadius = Math.max(0.7, radiusColumn);
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const vertical = (row - centreRow) / safeRowRadius;
        const horizontal = (column - centreColumn) / safeColumnRadius;
        if (vertical * vertical + horizontal * horizontal <= 1) {
          setCell(grid, size, row, column, colour);
        }
      }
    }
  }

  function centreBounds(size, width) {
    const clampedWidth = Math.max(1, Math.min(size, width));
    const left = Math.floor((size - clampedWidth) / 2);
    return [left, left + clampedWidth - 1];
  }

  function addTree(grid, size) {
    const canopy = randomItem(["green", "green", "yellow"]);
    const trunk = "brown";
    const decoration = canopy === "yellow" ? "red" : randomItem(["yellow", "red"]);
    const canopyBottom = Math.max(3, Math.floor(size * 0.62));
    const centre = (size - 1) / 2;

    for (let row = 0; row <= canopyBottom; row += 1) {
      const progress = row / Math.max(1, canopyBottom);
      const halfWidth = Math.max(0, Math.round(progress * (size * 0.43)));
      for (let column = Math.ceil(centre - halfWidth); column <= Math.floor(centre + halfWidth); column += 1) {
        setCell(grid, size, row, column, canopy);
      }
    }

    const trunkWidth = size >= 9 ? 2 : 1;
    const [trunkLeft, trunkRight] = centreBounds(size, trunkWidth);
    fillRect(grid, size, canopyBottom, trunkLeft, size - 1, trunkRight, trunk);

    if (size >= 7) {
      setCell(grid, size, Math.max(2, Math.floor(canopyBottom * 0.55)), Math.max(0, Math.floor(size * 0.3)), decoration);
      setCell(grid, size, Math.max(2, Math.floor(canopyBottom * 0.72)), Math.min(size - 1, Math.ceil(size * 0.67)), decoration);
    }
    return { kind: "tree", label: "Tree" };
  }

  function addSnowman(grid, size) {
    const body = "blue";
    const detail = "black";
    const nose = "orange";
    const centre = (size - 1) / 2;
    fillEllipse(grid, size, size * 0.69, centre, size * 0.29, size * 0.28, body);
    fillEllipse(grid, size, size * 0.25, centre, size * 0.20, size * 0.20, body);

    const eyeRow = Math.max(1, Math.round(size * 0.2));
    const eyeOffset = Math.max(1, Math.round(size * 0.1));
    setCell(grid, size, eyeRow, Math.floor(centre - eyeOffset), detail);
    setCell(grid, size, eyeRow, Math.ceil(centre + eyeOffset), detail);
    setCell(grid, size, Math.round(size * 0.3), Math.ceil(centre), nose);
    setCell(grid, size, Math.round(size * 0.58), Math.round(centre), detail);
    if (size >= 8) setCell(grid, size, Math.round(size * 0.76), Math.round(centre), detail);
    return { kind: "snowman", label: "Snowman" };
  }

  function addHouse(grid, size) {
    const roof = randomItem(["red", "purple", "orange"]);
    const wall = randomItem(["yellow", "orange"]);
    const door = "brown";
    const windowColour = "blue";
    const roofBottom = Math.max(2, Math.floor(size * 0.38));
    const centre = (size - 1) / 2;

    for (let row = 0; row <= roofBottom; row += 1) {
      const halfWidth = Math.max(0, Math.round((row / Math.max(1, roofBottom)) * (size * 0.47)));
      for (let column = Math.ceil(centre - halfWidth); column <= Math.floor(centre + halfWidth); column += 1) {
        setCell(grid, size, row, column, roof);
      }
    }

    fillRect(grid, size, roofBottom, 1, size - 1, size - 2, wall);
    const doorWidth = size >= 9 ? 2 : 1;
    const [doorLeft, doorRight] = centreBounds(size, doorWidth);
    fillRect(grid, size, Math.max(roofBottom + 2, size - 3), doorLeft, size - 1, doorRight, door);
    const windowRow = Math.min(size - 3, roofBottom + 2);
    setCell(grid, size, windowRow, Math.max(1, Math.floor(size * 0.25)), windowColour);
    setCell(grid, size, windowRow, Math.min(size - 2, Math.ceil(size * 0.72)), windowColour);
    return { kind: "house", label: "House" };
  }

  function addFlower(grid, size) {
    const petals = randomItem(["red", "purple", "orange"]);
    const centreColour = "yellow";
    const stem = "green";
    const centreColumn = Math.floor(size / 2);
    const headRow = Math.max(1, Math.floor(size * 0.27));
    const offset = size >= 9 ? 2 : 1;

    setCell(grid, size, headRow, centreColumn, centreColour);
    setCell(grid, size, headRow - offset, centreColumn, petals);
    setCell(grid, size, headRow + offset, centreColumn, petals);
    setCell(grid, size, headRow, centreColumn - offset, petals);
    setCell(grid, size, headRow, centreColumn + offset, petals);
    if (size >= 8) {
      setCell(grid, size, headRow - 1, centreColumn - 1, petals);
      setCell(grid, size, headRow - 1, centreColumn + 1, petals);
    }

    for (let row = headRow + offset; row < size; row += 1) setCell(grid, size, row, centreColumn, stem);
    setCell(grid, size, Math.min(size - 2, headRow + 3), Math.max(0, centreColumn - 1), stem);
    setCell(grid, size, Math.min(size - 2, headRow + 4), Math.min(size - 1, centreColumn + 1), stem);
    return { kind: "flower", label: "Flower" };
  }

  function addMushroom(grid, size) {
    const cap = randomItem(["red", "purple", "orange"]);
    const stem = "brown";
    const spots = "white";
    const capBottom = Math.max(2, Math.floor(size * 0.43));
    const centre = (size - 1) / 2;

    for (let row = 0; row <= capBottom; row += 1) {
      const normalized = row / Math.max(1, capBottom);
      const halfWidth = Math.max(1, Math.round(Math.sin(normalized * Math.PI * 0.65) * size * 0.46));
      for (let column = Math.ceil(centre - halfWidth); column <= Math.floor(centre + halfWidth); column += 1) {
        setCell(grid, size, row + 1, column, cap);
      }
    }
    const stemWidth = size >= 8 ? 3 : 2;
    const [left, right] = centreBounds(size, stemWidth);
    fillRect(grid, size, capBottom + 1, left, size - 1, right, stem);
    if (size >= 7) {
      setCell(grid, size, Math.max(1, Math.floor(capBottom * 0.6)), Math.max(1, Math.floor(size * 0.3)), spots);
      setCell(grid, size, Math.max(1, Math.floor(capBottom * 0.5)), Math.min(size - 2, Math.ceil(size * 0.67)), spots);
    }
    return { kind: "mushroom", label: "Mushroom" };
  }

  function addRocket(grid, size) {
    const body = randomItem(["blue", "purple"]);
    const nose = "red";
    const windowColour = "yellow";
    const flame = "orange";
    const centre = (size - 1) / 2;
    const bodyWidth = size >= 9 ? 4 : 3;
    const [left, right] = centreBounds(size, bodyWidth);
    const noseBottom = Math.max(1, Math.floor(size * 0.22));

    for (let row = 0; row <= noseBottom; row += 1) {
      const width = Math.max(1, Math.round(((row + 1) / (noseBottom + 1)) * bodyWidth));
      const [rowLeft, rowRight] = centreBounds(size, width);
      fillRect(grid, size, row, rowLeft, row, rowRight, nose);
    }
    fillRect(grid, size, noseBottom + 1, left, size - 3, right, body);
    setCell(grid, size, Math.min(size - 4, noseBottom + 2), Math.round(centre), windowColour);
    setCell(grid, size, size - 3, Math.max(0, left - 1), nose);
    setCell(grid, size, size - 3, Math.min(size - 1, right + 1), nose);
    setCell(grid, size, size - 2, Math.floor(centre), flame);
    setCell(grid, size, size - 1, Math.ceil(centre), flame);
    return { kind: "rocket", label: "Rocket" };
  }

  function addFish(grid, size) {
    const body = randomItem(["blue", "green", "purple"]);
    const tail = randomItem(["yellow", "orange", "red"]);
    const eye = "black";
    const facingRight = Math.random() < 0.5;
    const centreRow = (size - 1) / 2;
    const centreColumn = facingRight ? size * 0.43 : size * 0.57;
    fillEllipse(grid, size, centreRow, centreColumn, size * 0.28, size * 0.34, body);

    const tailColumn = facingRight ? 0 : size - 1;
    const tailInner = facingRight ? 1 : size - 2;
    setCell(grid, size, Math.floor(centreRow), tailColumn, tail);
    setCell(grid, size, Math.floor(centreRow - 1), tailInner, tail);
    setCell(grid, size, Math.ceil(centreRow + 1), tailInner, tail);
    const eyeColumn = facingRight ? Math.min(size - 2, Math.ceil(size * 0.68)) : Math.max(1, Math.floor(size * 0.31));
    setCell(grid, size, Math.max(1, Math.floor(centreRow - 1)), eyeColumn, eye);
    return { kind: "fish", label: "Fish" };
  }

  function addBoat(grid, size) {
    const hull = "brown";
    const sail = randomItem(["red", "blue", "purple"]);
    const mast = "black";
    const water = "blue";
    const mastColumn = Math.floor(size / 2);
    const deckRow = Math.max(3, Math.floor(size * 0.62));

    for (let row = 1; row < deckRow; row += 1) setCell(grid, size, row, mastColumn, mast);
    for (let row = 1; row < deckRow - 1; row += 1) {
      const width = Math.max(1, Math.round((row / Math.max(1, deckRow - 2)) * (size * 0.35)));
      for (let column = mastColumn + 1; column <= Math.min(size - 1, mastColumn + width); column += 1) {
        setCell(grid, size, row, column, sail);
      }
    }
    fillRect(grid, size, deckRow, 1, deckRow, size - 2, hull);
    fillRect(grid, size, deckRow + 1, 2, Math.min(size - 2, deckRow + 2), size - 3, hull);
    for (let column = 0; column < size; column += 2) setCell(grid, size, size - 1, column, water);
    return { kind: "boat", label: "Sailboat" };
  }

  function addGift(grid, size) {
    const box = randomItem(["red", "purple", "green", "blue"]);
    const ribbon = randomItem(["yellow", "orange"]);
    const top = Math.max(2, Math.floor(size * 0.3));
    fillRect(grid, size, top, 1, size - 1, size - 2, box);
    const centreColumns = centreBounds(size, size >= 9 ? 2 : 1);
    fillRect(grid, size, top, centreColumns[0], size - 1, centreColumns[1], ribbon);
    fillRect(grid, size, Math.min(size - 1, top + 1), 1, Math.min(size - 1, top + 1), size - 2, ribbon);
    setCell(grid, size, top - 1, Math.max(0, centreColumns[0] - 1), ribbon);
    setCell(grid, size, top - 1, Math.min(size - 1, centreColumns[1] + 1), ribbon);
    setCell(grid, size, Math.max(0, top - 2), centreColumns[0], ribbon);
    setCell(grid, size, Math.max(0, top - 2), centreColumns[1], ribbon);
    return { kind: "gift", label: "Gift" };
  }

  function addHeart(grid, size) {
    const colour = randomItem(["red", "purple"]);
    const centre = (size - 1) / 2;
    for (let row = 0; row < size - 1; row += 1) {
      for (let column = 0; column < size; column += 1) {
        const x = (column - centre) / Math.max(1, size * 0.48);
        const y = (row - size * 0.38) / Math.max(1, size * 0.42);
        const equation = Math.pow(x * x + y * y - 0.32, 3) - x * x * Math.pow(y, 3);
        if (equation <= 0) setCell(grid, size, row, column, colour);
      }
    }
    return { kind: "heart", label: "Heart" };
  }

  function addCat(grid, size) {
    const fur = randomItem(["orange", "brown", "purple"]);
    const detail = "black";
    const nose = "red";
    fillEllipse(grid, size, size * 0.52, (size - 1) / 2, size * 0.38, size * 0.42, fur);
    setCell(grid, size, 0, Math.max(0, Math.floor(size * 0.22)), fur);
    setCell(grid, size, 1, Math.max(0, Math.floor(size * 0.13)), fur);
    setCell(grid, size, 0, Math.min(size - 1, Math.ceil(size * 0.77)), fur);
    setCell(grid, size, 1, Math.min(size - 1, Math.ceil(size * 0.86)), fur);
    const eyeRow = Math.max(2, Math.floor(size * 0.38));
    setCell(grid, size, eyeRow, Math.max(1, Math.floor(size * 0.3)), detail);
    setCell(grid, size, eyeRow, Math.min(size - 2, Math.ceil(size * 0.69)), detail);
    setCell(grid, size, Math.min(size - 2, eyeRow + 2), Math.floor(size / 2), nose);
    return { kind: "cat", label: "Cat face" };
  }

  function addSun(grid, size) {
    const centre = (size - 1) / 2;
    fillEllipse(grid, size, centre, centre, size * 0.27, size * 0.27, "yellow");
    const rays = [
      [0, Math.round(centre)], [size - 1, Math.round(centre)],
      [Math.round(centre), 0], [Math.round(centre), size - 1],
      [1, 1], [1, size - 2], [size - 2, 1], [size - 2, size - 2]
    ];
    rays.forEach(([row, column]) => setCell(grid, size, row, column, "orange"));
    return { kind: "sun", label: "Sun" };
  }

  function addUmbrella(grid, size) {
    const canopy = randomItem(["purple", "red", "blue"]);
    const handle = "brown";
    const centre = Math.floor(size / 2);
    const canopyBottom = Math.max(2, Math.floor(size * 0.38));
    for (let row = 0; row <= canopyBottom; row += 1) {
      const width = Math.max(1, Math.round(Math.sin(((row + 1) / (canopyBottom + 1)) * Math.PI / 2) * size * 0.48));
      for (let column = Math.max(0, centre - width); column <= Math.min(size - 1, centre + width); column += 1) {
        setCell(grid, size, row + 1, column, canopy);
      }
    }
    for (let row = canopyBottom + 1; row < size - 1; row += 1) setCell(grid, size, row, centre, handle);
    setCell(grid, size, size - 1, Math.min(size - 1, centre + 1), handle);
    return { kind: "umbrella", label: "Umbrella" };
  }

  function addRobot(grid, size) {
    const body = randomItem(["blue", "green", "purple"]);
    const detail = "black";
    const button = "red";
    fillRect(grid, size, 1, 1, Math.max(3, Math.floor(size * 0.48)), size - 2, body);
    fillRect(grid, size, Math.max(4, Math.floor(size * 0.55)), 1, size - 2, size - 2, body);
    const eyeRow = Math.max(2, Math.floor(size * 0.27));
    setCell(grid, size, eyeRow, Math.max(1, Math.floor(size * 0.3)), detail);
    setCell(grid, size, eyeRow, Math.min(size - 2, Math.ceil(size * 0.69)), detail);
    setCell(grid, size, 0, Math.floor(size / 2), button);
    setCell(grid, size, Math.max(4, Math.floor(size * 0.67)), Math.floor(size / 2), button);
    setCell(grid, size, size - 1, 1, detail);
    setCell(grid, size, size - 1, size - 2, detail);
    return { kind: "robot", label: "Robot" };
  }

  function addApple(grid, size) {
    const fruit = randomItem(["red", "green", "yellow"]);
    fillEllipse(grid, size, size * 0.56, (size - 1) / 2, size * 0.36, size * 0.38, fruit);
    const centre = Math.floor(size / 2);
    setCell(grid, size, 0, centre, "brown");
    setCell(grid, size, 1, Math.min(size - 1, centre + 1), "green");
    return { kind: "apple", label: "Apple" };
  }

  const SPRITE_BUILDERS = [
    addTree,
    addSnowman,
    addHouse,
    addFlower,
    addMushroom,
    addRocket,
    addFish,
    addBoat,
    addGift,
    addHeart,
    addCat,
    addSun,
    addUmbrella,
    addRobot,
    addApple
  ];

  function generateSprite(size, previousKind = "") {
    const eligible = SPRITE_BUILDERS.filter((builder) => builder.name !== `add${titleCaseKind(previousKind)}`);
    const builder = randomItem(eligible.length ? eligible : SPRITE_BUILDERS);
    const grid = makeBlankGrid(size);
    const metadata = builder(grid, size);
    const coloursUsed = COLOUR_KEYS.filter((colour) => colour !== "white" && grid.includes(colour));

    return {
      cells: grid,
      coloursUsed,
      kind: metadata.kind,
      label: metadata.label,
      symmetry: "recognisable object"
    };
  }

  function titleCaseKind(value) {
    return String(value || "")
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  function normalizeGrid(value, size) {
    const total = size * size;
    if (!Array.isArray(value) || value.length !== total) return makeBlankGrid(size);
    return value.map((colour) => COLOUR_KEYS.includes(colour) ? colour : "white");
  }

  function scoreGrid(target, guess) {
    const total = target.length;
    let exactCells = 0;
    let targetFilled = 0;
    let guessFilled = 0;
    let filledOverlap = 0;
    let exactColoured = 0;

    for (let index = 0; index < total; index += 1) {
      const targetColour = target[index];
      const guessColour = guess[index];
      const targetHasColour = targetColour !== "white";
      const guessHasColour = guessColour !== "white";

      if (targetColour === guessColour) exactCells += 1;
      if (targetHasColour) targetFilled += 1;
      if (guessHasColour) guessFilled += 1;
      if (targetHasColour && guessHasColour) {
        filledOverlap += 1;
        if (targetColour === guessColour) exactColoured += 1;
      }
    }

    const squareAccuracy = total ? exactCells / total : 0;
    const shapeAccuracy = targetFilled + guessFilled
      ? (2 * filledOverlap) / (targetFilled + guessFilled)
      : 1;
    const colourAccuracy = filledOverlap ? exactColoured / filledOverlap : 0;
    const accuracy = squareAccuracy * 0.45 + shapeAccuracy * 0.35 + colourAccuracy * 0.2;

    const percent = (value) => Math.round(value * 10000) / 100;
    return {
      accuracy: percent(accuracy),
      squares: percent(squareAccuracy),
      shape: percent(shapeAccuracy),
      colour: percent(colourAccuracy),
      correctSquares: exactCells,
      totalSquares: total
    };
  }

  function makePlayer(socket, name, number, gridSize) {
    return {
      id: socket.id,
      name: cleanName(name, number),
      number,
      draft: makeBlankGrid(gridSize),
      guess: null,
      submitted: false,
      score: null,
      totalScore: 0,
      roundScores: [],
      roundWins: 0
    };
  }

  function getRoomOf(socketId) {
    for (const room of rooms.values()) {
      if (room.players.some((player) => player.id === socketId)) return room;
    }
    return null;
  }

  function clearTimers(room) {
    for (const timer of room.timers) clearTimeout(timer);
    room.timers.clear();
  }

  function schedule(room, callback, delay) {
    const timer = setTimeout(() => {
      room.timers.delete(timer);
      callback();
    }, delay);
    room.timers.add(timer);
  }

  function resetCompetition(room) {
    room.round = 0;
    room.target = null;
    room.phaseEndsAt = null;
    room.lastRound = null;
    for (const player of room.players) {
      player.draft = makeBlankGrid(room.options.gridSize);
      player.guess = null;
      player.submitted = false;
      player.score = null;
      player.totalScore = 0;
      player.roundScores = [];
      player.roundWins = 0;
    }
  }

  function rankings(room) {
    return [...room.players]
      .map((player) => ({
        id: player.id,
        name: player.name,
        average: player.roundScores.length
          ? Math.round((player.totalScore / player.roundScores.length) * 100) / 100
          : 0,
        total: Math.round(player.totalScore * 100) / 100,
        roundWins: player.roundWins,
        scores: player.roundScores
      }))
      .sort((a, b) => b.average - a.average || b.roundWins - a.roundWins);
  }

  function payload(room, player) {
    const host = room.players.find((candidate) => candidate.id === room.hostId);
    const revealTarget = ["flash", "result", "final"].includes(room.phase);
    return {
      roomCode: room.code,
      phase: room.phase,
      options: room.options,
      palette: PALETTE,
      round: room.round,
      totalRounds: room.options.rounds,
      phaseEndsAt: room.phaseEndsAt,
      serverNow: Date.now(),
      target: revealTarget ? room.target : null,
      isHost: room.hostId === player.id,
      hostName: host?.name || "",
      message: room.message,
      me: {
        id: player.id,
        name: player.name,
        submitted: player.submitted,
        score: player.score,
        totalScore: player.totalScore,
        roundScores: player.roundScores,
        roundWins: player.roundWins
      },
      players: room.players.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        submitted: candidate.submitted,
        score: ["result", "final"].includes(room.phase) ? candidate.score : null,
        guess: ["result", "final"].includes(room.phase) ? candidate.guess : null,
        average: candidate.roundScores.length
          ? Math.round((candidate.totalScore / candidate.roundScores.length) * 100) / 100
          : 0,
        roundWins: candidate.roundWins
      })),
      lastRound: room.lastRound,
      rankings: room.phase === "final" ? rankings(room) : []
    };
  }

  function emitRoom(room) {
    for (const player of room.players) {
      namespace.to(player.id).emit("pixelState", payload(room, player));
    }
  }

  function setLobby(room, message) {
    clearTimers(room);
    resetCompetition(room);
    room.phase = room.players.length === 2 ? "settings" : "waiting";
    room.message = message || (room.players.length === 2
      ? `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can set the options and start.`
      : "Waiting for another player...");
    emitRoom(room);
  }

  function startRound(room) {
    if (room.players.length !== 2) return setLobby(room, "Waiting for another player...");
    clearTimers(room);
    room.round += 1;
    room.target = generateSprite(room.options.gridSize, room.lastSpriteKind);
    room.lastSpriteKind = room.target.kind;
    room.phase = "flash";
    room.phaseEndsAt = Date.now() + room.options.flashSeconds * 1000;
    room.message = `Round ${room.round}: memorise the pixel image.`;
    room.lastRound = null;
    for (const player of room.players) {
      player.draft = makeBlankGrid(room.options.gridSize);
      player.guess = null;
      player.submitted = false;
      player.score = null;
    }
    emitRoom(room);
    schedule(room, () => beginDrawing(room), room.options.flashSeconds * 1000);
  }

  function beginDrawing(room) {
    if (room.phase !== "flash") return;
    room.phase = "draw";
    room.phaseEndsAt = Date.now() + room.options.drawSeconds * 1000;
    room.message = "Recreate the image before time runs out.";
    emitRoom(room);
    schedule(room, () => finishRound(room), room.options.drawSeconds * 1000);
  }

  function finishRound(room) {
    if (room.phase !== "draw") return;
    clearTimers(room);
    for (const player of room.players) {
      if (!player.guess) player.guess = normalizeGrid(player.draft, room.options.gridSize);
      player.score = scoreGrid(room.target.cells, player.guess);
      player.totalScore += player.score.accuracy;
      player.roundScores.push(player.score.accuracy);
    }

    const bestAccuracy = Math.max(...room.players.map((player) => player.score.accuracy));
    const winners = room.players.filter((player) => Math.abs(player.score.accuracy - bestAccuracy) < 0.005);
    for (const winner of winners) winner.roundWins += 1;

    room.lastRound = {
      round: room.round,
      winnerNames: winners.map((winner) => winner.name),
      winnerIds: winners.map((winner) => winner.id),
      target: room.target,
      players: room.players.map((player) => ({
        id: player.id,
        name: player.name,
        guess: player.guess,
        score: player.score
      }))
    };
    room.phase = "result";
    room.phaseEndsAt = Date.now() + RESULT_DELAY_MS;
    room.message = winners.length === 1
      ? `${winners[0].name} recreated it most accurately!`
      : `Round tie between ${winners.map((winner) => winner.name).join(" and ")}!`;
    emitRoom(room);

    schedule(room, () => {
      if (room.round >= room.options.rounds) finishGame(room);
      else startRound(room);
    }, RESULT_DELAY_MS);
  }

  function finishGame(room) {
    clearTimers(room);
    room.phase = "final";
    room.phaseEndsAt = null;
    const ordered = rankings(room);
    const top = ordered[0];
    const tied = ordered.filter((entry) => Math.abs(entry.average - top.average) < 0.005);
    room.message = tied.length > 1
      ? `Final tie at ${top.average.toFixed(2)}% average accuracy!`
      : `${top.name} wins with ${top.average.toFixed(2)}% average accuracy!`;
    emitRoom(room);
  }

  namespace.on("connection", (socket) => {
    socket.on("createPixelRoom", ({ name } = {}) => {
      const code = makeRoomCode();
      const options = { gridSize: 8, flashSeconds: 5, drawSeconds: 45, rounds: 3 };
      const room = {
        code,
        players: [],
        hostId: socket.id,
        options,
        phase: "waiting",
        phaseEndsAt: null,
        round: 0,
        target: null,
        lastSpriteKind: null,
        lastRound: null,
        message: "Waiting for another player...",
        timers: new Set()
      };
      room.players.push(makePlayer(socket, name, 1, options.gridSize));
      rooms.set(code, room);
      socket.join(code);
      emitRoom(room);
    });

    socket.on("joinPixelRoom", ({ code, name } = {}) => {
      const cleanedCode = String(code || "").trim().toUpperCase();
      const room = rooms.get(cleanedCode);
      if (!room) return socket.emit("pixelError", "Room not found.");
      if (room.players.length >= 2) return socket.emit("pixelError", "Room is full.");
      if (room.phase !== "waiting") return socket.emit("pixelError", "This game has already started.");
      room.players.push(makePlayer(socket, name, 2, room.options.gridSize));
      socket.join(room.code);
      setLobby(room, `${room.players[0].name} is host. Choose options, then start.`);
    });

    socket.on("updatePixelOptions", ({ gridSize, flashSeconds, drawSeconds, rounds } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || !["waiting", "settings"].includes(room.phase)) return;
      room.options.gridSize = chooseOption(gridSize, GRID_OPTIONS, room.options.gridSize);
      room.options.flashSeconds = chooseOption(flashSeconds, FLASH_OPTIONS, room.options.flashSeconds);
      room.options.drawSeconds = chooseOption(drawSeconds, DRAW_OPTIONS, room.options.drawSeconds);
      room.options.rounds = chooseOption(rounds, ROUND_OPTIONS, room.options.rounds);
      for (const player of room.players) player.draft = makeBlankGrid(room.options.gridSize);
      room.message = `Options: ${room.options.gridSize}×${room.options.gridSize}, ${room.options.flashSeconds}s memory, ${room.options.drawSeconds}s drawing, ${room.options.rounds} round${room.options.rounds === 1 ? "" : "s"}.`;
      emitRoom(room);
    });

    socket.on("startPixelGame", () => {
      const room = getRoomOf(socket.id);
      if (!room || room.hostId !== socket.id || room.phase !== "settings") return;
      if (room.players.length !== 2) return socket.emit("pixelError", "Need 2 players before starting.");
      resetCompetition(room);
      startRound(room);
    });

    socket.on("updatePixelDraft", ({ cells } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "draw") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.submitted) return;
      player.draft = normalizeGrid(cells, room.options.gridSize);
    });

    socket.on("submitPixelGuess", ({ cells } = {}) => {
      const room = getRoomOf(socket.id);
      if (!room || room.phase !== "draw") return;
      const player = room.players.find((candidate) => candidate.id === socket.id);
      if (!player || player.submitted) return;
      if (Date.now() > room.phaseEndsAt + 150) return;
      player.guess = normalizeGrid(cells, room.options.gridSize);
      player.draft = player.guess;
      player.submitted = true;
      room.message = room.players.every((candidate) => candidate.submitted)
        ? "Both drawings are in. Revealing results..."
        : `${player.name} submitted. Waiting for the other player.`;
      emitRoom(room);
      if (room.players.every((candidate) => candidate.submitted)) finishRound(room);
    });

    socket.on("restartPixelLobby", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      setLobby(room, `${room.players.find((player) => player.id === room.hostId)?.name || "Host"} can change options and start again.`);
    });

    socket.on("disconnect", () => {
      const room = getRoomOf(socket.id);
      if (!room) return;
      clearTimers(room);
      const wasHost = room.hostId === socket.id;
      room.players = room.players.filter((player) => player.id !== socket.id);
      if (room.players.length === 0) return rooms.delete(room.code);
      if (wasHost) room.hostId = room.players[0].id;
      setLobby(room, wasHost
        ? `${room.players[0].name} is now host. Waiting for another player...`
        : "Opponent disconnected. Waiting for another player...");
    });
  });
};
