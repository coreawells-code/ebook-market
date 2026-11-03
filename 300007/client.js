/**
 * NEBULA SWARM — an original fixed-screen arcade shooter.
 *
 * The whole game runs in this browser tab. The Higgsfield room server (when
 * present) only keeps a shared high-score board; without a server the game
 * still plays and keeps the best score in localStorage.
 */

// ── canvas ──────────────────────────────────────────────────────────────────
const W = 240;
const H = 320;
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = W;
canvas.height = H;
ctx.imageSmoothingEnabled = false;

const bgImg = new Image();
let bgReady = false;
bgImg.onload = () => (bgReady = true);
// Local copy falls back to the Higgsfield-generated original if bg.jpg is absent.
bgImg.onerror = () => {
  if (bgImg.dataset.fallback) return;
  bgImg.dataset.fallback = "1";
  bgImg.src = "https://nebula-swarm-300007.higgsfield.app/bg.jpg";
};
bgImg.src = "bg.jpg";

// ── pixel sprites (original designs) ────────────────────────────────────────
// Each sprite: rows of characters, '.' = transparent, others map to a palette.
const SPR = {
  ship: {
    pal: { w: "#f4f7ff", c: "#38e8ff", b: "#2a6cff", r: "#ff4f7b", g: "#8d97b5" },
    rows: [
      ".......w.......",
      "......wcw......",
      "......wcw......",
      ".....wwcww.....",
      ".....wbcbw.....",
      "..r..wwwww..r..",
      "..w.wwgwgww.w..",
      ".wwwwwgwgwwwww.",
      "wwbwwwwwwwwwbww",
      "wwbww.www.wwbww",
      "ww.g..r.r..g.ww",
    ],
  },
  // Drone — small lime bug (bottom rows)
  drone: [
    {
      pal: { l: "#9dff4a", d: "#3e9b1f", y: "#ffe14a" },
      rows: [
        "..d.....d..",
        "...d...d...",
        "..lllllll..",
        ".llyllylll.",
        "lllllllllll",
        "l.lllllll.l",
        "l.l.....l.l",
        "...ll.ll...",
      ],
    },
    {
      pal: { l: "#9dff4a", d: "#3e9b1f", y: "#ffe14a" },
      rows: [
        "..d.....d..",
        "d..d...d..d",
        "l.lllllll.l",
        "lllyllylll.",
        "lllllllllll",
        "..lllllll..",
        "..l.....l..",
        ".l.......l.",
      ],
    },
  ],
  // Wasp — amber winged (middle rows)
  wasp: [
    {
      pal: { o: "#ffad33", y: "#ffe14a", k: "#7a3a00", w: "#ffd9a0" },
      rows: [
        "ww.......ww",
        "www..k..www",
        ".wwooooooww",
        "..oyoooyo..",
        "..ooooooo..",
        "...okyko...",
        "...ooooo...",
        "....o.o....",
      ],
    },
    {
      pal: { o: "#ffad33", y: "#ffe14a", k: "#7a3a00", w: "#ffd9a0" },
      rows: [
        "...........",
        "w....k....w",
        "wwwooooooww",
        "wwoyoooyoww",
        "..ooooooo..",
        "...okyko...",
        "...ooooo...",
        "...o...o...",
      ],
    },
  ],
  // Matriarch — magenta, takes 2 hits (top row)
  queen: [
    {
      pal: { m: "#ff3fc8", p: "#9b2cff", y: "#ffe14a", w: "#ffc2ef" },
      rows: [
        "w..p.....p..w",
        "ww..p...p..ww",
        "wwwmmmmmmmwww",
        ".wmmymmmymmw.",
        "..mmmmmmmmm..",
        "...mpmmmpm...",
        "..m.mmmmm.m..",
        ".m...m.m...m.",
      ],
    },
    {
      pal: { m: "#ff3fc8", p: "#9b2cff", y: "#ffe14a", w: "#ffc2ef" },
      rows: [
        "....p...p....",
        "w...p...p...w",
        "wwwmmmmmmmwww",
        "wwmmymmmymmww",
        "w.mmmmmmmmm.w",
        "...mpmmmpm...",
        "...mmmmmmm...",
        "..m..m.m..m..",
      ],
    },
  ],
  // queen after one hit — cooler colours
  queenHurt: {
    pal: { m: "#5fb0ff", p: "#2c4cff", y: "#ffffff", w: "#c2e6ff" },
  },
};

const spriteCache = new Map();
function bake(def, palOverride) {
  const key = def.rows.join("") + (palOverride ? JSON.stringify(palOverride) : "");
  if (spriteCache.has(key)) return spriteCache.get(key);
  const pal = palOverride || def.pal;
  const c = document.createElement("canvas");
  c.width = def.rows[0].length;
  c.height = def.rows.length;
  const g = c.getContext("2d");
  def.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "." || !pal[ch]) return;
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    });
  });
  spriteCache.set(key, c);
  return c;
}

// ── sound (tiny WebAudio synth) ─────────────────────────────────────────────
let actx = null;
let muted = false;
function beep(freq, dur, type = "square", vol = 0.06, slide = 0) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), actx.currentTime + dur);
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination);
    o.start();
    o.stop(actx.currentTime + dur);
  } catch {
    /* audio unavailable */
  }
}
const sfx = {
  shoot: () => beep(880, 0.08, "square", 0.04, 600),
  hit: () => beep(220, 0.15, "sawtooth", 0.06, -150),
  boom: () => beep(120, 0.4, "sawtooth", 0.08, -90),
  dive: () => beep(600, 0.35, "triangle", 0.03, -400),
  power: () => {
    beep(660, 0.1, "square", 0.05);
    setTimeout(() => beep(990, 0.15, "square", 0.05), 90);
  },
  stage: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, "square", 0.04), i * 110)),
};

// ── input ───────────────────────────────────────────────────────────────────
const keys = new Set();
addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key === "Enter" || e.key === " ") startIfIdle();
  if (e.key.toLowerCase() === "m") muted = !muted;
  if (e.key.toLowerCase() === "p" && game.mode === "play") game.paused = !game.paused;
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// touch: drag to move, auto-fire while touching
let touchX = null;
function canvasX(clientX) {
  const r = canvas.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * W;
}
canvas.addEventListener("pointerdown", (e) => {
  touchX = canvasX(e.clientX);
  startIfIdle();
});
canvas.addEventListener("pointermove", (e) => {
  if (touchX !== null) touchX = canvasX(e.clientX);
});
addEventListener("pointerup", () => (touchX = null));
addEventListener("pointercancel", () => (touchX = null));

// ── game state ──────────────────────────────────────────────────────────────
const game = {
  mode: "title", // title | play | over
  paused: false,
  t: 0,
  score: 0,
  best: Number(safeGet("nebula:best") || 0),
  lives: 3,
  stage: 0,
  stageBanner: 0,
  player: null,
  shots: [],
  bombs: [],
  enemies: [],
  parts: [],
  pickups: [],
  stars: [],
  formX: 0,
  diveTimer: 0,
  respawn: 0,
  bgY: 0,
};

for (let i = 0; i < 60; i++) {
  game.stars.push({ x: Math.random() * W, y: Math.random() * H, s: 0.3 + Math.random() * 1.2 });
}

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function startIfIdle() {
  if (game.mode === "title" || (game.mode === "over" && game.t > 60)) newGame();
}

function newGame() {
  game.mode = "play";
  game.paused = false;
  game.score = 0;
  game.lives = 3;
  game.stage = 0;
  game.shots = [];
  game.bombs = [];
  game.parts = [];
  game.pickups = [];
  game.player = { x: W / 2, y: H - 30, cool: 0, power: 0, inv: 90 };
  nextStage();
}

const FORM_COLS = 8;
function slotPos(e) {
  const sway = Math.sin(game.t / 60) * 14;
  const breathe = 1 + Math.sin(game.t / 45) * 0.06;
  const cx = W / 2 + sway;
  return {
    x: cx + (e.col - (FORM_COLS - 1) / 2) * 22 * breathe,
    y: 40 + e.row * 20,
  };
}

function nextStage() {
  game.stage += 1;
  game.stageBanner = 120;
  game.enemies = [];
  game.bombs = [];
  sfx.stage();
  const layout = [
    ["queen", 2, 5],
    ["wasp", 0, 8],
    ["wasp", 0, 8],
    ["drone", 0, 8],
    ["drone", 0, 8],
  ];
  let order = 0;
  layout.forEach(([kind, start, count], row) => {
    const offset = kind === "queen" ? 1.5 : 0;
    for (let i = 0; i < count; i++) {
      const col = kind === "queen" ? i + offset : i;
      const fromLeft = (row + i) % 2 === 0;
      game.enemies.push({
        kind,
        row,
        col,
        hp: kind === "queen" ? 2 : 1,
        state: "enter",
        // entry: swoop in along a bezier from off-screen
        delay: order * 6 + row * 10,
        p0: { x: fromLeft ? -20 : W + 20, y: 220 + (i % 3) * 10 },
        p1: { x: fromLeft ? W * 0.9 : W * 0.1, y: 60 },
        k: 0,
        x: -50,
        y: -50,
        fire: 0,
        carrier: kind === "wasp" && (i === 2 || i === 5) && row === 1,
      });
      order++;
    }
  });
  game.diveTimer = 200;
}

function spawnParts(x, y, color, n = 12) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * 2;
    game.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 30 + Math.random() * 20, color });
  }
}

function bezier(p0, p1, p2, k) {
  const u = 1 - k;
  return {
    x: u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x,
    y: u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y,
  };
}

function startDive() {
  const ready = game.enemies.filter((e) => e.state === "form");
  if (!ready.length) return;
  const leader = ready[Math.floor(Math.random() * ready.length)];
  const group = [leader];
  // queens bring an escort of wasps
  if (leader.kind === "queen") {
    ready
      .filter((e) => e.kind === "wasp" && Math.abs(e.col - leader.col) < 1.6 && e !== leader)
      .slice(0, 2)
      .forEach((e) => group.push(e));
  }
  const dir = leader.x < W / 2 ? 1 : -1;
  group.forEach((e, i) => {
    e.state = "dive";
    e.k = 0;
    e.diveDir = dir;
    e.diveSeed = Math.random() * 10;
    e.diveDelay = i * 8;
    e.vy = 0;
    e.fire = 30 + Math.random() * 40;
  });
  sfx.dive();
}

function killPlayer() {
  const p = game.player;
  spawnParts(p.x, p.y, "#38e8ff", 30);
  spawnParts(p.x, p.y, "#ffffff", 20);
  sfx.boom();
  game.lives -= 1;
  game.bombs = [];
  if (game.lives <= 0) {
    game.mode = "over";
    game.t = 0;
    if (game.score > game.best) {
      game.best = game.score;
      safeSet("nebula:best", String(game.best));
    }
    submitScore(game.score);
  } else {
    game.respawn = 90;
    p.power = 0;
  }
}

const POINTS = { drone: [50, 100], wasp: [80, 160], queen: [150, 400] };

function hitEnemy(e) {
  e.hp -= 1;
  if (e.hp > 0) {
    sfx.hit();
    spawnParts(e.x, e.y, "#5fb0ff", 6);
    return;
  }
  const [inForm, diving] = POINTS[e.kind];
  const pts = e.state === "dive" ? diving : inForm;
  game.score += pts;
  if (e.state === "dive") game.parts.push({ x: e.x, y: e.y, vx: 0, vy: -0.3, life: 50, text: String(pts) });
  const color = e.kind === "queen" ? "#ff3fc8" : e.kind === "wasp" ? "#ffad33" : "#9dff4a";
  spawnParts(e.x, e.y, color, 14);
  sfx.boom();
  if (e.carrier || Math.random() < 0.03) game.pickups.push({ x: e.x, y: e.y, vy: 0.7 });
  game.enemies = game.enemies.filter((o) => o !== e);
}

// ── update ──────────────────────────────────────────────────────────────────
function update() {
  game.t++;
  game.bgY = (game.bgY + 0.25) % H;
  for (const s of game.stars) {
    s.y += s.s;
    if (s.y > H) {
      s.y = 0;
      s.x = Math.random() * W;
    }
  }
  for (const pt of game.parts) {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life--;
  }
  game.parts = game.parts.filter((pt) => pt.life > 0);

  if (game.mode !== "play" || game.paused) return;
  const p = game.player;
  if (game.stageBanner > 0) game.stageBanner--;

  // player
  if (game.respawn > 0) {
    game.respawn--;
    if (game.respawn === 0) {
      p.x = W / 2;
      p.inv = 120;
    }
  } else {
    const speed = 2.2;
    if (keys.has("arrowleft") || keys.has("a")) p.x -= speed;
    if (keys.has("arrowright") || keys.has("d")) p.x += speed;
    if (touchX !== null) p.x += Math.max(-speed * 1.4, Math.min(speed * 1.4, touchX - p.x));
    p.x = Math.max(9, Math.min(W - 9, p.x));
    if (p.cool > 0) p.cool--;
    if (p.inv > 0) p.inv--;
    if (p.power > 0) p.power--;
    const firing = keys.has(" ") || keys.has("z") || keys.has("arrowup") || keys.has("w") || touchX !== null;
    const maxShots = p.power > 0 ? 6 : 2;
    if (firing && p.cool === 0 && game.shots.length < maxShots) {
      if (p.power > 0) {
        game.shots.push({ x: p.x - 5, y: p.y - 6 }, { x: p.x + 5, y: p.y - 6 });
      } else {
        game.shots.push({ x: p.x, y: p.y - 8 });
      }
      p.cool = 10;
      sfx.shoot();
    }
  }

  // shots
  for (const s of game.shots) s.y -= 5.5;
  game.shots = game.shots.filter((s) => s.y > -10);

  // enemies
  const diffMul = 1 + (game.stage - 1) * 0.12;
  for (const e of game.enemies) {
    const slot = slotPos(e);
    if (e.state === "enter") {
      if (e.delay > 0) {
        e.delay--;
        continue;
      }
      e.k = Math.min(1, e.k + 0.012 * diffMul);
      const pos = bezier(e.p0, e.p1, slot, e.k);
      e.x = pos.x;
      e.y = pos.y;
      if (e.k >= 1) e.state = "form";
    } else if (e.state === "form") {
      e.x = slot.x;
      e.y = slot.y;
    } else if (e.state === "dive") {
      if (e.diveDelay > 0) {
        e.diveDelay--;
        e.x = slot.x;
        e.y = slot.y;
        continue;
      }
      e.k += 1;
      // loop up first, then sweep down in a sine toward the player
      if (e.k < 30) {
        const a = (e.k / 30) * Math.PI;
        e.x += e.diveDir * Math.cos(a) * 1.8;
        e.y -= Math.sin(a) * 1.5;
      } else {
        e.vy = Math.min(2.6 * diffMul, e.vy + 0.06);
        e.y += e.vy;
        const target = game.respawn > 0 ? W / 2 : p.x;
        e.x += Math.sin((e.k + e.diveSeed * 10) / 18) * 1.6 + Math.sign(target - e.x) * 0.5;
      }
      e.fire--;
      if (e.fire <= 0 && e.y < H - 80 && game.respawn === 0) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        const sp = 1.8 * Math.min(1.6, diffMul);
        game.bombs.push({ x: e.x, y: e.y + 4, vx: (dx / len) * sp * 0.5, vy: sp });
        e.fire = 999;
      }
      if (e.y > H + 12) {
        // wrap back to the top and glide into the formation slot again
        e.state = "enter";
        e.delay = 0;
        e.k = 0;
        e.p0 = { x: e.x, y: -16 };
        e.p1 = { x: slot.x, y: 10 };
      }
    }

    // collisions with shots
    const r = e.kind === "queen" ? 7 : 6;
    for (const s of game.shots) {
      if (!s.dead && Math.abs(s.x - e.x) < r && Math.abs(s.y - e.y) < r) {
        s.dead = true;
        hitEnemy(e);
        break;
      }
    }
    // collision with player
    if (game.respawn === 0 && p.inv === 0 && game.enemies.includes(e) && Math.abs(e.x - p.x) < 9 && Math.abs(e.y - p.y) < 8) {
      hitEnemy(e);
      if (game.enemies.includes(e)) game.enemies = game.enemies.filter((o) => o !== e);
      killPlayer();
    }
  }
  game.shots = game.shots.filter((s) => !s.dead);

  // formation fire (light) + dive scheduling
  if (game.enemies.length) {
    game.diveTimer--;
    const interval = Math.max(40, 150 - game.stage * 12 - (40 - game.enemies.length) * 1.5);
    if (game.diveTimer <= 0 && game.stageBanner < 60) {
      startDive();
      if (game.stage >= 3 && Math.random() < 0.4) startDive();
      game.diveTimer = interval;
    }
  } else if (game.mode === "play" && game.respawn === 0) {
    nextStage();
  }

  // bombs
  for (const b of game.bombs) {
    b.x += b.vx;
    b.y += b.vy;
    if (game.respawn === 0 && p.inv === 0 && Math.abs(b.x - p.x) < 5 && Math.abs(b.y - p.y) < 6) {
      b.dead = true;
      killPlayer();
    }
  }
  game.bombs = game.bombs.filter((b) => !b.dead && b.y < H + 6 && b.x > -6 && b.x < W + 6);

  // pickups
  for (const u of game.pickups) {
    u.y += u.vy;
    if (game.respawn === 0 && Math.abs(u.x - p.x) < 10 && Math.abs(u.y - p.y) < 10) {
      u.dead = true;
      p.power = 60 * 12;
      game.score += 300;
      sfx.power();
    }
  }
  game.pickups = game.pickups.filter((u) => !u.dead && u.y < H + 8);
}

// ── draw ────────────────────────────────────────────────────────────────────
function drawSprite(img, x, y, scale = 1) {
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

function text(str, x, y, color = "#fff", size = 8, align = "center") {
  ctx.font = `${size}px "Press Start 2P", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#000";
  ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function draw() {
  // background image scrolling + starfield
  ctx.fillStyle = "#05040d";
  ctx.fillRect(0, 0, W, H);
  if (bgReady) {
    ctx.globalAlpha = 0.85;
    ctx.drawImage(bgImg, 0, game.bgY - H, W, H);
    ctx.drawImage(bgImg, 0, game.bgY, W, H);
    ctx.globalAlpha = 1;
  }
  for (const s of game.stars) {
    ctx.fillStyle = s.s > 1 ? "#ffffff" : "#8fa0ff";
    ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, s.s > 1.2 ? 2 : 1);
  }

  const flap = Math.floor(game.t / 16) % 2;

  // enemies
  for (const e of game.enemies) {
    if (e.state === "enter" && e.delay > 0) continue;
    let img;
    if (e.kind === "queen") img = e.hp === 1 ? bake(SPR.queen[flap], SPR.queenHurt.pal) : bake(SPR.queen[flap]);
    else img = bake(SPR[e.kind][flap]);
    drawSprite(img, e.x, e.y);
    if (e.carrier && e.state === "form" && game.t % 40 < 20) {
      ctx.fillStyle = "#38e8ff";
      ctx.fillRect(Math.round(e.x) - 1, Math.round(e.y) - 7, 2, 2);
    }
  }

  // pickups
  for (const u of game.pickups) {
    ctx.fillStyle = game.t % 10 < 5 ? "#38e8ff" : "#ffffff";
    ctx.beginPath();
    ctx.arc(u.x, u.y, 4, 0, Math.PI * 2);
    ctx.fill();
    text("P", u.x, u.y + 1, "#05040d", 6);
  }

  // shots
  for (const s of game.shots) {
    ctx.fillStyle = "#38e8ff";
    ctx.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 4, 2, 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(s.x) - 0.5, Math.round(s.y) - 4, 1, 4);
  }
  // bombs
  for (const b of game.bombs) {
    ctx.fillStyle = game.t % 6 < 3 ? "#ff4f7b" : "#ffe14a";
    ctx.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 2, 3, 4);
  }

  // player
  const p = game.player;
  if (game.mode === "play" && p && game.respawn === 0 && !(p.inv > 0 && game.t % 8 < 4)) {
    drawSprite(bake(SPR.ship), p.x, p.y);
    ctx.fillStyle = game.t % 4 < 2 ? "#38e8ff" : "#ffffff";
    ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) + 6, 2, 2 + (game.t % 3));
    if (p.power > 0) {
      ctx.strokeStyle = `rgba(56,232,255,${0.3 + 0.2 * Math.sin(game.t / 4)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // particles
  for (const pt of game.parts) {
    if (pt.text) {
      text(pt.text, pt.x, pt.y, "#ffe14a", 6);
      continue;
    }
    ctx.globalAlpha = Math.min(1, pt.life / 30);
    ctx.fillStyle = pt.color;
    ctx.fillRect(Math.round(pt.x), Math.round(pt.y), 2, 2);
    ctx.globalAlpha = 1;
  }

  // HUD
  text("SCORE", 8, 8, "#ff3fc8", 6, "left");
  text(String(game.score).padStart(6, "0"), 8, 17, "#fff", 8, "left");
  text("HI", W / 2, 8, "#38e8ff", 6);
  text(String(Math.max(game.best, game.score)).padStart(6, "0"), W / 2, 17, "#fff", 8);
  text(`STAGE ${game.stage || 1}`, W - 8, 8, "#9dff4a", 6, "right");
  if (game.mode === "play") {
    for (let i = 0; i < game.lives - 1; i++) drawSprite(bake(SPR.ship), 12 + i * 16, H - 8);
  }

  if (game.mode === "title") {
    ctx.fillStyle = "rgba(5,4,13,0.55)";
    ctx.fillRect(0, 0, W, H);
    text("NEBULA", W / 2, 90, "#38e8ff", 20);
    text("SWARM", W / 2, 116, "#ff3fc8", 20);
    drawSprite(bake(SPR.queen[flap]), W / 2 - 40, 160);
    text("400", W / 2 - 40, 176, "#ffe14a", 6);
    drawSprite(bake(SPR.wasp[flap]), W / 2, 160);
    text("160", W / 2, 176, "#ffe14a", 6);
    drawSprite(bake(SPR.drone[flap]), W / 2 + 40, 160);
    text("100", W / 2 + 40, 176, "#ffe14a", 6);
    if (game.t % 60 < 40) text("PRESS SPACE / TAP", W / 2, 215, "#fff", 8);
    text("← → MOVE   SPACE FIRE", W / 2, 245, "#8b8d94", 6);
    text("P PAUSE   M MUTE", W / 2, 258, "#8b8d94", 6);
    drawBoard(280);
  }
  if (game.mode === "play" && game.stageBanner > 0) {
    text(`STAGE ${game.stage}`, W / 2, H / 2, "#9dff4a", 12);
  }
  if (game.mode === "play" && game.paused) {
    text("PAUSED", W / 2, H / 2, "#fff", 12);
  }
  if (game.mode === "over") {
    ctx.fillStyle = "rgba(5,4,13,0.6)";
    ctx.fillRect(0, 0, W, H);
    text("GAME OVER", W / 2, 120, "#ff4f7b", 16);
    text(`SCORE ${game.score}`, W / 2, 150, "#fff", 8);
    if (game.t > 60 && game.t % 60 < 40) text("PRESS SPACE / TAP", W / 2, 180, "#fff", 8);
    drawBoard(215);
  }
}

// ── shared leaderboard via the room server (optional) ───────────────────────
let board = [];
function drawBoard(y) {
  if (!board.length) return;
  text("TOP PILOTS", W / 2, y, "#ffad33", 6);
  board.slice(0, 3).forEach((row, i) => {
    text(`${i + 1}. ${row.name.padEnd(6, " ")} ${String(row.score).padStart(6, "0")}`, W / 2, y + 11 + i * 10, row.you ? "#38e8ff" : "#fff", 6);
  });
}

let socket = null;
function playerId() {
  const key = "hf:game:playerId";
  let id = safeGet(key);
  if (!id) {
    id = Math.random().toString(36).slice(2, 10);
    safeSet(key, id);
  }
  return id;
}
function connect() {
  if (location.protocol === "file:") return;
  const room = new URLSearchParams(location.search).get("room") || "main";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  try {
    socket = new WebSocket(`${proto}//${location.host}/ws/${encodeURIComponent(room)}`);
  } catch {
    return;
  }
  socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "join", playerId: playerId() })));
  socket.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "state" && msg.view && Array.isArray(msg.view.top)) {
      board = msg.view.top;
      if (msg.view.yourBest > game.best) game.best = msg.view.yourBest;
    }
  });
  socket.addEventListener("close", () => setTimeout(connect, 3000));
  socket.addEventListener("error", () => {});
}
function submitScore(score) {
  if (socket && socket.readyState === 1 && score > 0) {
    socket.send(JSON.stringify({ type: "action", action: { type: "score", score } }));
  }
}
connect();

// ── main loop (fixed 60 Hz step) ────────────────────────────────────────────
let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= 1000 / 60) {
    update();
    acc -= 1000 / 60;
  }
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
