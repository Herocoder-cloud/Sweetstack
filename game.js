// ============================================================
// SWEET STACK -- a candy-themed block stacking game
// ============================================================
// Core loop: a block slides left-right above the tower. Tap to
// drop it. Overlap with the block below determines what happens:
//   - No overlap at all       -> game over
//   - Near-perfect alignment  -> "perfect" placement, combo streak,
//                                 bonus points, block stays full width
//   - Partial overlap         -> block is trimmed to the overlap,
//                                 the cut-off piece falls away, combo resets
// The camera auto-scrolls upward once the tower gets tall enough
// that the top would otherwise go off-screen.
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreBadge = document.getElementById('scoreBadge');
const bestBadge = document.getElementById('bestBadge');
const comboPopup = document.getElementById('comboPopup');
const startScreen = document.getElementById('startScreen');
const overScreen = document.getElementById('overScreen');
const startBtn = document.getElementById('startBtn');
const retryBtn = document.getElementById('retryBtn');
const startBest = document.getElementById('startBest');
const finalHeight = document.getElementById('finalHeight');
const newBestLine = document.getElementById('newBestLine');
const tapHint = document.getElementById('tapHint');

const BLOCK_HEIGHT = 38;
const BASE_WIDTH = 190;
const PERFECT_THRESHOLD = 6; // pixels of misalignment still counted as "perfect"
const FIXED_TOP_Y_RATIO = 0.38;

let dpr = Math.min(window.devicePixelRatio || 1, 2);
let cssWidth, cssHeight;

// ---------- Game state ----------
let blocks = [];        // placed blocks: { x, width, hue }
let moving = null;      // the currently sliding block
let debris = [];        // falling cut-off pieces, purely visual
let particles = [];     // perfect-placement confetti bits
let stackHeight = 1;
let score = 0;
let combo = 0;
let speed = 2.2;
let gameState = 'start'; // start | playing | over
let groundY = 0;

function getBest() {
  return Number(localStorage.getItem('sweetStackBest') || 0);
}
function setBestIfHigher(value) {
  const best = getBest();
  if (value > best) {
    localStorage.setItem('sweetStackBest', String(value));
    return true;
  }
  return false;
}

// ---------- Audio (synthesized, no external files) ----------
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) audioCtx = new Ctx();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, duration, type, gainValue) {
  if (!audioCtx) return;
  type = type || 'sine';
  gainValue = gainValue || 0.15;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainValue;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(gainValue, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

function sfxPlace() { playTone(320, 0.12, 'square', 0.12); }
function sfxPerfect() {
  playTone(660, 0.1, 'sine', 0.15);
  setTimeout(function () { playTone(880, 0.14, 'sine', 0.15); }, 60);
}
function sfxGameOver() { playTone(180, 0.4, 'sawtooth', 0.12); }

// ---------- Canvas sizing ----------
function resizeCanvas() {
  const wrap = document.querySelector('.game-wrap');
  cssWidth = wrap.clientWidth;
  cssHeight = wrap.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;
  canvas.style.width = cssWidth + 'px';
  canvas.style.height = cssHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  groundY = cssHeight * 0.62;
}
window.addEventListener('resize', resizeCanvas);

// ---------- Setup / reset ----------
function resetGame() {
  blocks = [{ x: (cssWidth - BASE_WIDTH) / 2, width: BASE_WIDTH, hue: 340 }];
  debris = [];
  particles = [];
  stackHeight = 1;
  score = 0;
  combo = 0;
  speed = 2.2;
  scoreBadge.textContent = '0';
  spawnMovingBlock();
}

function topBlockNaturalY(index) {
  return groundY - index * BLOCK_HEIGHT;
}

function getCameraShift() {
  const naturalTopY = topBlockNaturalY(stackHeight - 1);
  const fixedTopY = cssHeight * FIXED_TOP_Y_RATIO;
  return Math.max(0, fixedTopY - naturalTopY);
}

function spawnMovingBlock() {
  const top = blocks[blocks.length - 1];
  const cameraShift = getCameraShift();
  const y = topBlockNaturalY(stackHeight - 1) + cameraShift - BLOCK_HEIGHT;
  const fromLeft = stackHeight % 2 === 0;
  moving = {
    x: fromLeft ? -top.width : cssWidth,
    y: y,
    width: top.width,
    hue: (top.hue + 24) % 360,
    dir: fromLeft ? 1 : -1
  };
}

// ---------- Input ----------
function handleDrop() {
  if (gameState === 'start') {
    startGame();
    return;
  }
  if (gameState === 'over') return;
  if (gameState !== 'playing' || !moving) return;

  const top = blocks[blocks.length - 1];
  const moveLeft = moving.x;
  const moveRight = moving.x + moving.width;
  const belowLeft = top.x;
  const belowRight = top.x + top.width;

  const overlapLeft = Math.max(belowLeft, moveLeft);
  const overlapRight = Math.min(belowRight, moveRight);
  const overlapWidth = overlapRight - overlapLeft;

  if (overlapWidth <= 0) {
    triggerGameOver();
    return;
  }

  const isPerfect = Math.abs(moveLeft - belowLeft) <= PERFECT_THRESHOLD;

  let placedX, placedWidth;
  if (isPerfect) {
    placedX = belowLeft;
    placedWidth = top.width;
    combo += 1;
    spawnParticles(placedX + placedWidth / 2, moving.y);
    comboFlash(combo >= 2 ? (combo + 'x COMBO!') : 'PERFECT!');
    sfxPerfect();
    score += 5 + combo * 2;
  } else {
    placedX = overlapLeft;
    placedWidth = overlapWidth;
    combo = 0;
    sfxPlace();
    score += 1;

    if (moveLeft < overlapLeft) {
      debris.push({ x: moveLeft, y: moving.y, width: overlapLeft - moveLeft, hue: moving.hue, vy: 1, vx: -1.5, rot: 0 });
    }
    if (moveRight > overlapRight) {
      debris.push({ x: overlapRight, y: moving.y, width: moveRight - overlapRight, hue: moving.hue, vy: 1, vx: 1.5, rot: 0 });
    }
  }

  blocks.push({ x: placedX, width: placedWidth, hue: moving.hue });
  stackHeight += 1;
  scoreBadge.textContent = String(score);
  speed = Math.min(6.5, 2.2 + stackHeight * 0.08);

  if (placedWidth < 4) {
    triggerGameOver();
    return;
  }

  spawnMovingBlock();
}

function comboFlash(text) {
  comboPopup.textContent = text;
  comboPopup.classList.remove('pop');
  void comboPopup.offsetWidth; // restart animation
  comboPopup.classList.add('pop');
}

function spawnParticles(x, y) {
  for (let i = 0; i < 14; i++) {
    particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 5,
      vy: -Math.random() * 4 - 1,
      life: 1,
      hue: Math.random() * 360
    });
  }
}

function triggerGameOver() {
  gameState = 'over';
  if (moving) {
    debris.push({ x: moving.x, y: moving.y, width: moving.width, hue: moving.hue, vy: 0, vx: moving.dir * 2, rot: 0 });
    moving = null;
  }
  sfxGameOver();
  const isNewBest = setBestIfHigher(stackHeight);
  finalHeight.textContent = String(stackHeight);
  newBestLine.textContent = isNewBest ? 'New best!' : '';
  bestBadge.textContent = 'Best: ' + getBest();
  setTimeout(function () {
    overScreen.classList.remove('hidden');
  }, 700);
}

function startGame() {
  gameState = 'playing';
  ensureAudio();
  startScreen.classList.add('hidden');
  overScreen.classList.add('hidden');
  tapHint.classList.remove('hidden');
  resetGame();
}

startBtn.addEventListener('click', function () {
  ensureAudio();
  startGame();
});
retryBtn.addEventListener('click', function () {
  ensureAudio();
  startGame();
});

canvas.addEventListener('pointerdown', function () {
  if (gameState === 'playing') handleDrop();
});
window.addEventListener('keydown', function (e) {
  if (e.code === 'Space' && gameState === 'playing') {
    e.preventDefault();
    handleDrop();
  }
});

// ---------- Update loop ----------
function update() {
  if (gameState === 'playing' && moving) {
    moving.x += moving.dir * speed;
    if (moving.x <= 0) { moving.x = 0; moving.dir = 1; }
    if (moving.x + moving.width >= cssWidth) { moving.x = cssWidth - moving.width; moving.dir = -1; }
  }

  debris.forEach(function (d) {
    d.vy += 0.35;
    d.x += d.vx;
    d.y += d.vy;
    d.rot += 0.08 * d.vx;
  });
  debris = debris.filter(function (d) { return d.y < cssHeight + 80; });

  particles.forEach(function (p) {
    p.vy += 0.15;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.025;
  });
  particles = particles.filter(function (p) { return p.life > 0; });
}

// ---------- Render ----------
function draw() {
  const sky = ctx.createLinearGradient(0, 0, 0, cssHeight);
  sky.addColorStop(0, '#7ED9F5');
  sky.addColorStop(1, '#FFE4A8');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  drawCloud(cssWidth * 0.2, cssHeight * 0.15, 30);
  drawCloud(cssWidth * 0.7, cssHeight * 0.25, 22);

  const cameraShift = getCameraShift();

  ctx.fillStyle = '#8FD97A';
  ctx.fillRect(0, groundY + cameraShift + BLOCK_HEIGHT, cssWidth, cssHeight);

  blocks.forEach(function (b, i) {
    const y = topBlockNaturalY(i) + cameraShift;
    if (y > cssHeight + BLOCK_HEIGHT || y < -BLOCK_HEIGHT) return;
    drawBlock(b.x, y, b.width, b.hue);
  });

  debris.forEach(function (d) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - d.y / (cssHeight + 80));
    drawBlock(d.x, d.y, d.width, d.hue);
    ctx.restore();
  });

  if (moving) {
    drawBlock(moving.x, moving.y, moving.width, moving.hue);
  }

  particles.forEach(function (p) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = 'hsl(' + p.hue + ', 90%, 65%)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawBlock(x, y, width, hue) {
  const h = BLOCK_HEIGHT - 4;
  const r = 8;
  ctx.fillStyle = 'hsl(' + hue + ', 80%, 65%)';
  roundRect(x, y, width, h, r);
  ctx.fill();
  ctx.fillStyle = 'hsla(0, 0%, 100%, 0.25)';
  roundRect(x + 3, y + 3, Math.max(0, width - 6), Math.max(0, h * 0.35), r * 0.6);
  ctx.fill();
}

function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCloud(cx, cy, size) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2);
  ctx.arc(cx + size * 0.6, cy + size * 0.1, size * 0.5, 0, Math.PI * 2);
  ctx.arc(cx - size * 0.6, cy + size * 0.1, size * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- Main loop ----------
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);
}

// ---------- Init ----------
function init() {
  resizeCanvas();
  startBest.textContent = String(getBest());
  bestBadge.textContent = 'Best: ' + getBest();
  blocks = [{ x: (cssWidth - BASE_WIDTH) / 2, width: BASE_WIDTH, hue: 340 }];
  spawnMovingBlock();
  loop();
}

init();
