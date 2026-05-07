// Behavioral sliding puzzle prototype
const GRID_SIZE = 3;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const EMPTY_TILE_ID = TOTAL_TILES - 1;
const PIECE_COUNT = TOTAL_TILES - 1;
const DEFAULT_SET_ID = 'blackHairMale';
const PLACEHOLDER_TILE_IMAGE = 'linear-gradient(135deg, rgba(246,239,178,0.28), rgba(18,22,30,0.92))';
const PLACEHOLDER_BACKGROUND_IMAGE = 'linear-gradient(180deg, rgba(12,14,18,1), rgba(2,4,6,1))';

const blackHairMalePieces = Array.from(
  { length: PIECE_COUNT },
  (_, index) => [
    `assets/puzzles/blackHairMale/pieces/${index + 1}/${index + 1}.png`,
    `assets/puzzles/blackHairMale/pieces/${index + 1}.png`,
  ]
);

const PUZZLE_SETS = {
  blackHairMale: {
    label: '남성',
    theme: 'dark',
    background: 'assets/puzzles/blackHairMale/background/background.png',
    pieces: blackHairMalePieces,
  },
  blondeWoman: {
    label: '여성',
    theme: 'light',
    background: 'assets/puzzles/blondeWoman/background/background.png?v=20260507-1400',
    pieces: Array.from(
      { length: PIECE_COUNT },
      (_, index) => [
        `assets/puzzles/blondeWoman/pieces/${index + 1}/${index + 1}.png`,
        `assets/puzzles/blondeWoman/pieces/${index + 1}.png`,
      ]
    ),
  },
};

const puzzleElement = document.getElementById('puzzle');
const overlay = document.getElementById('completionOverlay');
const restartButton = document.getElementById('restartButton');
const pageBackgroundImage = document.getElementById('pageBackgroundImage');
const characterOptionButtons = Array.from(document.querySelectorAll('[data-puzzle-set]'));


let tileOrder = Array.from({ length: TOTAL_TILES }, (_, index) => index);
let tiles = [];
let tileStates = [];
let isSolved = false;
let animationFrameId = null;
let currentSetId = DEFAULT_SET_ID;
let currentSetAssets = {
  background: PUZZLE_SETS[DEFAULT_SET_ID].background,
  pieces: [...PUZZLE_SETS[DEFAULT_SET_ID].pieces],
};
let setLoadToken = 0;

const dragState = {
  activeTileId: null,
  activePointerId: null,
  startX: 0,
  startY: 0,
  moved: false,
  tilePosition: null,
  emptyPosition: null,
  offsetX: 0,
  offsetY: 0,
};

const mouseState = {
  x: 0,
  y: 0,
  previousX: 0,
  previousY: 0,
  previousTime: 0,
  speed: 0,
  totalDistance: 0,
  directionChanges: 0,
  lastDirectionAngle: null,
  hoveredTile: null,
  interactions: 0,
  hasPointerPosition: false,
};

function createTileState() {
  return {
    hoverTime: 0,
    hoverLastTimestamp: null,
    interactionCount: 0,
    darkness: 0,
    noiseLevel: 0,
    distortionLevel: 0,
  };
}

function cssImage(value) {
  if (Array.isArray(value)) {
    return cssImage(value[0]);
  }

  if (!value || value.includes('gradient(')) {
    return value || PLACEHOLDER_TILE_IMAGE;
  }

  return `url("${value}")`;
}

function normalizeImagePaths(path) {
  return (Array.isArray(path) ? path : [path]).filter(Boolean);
}

function setImageWithFallback(image, paths) {
  const candidates = normalizeImagePaths(paths);
  let index = 0;

  function useNextImage() {
    if (index >= candidates.length) {
      image.hidden = true;
      image.removeAttribute('src');
      return;
    }

    image.hidden = false;
    image.src = candidates[index];
    index += 1;
  }

  image.onerror = useNextImage;
  useNextImage();
}

function resolveSetAssets(setId) {
  const set = PUZZLE_SETS[setId] || PUZZLE_SETS[DEFAULT_SET_ID];

  return {
    background: set.background,
    pieces: set.pieces,
  };
}

function applyBackground(background) {
  document.body.style.setProperty(
    '--page-background-image',
    cssImage(background || PLACEHOLDER_BACKGROUND_IMAGE)
  );

  if (!pageBackgroundImage) {
    return;
  }

  if (background) {
    pageBackgroundImage.hidden = false;
    setImageWithFallback(pageBackgroundImage, background);
  } else {
    pageBackgroundImage.hidden = true;
    pageBackgroundImage.removeAttribute('src');
  }
}

function updateCharacterOptions() {
  characterOptionButtons.forEach((button) => {
    const isActive = button.dataset.puzzleSet === currentSetId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', isActive.toString());
  });
}

function applyPuzzleTheme() {
  const set = PUZZLE_SETS[currentSetId] || PUZZLE_SETS[DEFAULT_SET_ID];
  document.body.dataset.puzzleTheme = set.theme || 'dark';
  document.body.dataset.puzzleSet = currentSetId;
}

function createTiles() {
  puzzleElement.innerHTML = '';
  tiles = [];
  tileStates = [];

  for (let index = 0; index < TOTAL_TILES; index++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.dataset.originalIndex = index;
    tile.dataset.tileId = index;

    if (index === EMPTY_TILE_ID) {
      tile.classList.add('empty');
    } else {
      tile.style.setProperty('--tile-image', PLACEHOLDER_TILE_IMAGE);
      const image = document.createElement('img');
      image.className = 'tile-image';
      image.alt = '';
      setImageWithFallback(image, currentSetAssets.pieces[index]);
      tile.appendChild(image);
    }

    tile.addEventListener('pointerenter', handleTileEnter);
    tile.addEventListener('pointerleave', handleTileLeave);
    tile.addEventListener('pointerdown', handleTilePointerDown);
    tiles.push(tile);
    tileStates.push(createTileState());
  }
}

function getTilePosition(index) {
  return {
    row: Math.floor(index / GRID_SIZE),
    col: index % GRID_SIZE,
  };
}

function areAdjacent(posA, posB) {
  const a = getTilePosition(posA);
  const b = getTilePosition(posB);
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function shuffleTiles() {
  // Shuffle by performing solvable adjacent moves.
  for (let i = 0; i < 220; i += 1) {
    const emptyPosition = tileOrder.indexOf(EMPTY_TILE_ID);
    const neighbors = getAdjacentPositions(emptyPosition);
    const swapPosition = neighbors[Math.floor(Math.random() * neighbors.length)];
    [tileOrder[emptyPosition], tileOrder[swapPosition]] = [tileOrder[swapPosition], tileOrder[emptyPosition]];
  }

  if (checkCompletion() === 100) {
    shuffleTiles();
  }
}

function getAdjacentPositions(index) {
  const positions = [];
  const { row, col } = getTilePosition(index);

  if (row > 0) positions.push(index - GRID_SIZE);
  if (row < GRID_SIZE - 1) positions.push(index + GRID_SIZE);
  if (col > 0) positions.push(index - 1);
  if (col < GRID_SIZE - 1) positions.push(index + 1);
  return positions;
}

function renderPuzzle() {
  puzzleElement.innerHTML = '';
  tileOrder.forEach((tileId) => puzzleElement.appendChild(tiles[tileId]));
}

function updateHoverState(tileId, timestamp) {
  const state = tileStates[tileId];
  if (state.hoverLastTimestamp === null) return;
  const delta = timestamp - state.hoverLastTimestamp;
  state.hoverTime += delta;
  state.darkness += delta * 0.0001;
  state.hoverLastTimestamp = timestamp;
}

function handleTileEnter(event) {
  const tileId = Number(event.currentTarget.dataset.originalIndex);
  tileStates[tileId].hoverLastTimestamp = performance.now();
}

function handleTileLeave(event) {
  const tileId = Number(event.currentTarget.dataset.originalIndex);
  updateHoverState(tileId, performance.now());
  tileStates[tileId].hoverLastTimestamp = null;
}

function handleTilePointerDown(event) {
  event.preventDefault();
  const tileId = Number(event.currentTarget.dataset.originalIndex);
  const tilePosition = tileOrder.indexOf(tileId);
  const emptyPosition = tileOrder.indexOf(EMPTY_TILE_ID);

  if (!areAdjacent(tilePosition, emptyPosition)) {
    return;
  }

  dragState.activeTileId = tileId;
  dragState.activePointerId = event.pointerId;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.moved = false;
  dragState.tilePosition = tilePosition;
  dragState.emptyPosition = emptyPosition;
  dragState.offsetX = 0;
  dragState.offsetY = 0;
  event.currentTarget.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (dragState.activeTileId === null || event.pointerId !== dragState.activePointerId) {
    return;
  }

  const dx = event.clientX - dragState.startX;
  const dy = event.clientY - dragState.startY;
  const distance = Math.hypot(dx, dy);

  const tilePos = getTilePosition(dragState.tilePosition);
  const emptyPos = getTilePosition(dragState.emptyPosition);
  const axisX = emptyPos.col - tilePos.col;
  const axisY = emptyPos.row - tilePos.row;

  const rect = puzzleElement.getBoundingClientRect();
  const tileSize = axisX !== 0 ? rect.width / GRID_SIZE : rect.height / GRID_SIZE;
  const projected = dx * axisX + dy * axisY;
  const clamped = Math.max(-tileSize, Math.min(tileSize, projected));

  dragState.offsetX = axisX * clamped;
  dragState.offsetY = axisY * clamped;
  if (Math.abs(clamped) > tileSize * 0.24) {
    dragState.moved = true;
  }
}

function handlePointerUp(event) {
  if (dragState.activeTileId === null || event.pointerId !== dragState.activePointerId) {
    return;
  }

  const tileId = dragState.activeTileId;
  const tilePosition = tileOrder.indexOf(tileId);
  const emptyPosition = tileOrder.indexOf(EMPTY_TILE_ID);

  if (dragState.moved && areAdjacent(tilePosition, emptyPosition)) {
    finishTileMove(tileId);
  }

  dragState.activeTileId = null;
  dragState.activePointerId = null;
  dragState.moved = false;
  dragState.tilePosition = null;
  dragState.emptyPosition = null;
  dragState.offsetX = 0;
  dragState.offsetY = 0;
}

function finishTileMove(tileId) {
  const tilePosition = tileOrder.indexOf(tileId);
  const emptyPosition = tileOrder.indexOf(EMPTY_TILE_ID);
  if (!areAdjacent(tilePosition, emptyPosition)) {
    return;
  }

  recordInteraction();
  const state = tileStates[tileId];
  state.interactionCount += 1;
  state.noiseLevel = Math.min(1, state.interactionCount * 0.12);
  state.distortionLevel = Math.min(1, state.interactionCount * 0.09);
  swapTiles(tilePosition, emptyPosition);
  renderPuzzle();
}

function swapTiles(positionA, positionB) {
  [tileOrder[positionA], tileOrder[positionB]] = [tileOrder[positionB], tileOrder[positionA]];
}







function normalizeAngleDelta(angleA, angleB) {
  let delta = Math.abs(angleA - angleB);
  if (delta > Math.PI) {
    delta = Math.PI * 2 - delta;
  }
  return delta;
}

function reportMouseStats() {
  if (!window.MouseStatsSign) {
    return;
  }

  window.MouseStatsSign.update({
    speed: Math.min(4, mouseState.speed),
    distance: mouseState.totalDistance,
    turns: mouseState.directionChanges,
    interactions: mouseState.interactions,
  });
}

function recordInteraction() {
  mouseState.interactions += 1;
  reportMouseStats();
}

function updateMouseStatsFromPointer(event) {
  const now = performance.now();
  const x = event.clientX;
  const y = event.clientY;

  if (!mouseState.hasPointerPosition) {
    mouseState.x = x;
    mouseState.y = y;
    mouseState.previousX = x;
    mouseState.previousY = y;
    mouseState.previousTime = now;
    mouseState.hasPointerPosition = true;
    reportMouseStats();
    return;
  }

  const dx = x - mouseState.previousX;
  const dy = y - mouseState.previousY;
  const distance = Math.hypot(dx, dy);
  const elapsed = Math.max(1, now - mouseState.previousTime);

  if (distance > 0) {
    const angle = Math.atan2(dy, dx);
    if (
      mouseState.lastDirectionAngle !== null &&
      normalizeAngleDelta(angle, mouseState.lastDirectionAngle) > Math.PI / 4
    ) {
      mouseState.directionChanges += 1;
    }
    mouseState.lastDirectionAngle = angle;
  }

  mouseState.x = x;
  mouseState.y = y;
  mouseState.previousX = x;
  mouseState.previousY = y;
  mouseState.previousTime = now;
  mouseState.totalDistance += distance;
  mouseState.speed = Math.min(4, distance / elapsed);
  reportMouseStats();
}

function updateTileVisuals(timestamp) {
  tileOrder.forEach((tileId, position) => {
    const tile = tiles[tileId];
    const state = tileStates[tileId];

    if (state.hoverLastTimestamp !== null) {
      updateHoverState(tileId, timestamp);
    }

    const hoverInfluence = state.darkness * 0.64;
    const noiseInfluence = state.noiseLevel * 0.8;
    const distortionInfluence = Math.min(1, state.distortionLevel);
    const brightness = Math.max(0, 1 - hoverInfluence - state.noiseLevel * 0.12);
    const contrast = 1 + hoverInfluence * 0.12;
    const boxInfluence = 0.18;

    const jitter = distortionInfluence > 0 ? Math.sin((timestamp + tileId * 120) * 0.008) * 1.8 * boxInfluence : 0;
    const rotate = ((distortionInfluence * 4.5 + noiseInfluence * 2.25) * boxInfluence) * Math.sin((tileId + timestamp * 0.003) * 0.9);
    const skewX = (distortionInfluence * 6 * boxInfluence) * Math.sin((tileId + timestamp * 0.002) * 1.15);
    const skewY = (distortionInfluence * 4.5 * boxInfluence) * Math.cos((tileId + timestamp * 0.0025) * 1.05);
    const dragOffsetX = dragState.activeTileId === tileId ? dragState.offsetX : 0;
    const dragOffsetY = dragState.activeTileId === tileId ? dragState.offsetY : 0;

    tile.style.filter = `brightness(${brightness}) contrast(${contrast})`;
    tile.style.transform = `translate(${dragOffsetX + jitter * 0.2}px, ${dragOffsetY + jitter * 0.1}px) rotate(${rotate.toFixed(2)}deg) skew(${skewX.toFixed(2)}deg, ${skewY.toFixed(2)}deg)`;
    tile.style.boxShadow = `inset 0 0 0 0.2vmin rgba(255,255,255,${0.04 + noiseInfluence * 0.08}), 0 0 0 0.2vmin rgba(0,0,0,0.2)`;
    tile.style.setProperty('--noiseOpacity', (noiseInfluence * 0.7 + hoverInfluence * 0.2).toFixed(3));

    if (!tile.classList.contains('empty')) {
      tile.classList.toggle('noise', state.noiseLevel > 0.02);
    }
  });
}

function checkCompletion() {
  const correctCount = tileOrder.reduce((count, tileId, index) => count + (tileId === index ? 1 : 0), 0);
  return Math.round((correctCount / TOTAL_TILES) * 100);
}

function maybeShowCompletion() {
  if (!isSolved && checkCompletion() === 100) {
    isSolved = true;
    overlay.classList.remove('hidden');
  }
}

function resetInteractionState() {
  mouseState.x = 0;
  mouseState.y = 0;
  mouseState.previousX = 0;
  mouseState.previousY = 0;
  mouseState.previousTime = performance.now();
  mouseState.speed = 0;
  mouseState.totalDistance = 0;
  mouseState.directionChanges = 0;
  mouseState.lastDirectionAngle = null;
  mouseState.hoveredTile = null;
  mouseState.interactions = 0;
  mouseState.hasPointerPosition = false;
  dragState.activeTileId = null;
  dragState.activePointerId = null;
  dragState.startX = 0;
  dragState.startY = 0;
  dragState.moved = false;
  dragState.tilePosition = null;
  dragState.emptyPosition = null;
  dragState.offsetX = 0;
  dragState.offsetY = 0;
  reportMouseStats();
}

function resetPuzzle() {
  isSolved = false;
  overlay.classList.add('hidden');
  if (dragState.activePointerId !== null && dragState.activeTileId !== null) {
    const activeTile = tiles[dragState.activeTileId];
    if (activeTile && activeTile.hasPointerCapture && activeTile.hasPointerCapture(dragState.activePointerId)) {
      activeTile.releasePointerCapture(dragState.activePointerId);
    }
  }
  tileOrder = Array.from({ length: TOTAL_TILES }, (_, index) => index);
  applyBackground(currentSetAssets.background);
  createTiles();
  shuffleTiles();
  renderPuzzle();
  resetInteractionState();
}

function setPuzzleSet(setId) {
  if (!PUZZLE_SETS[setId]) {
    return;
  }

  const loadToken = setLoadToken + 1;
  setLoadToken = loadToken;
  currentSetId = setId;
  applyPuzzleTheme();
  updateCharacterOptions();

  const assets = resolveSetAssets(setId);
  if (loadToken !== setLoadToken) {
    return;
  }

  currentSetAssets = {
    background: assets.background,
    pieces: assets.pieces,
  };
  updateCharacterOptions();
  resetPuzzle();
}

function updateFrame(timestamp) {
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(updateFrame);
    return;
  }

  updateTileVisuals(timestamp);
  maybeShowCompletion();
  animationFrameId = requestAnimationFrame(updateFrame);
}

function setupListeners() {
  window.addEventListener('pointermove', updateMouseStatsFromPointer);
  window.addEventListener('pointerdown', recordInteraction);
  puzzleElement.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', handlePointerUp);

  characterOptionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setPuzzleSet(button.dataset.puzzleSet);
    });
  });
}


async function initialize() {
  if (window.MouseStatsSign) {
    window.MouseStatsSign.init();
  }

  setupListeners();
  await setPuzzleSet(DEFAULT_SET_ID);
  animationFrameId = requestAnimationFrame(updateFrame);

  if (restartButton) {
    restartButton.addEventListener('click', resetPuzzle);
  }
}

initialize();
