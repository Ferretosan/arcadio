/* Blob Battle — a fake-multiplayer agar.io style game */
(() => {
  "use strict";

  // ---------------------------------------------------------------- constants

  const IS_SMALL = window.innerWidth < 720;

  const CONFIG = {
    worldRadius: 2600,
    startMass: 30,
    maxCells: 16,
    foodCount: IS_SMALL ? 1250 : 1700,
    virusCount: IS_SMALL ? 16 : 22,
    botTarget: IS_SMALL ? 24 : 32,
    botNames: "blob-battle-name",
    botColor: "blob-battle-color",
    bestKey: "blob-battle-best",
  };

  const PALETTE = [
    { main: "#ff5a7a", dark: "#c8284e", light: "#ffb3c3" },
    { main: "#3aa7ff", dark: "#1466c9", light: "#a7d7ff" },
    { main: "#2fc98d", dark: "#128a5c", light: "#a3f0d2" },
    { main: "#ffa62b", dark: "#c97200", light: "#ffd79a" },
    { main: "#9b6cff", dark: "#6533d6", light: "#d6c4ff" },
    { main: "#22c9d6", dark: "#0a93a1", light: "#a9f2f7" },
    { main: "#f45bb5", dark: "#bd2a82", light: "#ffb9e4" },
    { main: "#ffd23f", dark: "#c79c00", light: "#ffeda6" },
    { main: "#ff7a45", dark: "#c94a17", light: "#ffc0a6" },
    { main: "#5c7cff", dark: "#2f49c9", light: "#bcc8ff" },
  ];

  const FOOD_COLORS = [
    "#ff6b8a", "#ff9f43", "#ffd23f", "#7bd88f", "#2ec4b6",
    "#4dabf7", "#9b6cff", "#f45bb5", "#ffa8b8", "#a0e7a0",
  ];

  const BOT_NAMES = [
    "Sushi", "Nugget", "Waffles", "Biscuit", "Ziggy", "Cosmo", "Pickles",
    "Mochi", "Bubbles", "Tofu", "Noodle", "Sprinkles", "Gizmo", "Peanut",
    "Muffin", "Turbo", "Blobzilla", "Sir Blob", "Jellybean", "Cupcake",
    "Nacho", "Wasabi", "Pancake", "Dumpling", "Boba", "Kiwi", "Mango",
    "Pepper", "Squish", "Wobble", "Gloop", "Blobby", "Jiggly", "Splat",
    "Chomper", "Goo", "Pudding", "Taco", "Bagel", "Pretzel", "Nebula",
    "Comet", "Pixel", "Echo", "Fizz", "Zap", "Crimson", "Onyx", "Frost",
    "Spark", "Vortex", "Bandit", "Rocket", "Ace", "Rex", "Milo", "Luna",
    "Cleo", "Finn", "Bolt", "Slime", "Gumdrop", "Marshmallow", "Coconut",
    "Pebble", "Sprout", "Bean", "Toast", "Cheddar", "Olive", "Peach",
    "Tiny", "Chonk", "Big Boi", "Nom Nom", "Lil Blob", "Danger", "Sneaky",
  ];

  const $ = (id) => document.getElementById(id);

  const canvas = $("game");
  const ctx = canvas.getContext("2d");
  const app = $("app");
  const feedEl = $("feed");
  const massEl = $("mass-value");
  const bestEl = $("best-value");
  const killsEl = $("kills-value");
  const lbListEl = $("lb-list");
  const playerRankEl = $("player-rank");
  const hintEl = $("hint");
  const menuEl = $("menu");
  const deadEl = $("dead");
  const pauseEl = $("pause");
  const nameInput = $("name-input");
  const colorRow = $("color-row");
  const muteBtn = $("mute-btn");

  let dpr = 1;
  let renderScale = Math.min(1.5, window.devicePixelRatio || 1);
  let qualityStart = 0;
  let qualityFrames = 0;
  let W = window.innerWidth;
  let H = window.innerHeight;

  // localStorage can throw inside sandboxed/embedded iframes, so never let it break the game.
  function readStore(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (err) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      /* storage unavailable — ignore */
    }
  }

  // ------------------------------------------------------------------- state

  const state = {
    mode: "menu",
    entities: new Map(),
    food: [],
    viruses: [],
    particles: [],
    floaters: [],
    camera: { x: 0, y: 0, zoom: 0.7 },
    pointer: { x: W / 2, y: H / 2, active: false, touch: false },
    player: null,
    selectedColor: Number(readStore(CONFIG.botColor) || 0) % PALETTE.length,
    time: 0,
    lastFrame: 0,
    nextId: 1,
    botTimer: 0,
    socialTimer: 8,
    uiTimer: 0,
    lbTimer: 0,
    muted: false,
    audio: null,
    lastEatSound: 0,
    lastKillFeed: 0,
    hintTimer: 0,
    shake: 0,
    splitCooldown: 0,
    ejectCooldown: 0,
    deathPos: { x: 0, y: 0 },
    deathZoom: 0.7,
    stats: {
      startTime: 0,
      peakMass: CONFIG.startMass,
      kills: 0,
      foodEaten: 0,
      rank: 1,
    },
    best: Number(readStore(CONFIG.bestKey) || CONFIG.startMass) || CONFIG.startMass,
    killedBy: null,
  };

  if (!Number.isFinite(state.selectedColor)) state.selectedColor = 0;

  // ----------------------------------------------------------------- helpers

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  };
  const radiusOf = (mass) => 4 + Math.sqrt(Math.max(1, mass)) * 3.6;
  const speedOf = (mass) => 640 / Math.pow(Math.max(10, mass), 0.27);

  const esc = (str) =>
    String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const fmtMass = (n) => {
    const v = Math.round(n);
    return v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(v);
  };

  function totalMass(entity) {
    let m = 0;
    for (const c of entity.cells) m += c.mass;
    return m;
  }

  function centerOf(entity) {
    let x = 0;
    let y = 0;
    let m = 0;
    for (const c of entity.cells) {
      x += c.x * c.mass;
      y += c.y * c.mass;
      m += c.mass;
    }
    if (m <= 0) return { x: entity.cells[0] ? entity.cells[0].x : 0, y: entity.cells[0] ? entity.cells[0].y : 0 };
    return { x: x / m, y: y / m };
  }

  function maxRadiusOf(entity) {
    let r = 0;
    for (const c of entity.cells) r = Math.max(r, radiusOf(c.mass));
    return r;
  }

  function randomWorldPoint(margin = 55) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * (CONFIG.worldRadius - margin);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d };
  }

  function insideWorld(x, y, r) {
    const limit = CONFIG.worldRadius - r - 6;
    const d = Math.hypot(x, y);
    if (d <= limit) return { x, y };
    if (d === 0) return { x: 0, y: 0 };
    return { x: (x / d) * limit, y: (y / d) * limit };
  }

  function makeCell(x, y, mass, vx = 0, vy = 0) {
    return {
      x,
      y,
      mass,
      vx,
      vy,
      mergeTimer: 0,
      seed: Math.random() * 100,
      alive: true,
    };
  }

  function findSpawnPoint(radius, forPlayer = false) {
    let best = null;
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 26; attempt++) {
      const p = randomWorldPoint(radius + 70);
      let score = Infinity;
      for (const e of state.entities.values()) {
        for (const c of e.cells) {
          const rr = radiusOf(c.mass);
          const d = Math.hypot(c.x - p.x, c.y - p.y) - rr - radius;
          score = Math.min(score, d);
        }
      }
      if (forPlayer) {
        for (const v of state.viruses) {
          if (v.dead) continue;
          const d = Math.hypot(v.x - p.x, v.y - p.y) - v.r - radius;
          score = Math.min(score, d + 90);
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
      if (score > 260) break;
    }
    return best || randomWorldPoint(radius + 40);
  }

  // ------------------------------------------------------------------- audio

  function ensureAudio() {
    if (!state.audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        state.audio = new AC();
      } catch (e) {
        return;
      }
    }
    if (state.audio.state === "suspended") state.audio.resume().catch(() => {});
  }

  function tone(freq, dur = 0.1, type = "sine", vol = 0.03, slideTo = 0) {
    if (state.muted) return;
    ensureAudio();
    const ac = state.audio;
    if (!ac) return;
    try {
      const t0 = ac.currentTime;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t0 + dur);
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
    } catch (e) {
      /* audio is decorative */
    }
  }

  // ---------------------------------------------------------------- creation

  function makeFood(x, y) {
    const p = x === undefined ? randomWorldPoint(60) : { x, y };
    const mega = Math.random() < 0.07;
    return {
      x: p.x,
      y: p.y,
      mass: mega ? rand(10, 18) : rand(2.2, 4.2),
      r: mega ? rand(6.6, 8.6) : rand(3.6, 5.6),
      color: pick(FOOD_COLORS),
      mega,
      vx: 0,
      vy: 0,
      ejected: false,
      dead: false,
    };
  }

  function spawnFood() {
    state.food.push(makeFood());
  }

  function spawnVirus() {
    const p = findSpawnPoint(52);
    state.viruses.push({
      x: p.x,
      y: p.y,
      r: rand(42, 50),
      rotation: rand(0, 6.28),
      dead: false,
    });
  }

  function pickBotName() {
    const used = new Set();
    for (const e of state.entities.values()) used.add(e.name);
    for (let i = 0; i < 14; i++) {
      const name = pick(BOT_NAMES);
      if (!used.has(name) && name !== (state.player ? state.player.name : "")) return name;
    }
    return `${pick(BOT_NAMES)} ${Math.floor(rand(2, 99))}`;
  }

  function spawnBot(initial = false) {
    const roll = Math.random();
    const mass = roll < 0.6 ? rand(18, 150) : roll < 0.92 ? rand(150, 520) : rand(520, 1400);
    const radius = radiusOf(mass);
    const pos = findSpawnPoint(radius);
    const entity = {
      id: state.nextId++,
      name: pickBotName(),
      color: pick(PALETTE),
      isPlayer: false,
      cells: [makeCell(pos.x, pos.y, mass)],
      target: { x: pos.x, y: pos.y },
      alive: true,
      aiTimer: rand(0.05, 0.6),
      splitCooldown: rand(3, 12),
      wander: rand(0, 6.28),
      kills: 0,
    };
    state.entities.set(entity.id, entity);
    if (!initial && state.mode === "playing" && Math.random() < 0.3) {
      addFeed([
        { text: entity.name, color: entity.color.main, bold: true },
        { text: " joined the arena", color: "#9fb0c9" },
      ]);
    }
    return entity;
  }

  function spawnPlayer() {
    const name = (nameInput.value || "").trim().slice(0, 14) || `Blob ${Math.floor(rand(1, 999))}`;
    const color = PALETTE[state.selectedColor] || PALETTE[0];
    const pos = findSpawnPoint(radiusOf(CONFIG.startMass), true);
    const player = {
      id: state.nextId++,
      name,
      color,
      isPlayer: true,
      cells: [makeCell(pos.x, pos.y, CONFIG.startMass)],
      target: { x: pos.x, y: pos.y },
      alive: true,
      aiTimer: 0,
      splitCooldown: 0,
      wander: 0,
      kills: 0,
    };
    state.entities.set(player.id, player);
    state.player = player;
    state.camera.x = pos.x;
    state.camera.y = pos.y;
    state.camera.zoom = zoomTarget(totalMass(player));
    writeStore(CONFIG.botNames, name);
    return player;
  }

  function buildWorld(withPlayer) {
    state.entities.clear();
    state.food.length = 0;
    state.viruses.length = 0;
    state.particles.length = 0;
    state.floaters.length = 0;
    state.player = null;
    state.nextId = 1;

    for (let i = 0; i < CONFIG.foodCount; i++) spawnFood();
    for (let i = 0; i < CONFIG.virusCount; i++) spawnVirus();
    for (let i = 0; i < CONFIG.botTarget; i++) spawnBot(true);
    if (withPlayer) spawnPlayer();
  }

  // ------------------------------------------------------------------- input

  function pointerWorldTarget() {
    if (state.pointer.touch && !state.pointer.active) return null;
    const zoom = state.camera.zoom || 0.7;
    const dx = state.pointer.x - W / 2;
    const dy = state.pointer.y - H / 2;
    return {
      x: state.camera.x + dx / zoom,
      y: state.camera.y + dy / zoom,
    };
  }

  function playerAimPoint() {
    if (!state.player || !state.player.alive) return null;
    return pointerWorldTarget() || centerOf(state.player);
  }

  function splitPlayer() {
    if (state.mode !== "playing" || !state.player || !state.player.alive) return;
    if (state.splitCooldown > 0) return;
    const aim = playerAimPoint();
    if (splitEntity(state.player, aim, Infinity)) {
      state.splitCooldown = 0.24;
      tone(430, 0.14, "square", 0.022, 200);
    }
  }

  function ejectMass() {
    if (state.mode !== "playing" || !state.player || !state.player.alive) return;
    if (state.ejectCooldown > 0) return;
    const aim = playerAimPoint() || centerOf(state.player);
    let did = false;

    for (const c of state.player.cells) {
      if (c.mass < 48) continue;
      const r = radiusOf(c.mass);
      const dx = aim.x - c.x;
      const dy = aim.y - c.y;
      const d = Math.hypot(dx, dy);
      const nx = d > 1 ? dx / d : 1;
      const ny = d > 1 ? dy / d : 0;
      c.mass -= 16;
      state.food.push({
        x: c.x + nx * (r + 8),
        y: c.y + ny * (r + 8),
        mass: 11,
        r: 7.5,
        color: state.player.color.main,
        vx: nx * 920 + (Math.random() - 0.5) * 60,
        vy: ny * 920 + (Math.random() - 0.5) * 60,
        ejected: true,
        ownerId: state.player.id,
        spawnTime: state.time,
        dead: false,
      });
      did = true;
    }

    if (did) {
      state.ejectCooldown = 0.14;
      tone(300, 0.07, "triangle", 0.012, 220);
    }
  }

  function splitEntity(entity, aim, maxSplits = Infinity) {
    let slots = CONFIG.maxCells - entity.cells.length;
    if (slots <= 0) return false;

    const source = entity.cells
      .filter((c) => c.mass >= 36)
      .sort((a, b) => b.mass - a.mass);
    let splits = 0;

    for (const cell of source) {
      if (slots <= 0 || splits >= maxSplits) break;
      const half = cell.mass / 2;
      if (half < 18) continue;
      let dx = aim ? aim.x - cell.x : 1;
      let dy = aim ? aim.y - cell.y : 0;
      let d = Math.hypot(dx, dy);
      if (d < 1) {
        dx = cell.vx;
        dy = cell.vy;
        d = Math.hypot(dx, dy);
      }
      if (d < 1) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const nx = dx / d;
      const ny = dy / d;
      cell.mass = half;
      const piece = makeCell(
        cell.x + nx * 2,
        cell.y + ny * 2,
        half,
        nx * 720,
        ny * 720
      );
      const merge = Math.min(22, 9 + half * 0.025);
      cell.mergeTimer = Math.max(cell.mergeTimer, merge);
      piece.mergeTimer = merge;
      entity.cells.push(piece);
      burst(cell.x + nx * radiusOf(half) * 0.6, cell.y + ny * radiusOf(half) * 0.6, entity.color.main, 5, 120);
      slots--;
      splits++;
    }
    return splits > 0;
  }

  window.addEventListener("pointermove", (e) => {
    state.pointer.x = e.clientX;
    state.pointer.y = e.clientY;
    if (e.pointerType === "touch") {
      state.pointer.touch = true;
    } else {
      state.pointer.touch = false;
      state.pointer.active = false;
    }
  });

  window.addEventListener("pointerdown", (e) => {
    if (e.target && e.target.closest && e.target.closest(".touch-controls, .mute-btn, .overlay")) return;
    state.pointer.x = e.clientX;
    state.pointer.y = e.clientY;
    if (e.pointerType === "touch") {
      state.pointer.touch = true;
      state.pointer.active = true;
    }
    ensureAudio();
  });

  window.addEventListener("pointerup", (e) => {
    if (e.pointerType === "touch") state.pointer.active = false;
  });

  window.addEventListener("pointercancel", (e) => {
    if (e.pointerType === "touch") state.pointer.active = false;
  });

  window.addEventListener("keydown", (e) => {
    const tag = document.activeElement ? document.activeElement.tagName : "";
    if (tag === "INPUT") {
      if (e.key === "Escape" && document.activeElement) document.activeElement.blur();
      return;
    }
    if (e.code === "Space") {
      if (state.mode === "playing") {
        e.preventDefault();
        splitPlayer();
      }
    } else if (e.key === "w" || e.key === "W") {
      ejectMass();
    } else if (e.key === "Escape") {
      if (state.mode === "playing" || state.mode === "paused") togglePause();
    }
  });

  window.addEventListener("contextmenu", (e) => e.preventDefault());

  // ------------------------------------------------------------------ update

  function zoomTarget(mass) {
    const base = W < 720 ? Math.min(W, H) * 1.9 : Math.min(W, H);
    const minZoom = W < 720 ? 0.42 : 0.32;
    return clamp(base / (900 + 42 * Math.sqrt(Math.max(20, mass))), minZoom, 1.3);
  }

  function updateCamera(dt) {
    let tx = state.camera.x;
    let ty = state.camera.y;
    let tz = state.camera.zoom;

    if (state.mode === "menu") {
      const a = state.time * 0.055;
      tx = Math.cos(a) * 1150;
      ty = Math.sin(a * 0.77) * 780;
      tz = W < 720 ? 0.42 : 0.34;
    } else if (state.player && state.player.alive) {
      const c = centerOf(state.player);
      tx = c.x;
      ty = c.y;
      tz = zoomTarget(totalMass(state.player));
    } else {
      tx = state.deathPos.x;
      ty = state.deathPos.y;
      tz = state.deathZoom;
    }

    const follow = state.mode === "playing" ? 8 : 1.6;
    const k = 1 - Math.exp(-dt * follow);
    state.camera.x += (tx - state.camera.x) * k;
    state.camera.y += (ty - state.camera.y) * k;
    const zk = 1 - Math.exp(-dt * (state.mode === "playing" ? 3.4 : 1.2));
    state.camera.zoom += (tz - state.camera.zoom) * zk;
  }

  function updateEntityTargets(dt) {
    for (const entity of state.entities.values()) {
      if (!entity.alive || entity.cells.length === 0) continue;
      if (entity.isPlayer) {
        const aim = playerAimPoint();
        if (aim) entity.target = aim;
      } else {
        entity.aiTimer -= dt;
        if (entity.aiTimer <= 0) {
          entity.aiTimer = rand(0.16, 0.46);
          updateBotAI(entity);
        }
      }
    }
  }

  function updateBotAI(bot) {
    const center = centerOf(bot);
    const myRadius = maxRadiusOf(bot);
    const myMass = totalMass(bot);

    let threat = null;
    let threatD = Infinity;
    let prey = null;
    let preyD = Infinity;
    let virusThreat = null;
    let virusD = Infinity;

    for (const other of state.entities.values()) {
      if (!other.alive || other === bot || other.cells.length === 0) continue;
      const oc = centerOf(other);
      const d = Math.hypot(oc.x - center.x, oc.y - center.y);
      if (d > 1150) continue;

      // Give new players a short grace period.
      if (other.isPlayer && state.time - state.stats.startTime < 7) continue;

      const otherRadius = maxRadiusOf(other);
      if (otherRadius > myRadius * 1.16 && d < 800 && d < threatD) {
        threat = oc;
        threatD = d;
      } else if (otherRadius < myRadius * 0.86 && d < 1000 && d < preyD) {
        prey = oc;
        preyD = d;
      }
    }

    if (myMass > 140) {
      for (const v of state.viruses) {
        if (v.dead) continue;
        const d = Math.hypot(v.x - center.x, v.y - center.y) - v.r - myRadius;
        if (d < 90 && d < virusD) {
          virusThreat = v;
          virusD = d;
        }
      }
    }

    // Avoid getting cornered at the arena edge.
    const fromCenter = Math.hypot(center.x, center.y);
    if (fromCenter > CONFIG.worldRadius - 330) {
      const nx = center.x / (fromCenter || 1);
      const ny = center.y / (fromCenter || 1);
      bot.target = { x: center.x - nx * 800, y: center.y - ny * 800 };
      return;
    }

    if (threat) {
      const dx = center.x - threat.x;
      const dy = center.y - threat.y;
      const d = Math.hypot(dx, dy) || 1;
      bot.target = { x: center.x + (dx / d) * 900, y: center.y + (dy / d) * 900 };
      return;
    }

    if (virusThreat) {
      const dx = center.x - virusThreat.x;
      const dy = center.y - virusThreat.y;
      const d = Math.hypot(dx, dy) || 1;
      bot.target = { x: center.x + (dx / d) * 500, y: center.y + (dy / d) * 500 };
      return;
    }

    if (prey) {
      bot.target = prey;
      if (
        myMass > 220 &&
        preyD < 430 &&
        bot.splitCooldown <= 0 &&
        Math.random() < 0.5
      ) {
        if (splitEntity(bot, prey, 1)) {
          bot.splitCooldown = rand(8, 16);
        } else {
          bot.splitCooldown = rand(2, 4);
        }
      }
      return;
    }

    // Hunt the closest food.
    let best = null;
    let bestD = Infinity;
    for (const f of state.food) {
      if (f.dead) continue;
      const d = dist2(f.x, f.y, center.x, center.y);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }

    if (best && bestD < 1400 * 1400) {
      bot.target = { x: best.x, y: best.y };
    } else {
      if (Math.random() < 0.25) bot.wander = rand(0, Math.PI * 2);
      const wx = center.x + Math.cos(bot.wander) * 420;
      const wy = center.y + Math.sin(bot.wander) * 420;
      bot.target = { x: wx, y: wy };
    }
  }

  function updateEntities(dt) {
    for (const entity of state.entities.values()) {
      if (!entity.alive) continue;
      entity.splitCooldown = Math.max(0, entity.splitCooldown - dt);
      const target = entity.target;

      for (const cell of entity.cells) {
        if (!cell.alive) continue;

        cell.mergeTimer = Math.max(0, cell.mergeTimer - dt);

        if (cell.mass > 260) cell.mass -= cell.mass * 0.0007 * dt;

        const r = radiusOf(cell.mass);
        let dx = target.x - cell.x;
        let dy = target.y - cell.y;
        const d = Math.hypot(dx, dy);
        const sp = speedOf(cell.mass) * (entity.isPlayer ? 1 : 0.93);
        let desiredX = 0;
        let desiredY = 0;

        if (d > 1) {
          const slow = Math.min(1, d / Math.max(14, r * 1.6));
          desiredX = (dx / d) * sp * slow;
          desiredY = (dy / d) * sp * slow;
        }

        const accel = cell.mergeTimer > 0 ? 4.5 : 10;
        const blend = Math.min(1, accel * dt);
        cell.vx += (desiredX - cell.vx) * blend;
        cell.vy += (desiredY - cell.vy) * blend;

        cell.x += cell.vx * dt;
        cell.y += cell.vy * dt;

        const bounded = insideWorld(cell.x, cell.y, r * 0.72);
        if (bounded.x !== cell.x || bounded.y !== cell.y) {
          cell.x = bounded.x;
          cell.y = bounded.y;
          cell.vx *= 0.6;
          cell.vy *= 0.6;
        }
      }

      resolveOwnCells(entity);
    }
  }

  function resolveOwnCells(entity) {
    const cells = entity.cells;
    for (let i = 0; i < cells.length; i++) {
      const a = cells[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cells.length; j++) {
        const b = cells[j];
        if (!b.alive) continue;
        const ra = radiusOf(a.mass);
        const rb = radiusOf(b.mass);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;

        if (a.mergeTimer <= 0 && b.mergeTimer <= 0) {
          if (d < Math.max(ra, rb) * 0.82) {
            const big = ra >= rb ? a : b;
            const small = ra >= rb ? b : a;
            big.mass += small.mass;
            small.alive = false;
            burst(small.x, small.y, entity.color.main, 4, 60);
          } else if (d < ra + rb) {
            const pull = 26 * (1 - d / (ra + rb));
            a.x -= (dx / d) * pull * 0.5;
            a.y -= (dy / d) * pull * 0.5;
            b.x += (dx / d) * pull * 0.5;
            b.y += (dy / d) * pull * 0.5;
          }
        } else if (d < ra + rb) {
          const push = (ra + rb - d) * 0.22;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
        }
      }
    }
    entity.cells = cells.filter((c) => c.alive);
  }

  function resolveCellEating() {
    const all = [];
    for (const entity of state.entities.values()) {
      if (!entity.alive) continue;
      for (const cell of entity.cells) {
        if (cell.alive) all.push({ cell, entity });
      }
    }

    for (let i = 0; i < all.length; i++) {
      const A = all[i];
      if (!A.cell.alive || !A.entity.alive) continue;
      let ra = radiusOf(A.cell.mass);
      for (let j = i + 1; j < all.length; j++) {
        const B = all[j];
        if (!A.cell.alive) break;
        if (!B.cell.alive || !B.entity.alive || B.entity === A.entity) continue;
        const rb = radiusOf(B.cell.mass);
        if (ra <= rb * 1.15 && rb <= ra * 1.15) continue;

        const d = Math.hypot(A.cell.x - B.cell.x, A.cell.y - B.cell.y);
        const bigFirst = ra > rb;
        const bigR = bigFirst ? ra : rb;
        const smallR = bigFirst ? rb : ra;
        if (d > bigR - smallR * 0.3) continue;

        const big = bigFirst ? A : B;
        const small = bigFirst ? B : A;
        if (!big.cell.alive || !small.cell.alive) continue;

        big.cell.mass += small.cell.mass;
        small.cell.alive = false;
        small.entity.lastEatenBy = big.entity;

        const px = small.cell.x;
        const py = small.cell.y;
        burst(px, py, small.entity.color.main, 10, 170);

        if (big.entity.isPlayer) {
          addFloater(px, py, `+${fmtMass(small.cell.mass)}`, big.entity.color.main);
          tone(190, 0.16, "triangle", 0.035, 110);
        }
        if (small.entity.isPlayer) {
          state.shake = Math.max(state.shake, 0.7);
          tone(120, 0.2, "sawtooth", 0.03, 60);
        }
        ra = radiusOf(A.cell.mass);
      }
    }

    for (const entity of state.entities.values()) {
      if (!entity.alive) continue;
      const before = entity.cells.length;
      entity.cells = entity.cells.filter((c) => c.alive);
      if (before > 0 && entity.cells.length === 0) {
        killEntity(entity);
      }
    }
  }

  function killEntity(entity) {
    if (!entity.alive) return;
    entity.alive = false;

    if (entity.isPlayer) {
      state.deathPos = { x: state.camera.x, y: state.camera.y };
      state.deathZoom = state.camera.zoom;
      state.killedBy = entity.lastEatenBy ? entity.lastEatenBy.name : null;
      state.stats.rank = getPlayerRank();
      endGame();
      state.entities.delete(entity.id);
      return;
    }

    const killer = entity.lastEatenBy;
    if (killer && killer.alive) killer.kills++;
    if (killer && killer.isPlayer) state.stats.kills++;

    const center = centerOf(entity);
    burst(center.x, center.y, entity.color.main, 18, 240);

    for (let i = 0; i < 5; i++) {
      state.food.push({
        x: center.x + rand(-40, 40),
        y: center.y + rand(-40, 40),
        mass: rand(2, 4),
        r: rand(4.5, 6.5),
        color: entity.color.main,
        vx: rand(-80, 80),
        vy: rand(-80, 80),
        ejected: true,
        spawnTime: state.time,
        dead: false,
      });
    }

    if (killer) {
      addKillFeed(killer, entity);
    }

    state.entities.delete(entity.id);
  }

  function getPlayerRank() {
    if (!state.player || !state.player.alive) return state.stats.rank;
    const pm = totalMass(state.player);
    let rank = 1;
    for (const e of state.entities.values()) {
      if (e === state.player || !e.alive) continue;
      if (totalMass(e) > pm) rank++;
    }
    return rank;
  }

  function resolveFood() {
    for (const entity of state.entities.values()) {
      if (!entity.alive) continue;
      for (const cell of entity.cells) {
        if (!cell.alive) continue;
        const r = radiusOf(cell.mass);
        for (let i = 0; i < state.food.length; i++) {
          const f = state.food[i];
          if (f.dead) continue;
          if (f.ejected && f.ownerId === entity.id && state.time - f.spawnTime < 1.4) continue;
          const rr = r + f.r * 0.55;
          if (Math.abs(f.x - cell.x) > rr || Math.abs(f.y - cell.y) > rr) continue;
          if (dist2(f.x, f.y, cell.x, cell.y) > rr * rr) continue;
          f.dead = true;
          cell.mass += f.mass;
          if (entity.isPlayer) {
            state.stats.foodEaten++;
            if (state.time - state.lastEatSound > 0.075) {
              state.lastEatSound = state.time;
              tone(420 + Math.random() * 80, 0.045, "sine", 0.009, 560);
            }
          }
          if (Math.random() < 0.2) burst(f.x, f.y, f.color, 2, 45);
        }
      }
    }

    // Clean up eaten food.
    for (let i = state.food.length - 1; i >= 0; i--) {
      if (state.food[i].dead) {
        state.food[i] = state.food[state.food.length - 1];
        state.food.pop();
      }
    }
  }

  function resolveViruses() {
    for (const virus of state.viruses) {
      if (virus.dead) continue;
      for (const entity of state.entities.values()) {
        if (!entity.alive) continue;
        for (const cell of entity.cells) {
          if (!cell.alive || cell.mass < 140) continue;
          const r = radiusOf(cell.mass);
          if (Math.hypot(cell.x - virus.x, cell.y - virus.y) > r - virus.r * 0.25) continue;

          virus.dead = true;
          burst(virus.x, virus.y, "#2fc98d", 18, 220);
          if (entity.isPlayer) {
            state.shake = Math.max(state.shake, 0.45);
            addFloater(virus.x, virus.y, "POP!", "#1fa86f");
            tone(95, 0.28, "sawtooth", 0.03, 45);
          }
          popCell(cell, entity);
          break;
        }
        if (virus.dead) break;
      }
    }

    for (let i = state.viruses.length - 1; i >= 0; i--) {
      if (state.viruses[i].dead) {
        state.viruses.splice(i, 1);
        spawnVirus();
      }
    }
  }

  function popCell(cell, entity) {
    const slots = CONFIG.maxCells - entity.cells.length;
    cell.mass += 55;
    if (slots <= 0) return;

    const pieces = Math.min(slots, Math.min(7, 2 + Math.floor(cell.mass / 110)));
    const share = cell.mass / (pieces + 1);
    if (share < 18) return;

    cell.mass = share;
    cell.mergeTimer = Math.max(cell.mergeTimer, 8);
    for (let i = 0; i < pieces; i++) {
      const a = (i / pieces) * Math.PI * 2 + rand(-0.25, 0.25);
      const piece = makeCell(
        cell.x,
        cell.y,
        share,
        Math.cos(a) * rand(420, 700),
        Math.sin(a) * rand(420, 700)
      );
      piece.mergeTimer = Math.min(20, 9 + share * 0.02);
      entity.cells.push(piece);
    }
  }

  function updateFood(dt) {
    for (const f of state.food) {
      if (!f.vx && !f.vy) continue;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      const decay = Math.exp(-dt * 2.6);
      f.vx *= decay;
      f.vy *= decay;
      if (Math.abs(f.vx) < 4) f.vx = 0;
      if (Math.abs(f.vy) < 4) f.vy = 0;
      const bounded = insideWorld(f.x, f.y, f.r);
      if (bounded.x !== f.x || bounded.y !== f.y) {
        f.x = bounded.x;
        f.y = bounded.y;
        f.vx = 0;
        f.vy = 0;
      }
    }

    // Ejected mass fades away so long sessions don't accumulate thousands of pellets.
    for (let i = state.food.length - 1; i >= 0; i--) {
      const f = state.food[i];
      if (!f.ejected) continue;
      if (state.time - (f.spawnTime || 0) < 26) continue;
      state.food[i] = state.food[state.food.length - 1];
      state.food.pop();
    }

    // Keep the arena stocked with food.
    let count = 0;
    for (const f of state.food) if (!f.ejected) count++;
    let guard = 0;
    while (count < CONFIG.foodCount && guard++ < 20) {
      spawnFood();
      count++;
    }
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const decay = Math.exp(-dt * 2.6);
      p.vx *= decay;
      p.vy *= decay;
    }

    for (let i = state.floaters.length - 1; i >= 0; i--) {
      const f = state.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        state.floaters.splice(i, 1);
        continue;
      }
      f.y -= 26 * dt;
    }
  }

  function burst(x, y, color, count, power) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = rand(power * 0.25, power);
      const life = rand(0.35, 0.8);
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: rand(2, 5.5),
        color,
        life,
        maxLife: life,
      });
    }
  }

  function addFloater(x, y, text, color) {
    state.floaters.push({ x, y, text, color, life: 1.05, maxLife: 1.05 });
  }

  function maintainBots(dt) {
    let bots = 0;
    for (const e of state.entities.values()) if (!e.isPlayer && e.alive) bots++;
    state.botTimer -= dt;
    if (bots < CONFIG.botTarget && state.botTimer <= 0) {
      spawnBot(false);
      state.botTimer = rand(0.4, 1.4);
    }
  }

  function update(dt) {
    state.time += dt;
    state.splitCooldown = Math.max(0, state.splitCooldown - dt);
    state.ejectCooldown = Math.max(0, state.ejectCooldown - dt);
    state.shake = Math.max(0, state.shake - dt * 2.4);

    updateEntityTargets(dt);
    updateEntities(dt);
    resolveCellEating();
    resolveFood();
    resolveViruses();
    updateFood(dt);
    updateParticles(dt);
    maintainBots(dt);
    updateCamera(dt);

    if (state.mode === "playing" && state.player && state.player.alive) {
      const mass = totalMass(state.player);
      if (mass > state.stats.peakMass) state.stats.peakMass = mass;
      state.hintTimer += dt;
      if (state.hintTimer > 12) hintEl.classList.add("fade");
    }

    updateSocial(dt);
    updateHud(dt);
  }

  // --------------------------------------------------------------- UI update

  function updateHud(dt) {
    state.uiTimer -= dt;
    if (state.uiTimer <= 0) {
      state.uiTimer = 0.1;
      if (state.player && state.player.alive) {
        const mass = totalMass(state.player);
        massEl.textContent = fmtMass(mass);
        killsEl.textContent = String(state.stats.kills);
        const best = Math.max(state.best, state.stats.peakMass, Math.round(mass));
        bestEl.textContent = fmtMass(best);
      }
    }

    state.lbTimer -= dt;
    if (state.lbTimer <= 0) {
      state.lbTimer = 0.32;
      renderLeaderboard();
    }
  }

  function renderLeaderboard() {
    const list = [];
    for (const e of state.entities.values()) {
      if (!e.alive || e.cells.length === 0) continue;
      list.push({ e, mass: totalMass(e) });
    }
    list.sort((a, b) => b.mass - a.mass);

    const playerIdx = list.findIndex((x) => x.e.isPlayer);
    if (playerIdx >= 0) {
      state.stats.rank = playerIdx + 1;
      playerRankEl.textContent = `#${playerIdx + 1}`;
    } else if (state.mode === "dead") {
      playerRankEl.textContent = `#${state.stats.rank}`;
    } else {
      playerRankEl.textContent = "";
    }

    let html = "";
    const top = list.slice(0, 10);
    top.forEach((row, i) => {
      html += lbRow(row.e, i + 1, row.mass);
    });

    if (playerIdx >= 10) {
      html += '<li class="lb-sep"></li>';
      html += lbRow(list[playerIdx].e, playerIdx + 1, list[playerIdx].mass);
    }

    lbListEl.innerHTML = html;
  }

  function lbRow(entity, rank, mass) {
    const me = entity.isPlayer ? " class=\"me\"" : "";
    return `<li${me}><span class="lb-num">${rank}</span><span class="lb-dot" style="--dot:${entity.color.main}"></span><span class="lb-name">${esc(
      entity.name
    )}</span><span class="lb-mass">${fmtMass(mass)}</span></li>`;
  }

  function addFeed(parts) {
    if (state.mode === "menu") return;
    const line = document.createElement("div");
    line.className = "feed-line";
    for (const part of parts) {
      const span = document.createElement("span");
      span.textContent = part.text;
      if (part.color) span.style.color = part.color;
      if (part.bold) span.style.fontWeight = "900";
      line.appendChild(span);
    }
    feedEl.appendChild(line);
    while (feedEl.children.length > 5) feedEl.removeChild(feedEl.firstElementChild);
    setTimeout(() => {
      line.classList.add("fade");
      setTimeout(() => line.remove(), 420);
    }, 6200);
  }

  function addKillFeed(killer, victim) {
    if (victim.isPlayer) {
      addFeed([{ text: "You were eaten by ", color: "#ffc2ce" }, { text: killer.name, color: killer.color.light, bold: true }]);
      return;
    }
    if (killer.isPlayer) {
      addFeed([{ text: "You ate ", color: "#b8f5d9" }, { text: victim.name, color: victim.color.light, bold: true }]);
      return;
    }
    if (state.time - state.lastKillFeed < 1.4) return;
    state.lastKillFeed = state.time;
    addFeed([
      { text: killer.name, color: killer.color.light, bold: true },
      { text: " ate ", color: "#c7d4e8" },
      { text: victim.name, color: victim.color.light, bold: true },
    ]);
  }

  function updateSocial(dt) {
    if (state.mode !== "playing" && state.mode !== "dead") return;
    state.socialTimer -= dt;
    if (state.socialTimer > 0) return;
    state.socialTimer = rand(10, 19);
    const roll = Math.random();
    const name = pick(BOT_NAMES);
    if (roll < 0.5) {
      addFeed([{ text: name, color: pick(PALETTE).main, bold: true }, { text: " joined the arena", color: "#c7d4e8" }]);
    } else if (roll < 0.82) {
      addFeed([{ text: name, color: pick(PALETTE).main, bold: true }, { text: " left the arena", color: "#c7d4e8" }]);
    } else {
      addFeed([{ text: "Tip: ", color: "#ffd79a", bold: true }, { text: pick(TIPS), color: "#e9effb" }]);
    }
  }

  const TIPS = [
    "Split with Space to catch fast prey.",
    "Eject mass with W to feed friends — or bait enemies.",
    "Green viruses pop any blob bigger than 100 mass.",
    "Bigger blobs move slower. Use that to escape.",
    "Stay near the edge? You may get cornered.",
    "You can split up to 16 times, then merge back.",
  ];

  // ------------------------------------------------------------------ camera

  function endGame() {
    if (state.mode !== "playing") return;
    state.mode = "dead";
    app.dataset.mode = "dead";
    state.shake = 1.15;
    state.best = Math.max(state.best, state.stats.peakMass);
    writeStore(CONFIG.bestKey, String(Math.round(state.best)));
    tone(220, 0.55, "sawtooth", 0.045, 55);

    $("dead-sub").textContent = state.killedBy
      ? `${state.killedBy} got the better of you.`
      : "A bigger blob got the better of you.";
    $("stat-mass").textContent = fmtMass(state.stats.peakMass);
    $("stat-rank").textContent = `#${state.stats.rank}`;
    $("stat-time").textContent = formatTime(state.time - state.stats.startTime);
    $("stat-kills").textContent = String(state.stats.kills);

    hintEl.classList.add("fade");
    deadEl.classList.remove("is-hidden");
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  }

  function startGame() {
    ensureAudio();
    menuEl.classList.add("is-hidden");
    deadEl.classList.add("is-hidden");
    pauseEl.classList.add("is-hidden");
    app.dataset.mode = "playing";
    state.mode = "playing";
    state.killedBy = null;
    state.stats = {
      startTime: state.time,
      peakMass: CONFIG.startMass,
      kills: 0,
      foodEaten: 0,
      rank: 1,
    };
    state.hintTimer = 0;
    state.splitCooldown = 0;
    state.ejectCooldown = 0;
    feedEl.innerHTML = "";
    hintEl.classList.remove("fade");

    buildWorld(true);
    state.camera.zoom = zoomTarget(totalMass(state.player));
    tone(520, 0.16, "sine", 0.03, 780);
    setTimeout(() => tone(720, 0.18, "sine", 0.025, 980), 90);

    if (document.activeElement) document.activeElement.blur();
  }

  function goToMenu() {
    state.mode = "menu";
    app.dataset.mode = "menu";
    menuEl.classList.remove("is-hidden");
    deadEl.classList.add("is-hidden");
    pauseEl.classList.add("is-hidden");
    feedEl.innerHTML = "";
    hintEl.classList.add("fade");
    state.best = Math.max(state.best, state.stats.peakMass);
    writeStore(CONFIG.bestKey, String(Math.round(state.best)));
    state.player = null;
    buildWorld(false);
    state.camera.x = 0;
    state.camera.y = 0;
    state.camera.zoom = W < 720 ? 0.42 : 0.34;
    renderLeaderboard();
  }

  function togglePause() {
    if (state.mode === "playing") {
      state.mode = "paused";
      app.dataset.mode = "paused";
      pauseEl.classList.remove("is-hidden");
    } else if (state.mode === "paused") {
      state.mode = "playing";
      app.dataset.mode = "playing";
      pauseEl.classList.add("is-hidden");
      state.lastFrame = performance.now();
    }
  }

  // ------------------------------------------------------------------ render

  function drawArena(t) {
    const R = CONFIG.worldRadius;

    const gradient = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
    gradient.addColorStop(0, "#fbfdff");
    gradient.addColorStop(0.65, "#f4f9ff");
    gradient.addColorStop(1, "#e9f2fc");
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.clip();

    const halfW = W / (2 * state.camera.zoom);
    const halfH = H / (2 * state.camera.zoom);
    const x0 = state.camera.x - halfW - 80;
    const x1 = state.camera.x + halfW + 80;
    const y0 = state.camera.y - halfH - 80;
    const y1 = state.camera.y + halfH + 80;

    const step = 62;
    ctx.lineWidth = 1 / state.camera.zoom;
    const startX = Math.floor(x0 / step) * step;
    const startY = Math.floor(y0 / step) * step;

    for (let x = startX; x <= x1; x += step) {
      const major = Math.round(x / step) % 5 === 0;
      ctx.strokeStyle = major ? "rgba(118,148,188,0.16)" : "rgba(118,148,188,0.09)";
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
    for (let y = startY; y <= y1; y += step) {
      const major = Math.round(y / step) % 5 === 0;
      ctx.strokeStyle = major ? "rgba(118,148,188,0.16)" : "rgba(118,148,188,0.09)";
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
    }

    // A soft center marker.
    ctx.beginPath();
    ctx.arc(0, 0, 3 / state.camera.zoom, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(118,148,188,0.2)";
    ctx.fill();
    ctx.restore();

    // Rim.
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.lineWidth = 16;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#d3e2f4";
    ctx.stroke();
  }

  function drawFood() {
    const zoom = state.camera.zoom;
    const halfW = W / (2 * zoom) + 40;
    const halfH = H / (2 * zoom) + 40;
    const cx = state.camera.x;
    const cy = state.camera.y;

    // Group plain pellets by color so they can be drawn with a handful of
    // batched paths instead of thousands of individual fills.
    const buckets = new Map();
    const megas = [];
    const ejected = [];

    for (const f of state.food) {
      if (Math.abs(f.x - cx) > halfW || Math.abs(f.y - cy) > halfH) continue;
      if (f.ejected) {
        ejected.push(f);
        continue;
      }
      if (f.mega) {
        megas.push(f);
        continue;
      }
      let list = buckets.get(f.color);
      if (!list) {
        list = [];
        buckets.set(f.color, list);
      }
      list.push(f);
    }

    // Soft glow behind the plain pellets.
    const lod = zoom < 0.45;
    if (!lod) {
      ctx.globalAlpha = 0.13;
      for (const [color, list] of buckets) {
        ctx.beginPath();
        for (const f of list) {
          ctx.moveTo(f.x + f.r * 1.9, f.y);
          ctx.arc(f.x, f.y, f.r * 1.9, 0, Math.PI * 2);
        }
        ctx.fillStyle = color;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // Pellet cores, one path per color. When zoomed far out, tiny dots are
    // drawn as squares to avoid thousands of anti-aliased arcs.
    for (const [color, list] of buckets) {
      ctx.beginPath();
      if (lod) {
        for (const f of list) {
          const s = Math.max(1.4, f.r * 2 * zoom) / zoom;
          ctx.rect(f.x - s / 2, f.y - s / 2, s, s);
        }
      } else {
        for (const f of list) {
          ctx.moveTo(f.x + f.r, f.y);
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Shared highlights.
    if (!lod) {
      ctx.beginPath();
      for (const list of buckets.values()) {
        for (const f of list) {
          const hx = f.x - f.r * 0.25;
          const hy = f.y - f.r * 0.3;
          const hr = f.r * 0.28;
          ctx.moveTo(hx + hr, hy);
          ctx.arc(hx, hy, hr, 0, Math.PI * 2);
        }
      }
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fill();
    }

    for (const f of megas) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2.4, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = 0.16;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r + 2.2, 0, Math.PI * 2);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x - f.r * 0.25, f.y - f.r * 0.3, f.r * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fill();
    }

    for (const f of ejected) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = f.color;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(f.x - f.r * 0.25, f.y - f.r * 0.28, f.r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();
    }
  }

  function drawViruses(t) {
    const halfW = W / (2 * state.camera.zoom) + 90;
    const halfH = H / (2 * state.camera.zoom) + 90;
    const cx = state.camera.x;
    const cy = state.camera.y;

    for (const v of state.viruses) {
      if (Math.abs(v.x - cx) > halfW || Math.abs(v.y - cy) > halfH) continue;
      const spikes = 18;
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.rotation + t * 0.18);
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? v.r : v.r * 0.82;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.shadowColor = "rgba(31, 201, 138, 0.45)";
      ctx.shadowBlur = 24 / state.camera.zoom;
      const grad = ctx.createRadialGradient(-v.r * 0.3, -v.r * 0.3, v.r * 0.1, 0, 0, v.r);
      grad.addColorStop(0, "#bdf7df");
      grad.addColorStop(0.45, "#41d99f");
      grad.addColorStop(1, "#13a471");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(9, 110, 74, 0.55)";
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, v.r * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCells(t) {
    const halfW = W / (2 * state.camera.zoom) + 120;
    const halfH = H / (2 * state.camera.zoom) + 120;
    const cx = state.camera.x;
    const cy = state.camera.y;

    const list = [];
    for (const entity of state.entities.values()) {
      if (!entity.alive) continue;
      for (const cell of entity.cells) {
        if (!cell.alive) continue;
        if (Math.abs(cell.x - cx) > halfW + radiusOf(cell.mass)) continue;
        if (Math.abs(cell.y - cy) > halfH + radiusOf(cell.mass)) continue;
        list.push({ cell, entity });
      }
    }
    list.sort((a, b) => a.cell.mass - b.cell.mass);

    for (const item of list) drawCell(item.cell, item.entity, t);
  }

  function blobPath(cx, cy, r, seed, t) {
    const points = r * state.camera.zoom > 22 ? 26 : 18;
    const wobble = 0.016 + Math.min(0.03, r / 5000);
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const a = (i / points) * Math.PI * 2;
      const rr =
        r *
        (1 +
          Math.sin(a * 3 + t * 1.5 + seed) * wobble +
          Math.sin(a * 5 - t * 1.15 + seed * 1.7) * wobble * 0.55);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  const cellGradients = new Map();

  function cellGradient(color, r) {
    const bucket = Math.max(6, Math.round(r / 6) * 6);
    const key = `${color.main}|${bucket}`;
    let grad = cellGradients.get(key);
    if (!grad) {
      grad = ctx.createRadialGradient(-bucket * 0.34, -bucket * 0.4, bucket * 0.08, 0, 0, bucket * 1.08);
      grad.addColorStop(0, color.light);
      grad.addColorStop(0.5, color.main);
      grad.addColorStop(1, color.dark);
      cellGradients.set(key, grad);
    }
    return grad;
  }

  function drawCell(cell, entity, t) {
    const r = radiusOf(cell.mass);
    const color = entity.color;

    ctx.save();
    ctx.translate(cell.x, cell.y);

    if (entity.isPlayer && state.camera.zoom > 0.4 && entity.cells.length <= 6) {
      ctx.shadowColor = color.main;
      ctx.shadowBlur = Math.min(18, 13 / state.camera.zoom);
    }

    blobPath(0, 0, r, cell.seed, t);
    ctx.fillStyle = cellGradient(color, r);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.lineWidth = Math.max(1.5, 2.6 / state.camera.zoom);
    ctx.strokeStyle = "rgba(20, 33, 61, 0.18)";
    ctx.stroke();

    // glossy highlight
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.42, r * 0.3, r * 0.17, -0.55, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();

    const screenR = r * state.camera.zoom;

    // Cute little eyes.
    if (screenR > 11) {
      const eyeR = r * 0.155;
      const eyeX = r * 0.29;
      const eyeY = -r * 0.16;
      let lookX = 0;
      let lookY = 0;
      const tx = entity.target ? entity.target.x - cell.x : 1;
      const ty = entity.target ? entity.target.y - cell.y : 0;
      const td = Math.hypot(tx, ty);
      if (td > 1) {
        lookX = (tx / td) * eyeR * 0.34;
        lookY = (ty / td) * eyeR * 0.34;
      }
      const blink = Math.sin(t * 1.2 + cell.seed * 2.3) > 0.986;

      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sign * eyeX, eyeY, eyeR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.94)";
        ctx.fill();

        if (blink) {
          ctx.beginPath();
          ctx.moveTo(sign * eyeX - eyeR * 0.7, eyeY);
          ctx.lineTo(sign * eyeX + eyeR * 0.7, eyeY);
          ctx.lineWidth = eyeR * 0.32;
          ctx.strokeStyle = "rgba(30, 41, 59, 0.85)";
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(sign * eyeX + lookX, eyeY + lookY, eyeR * 0.52, 0, Math.PI * 2);
          ctx.fillStyle = "#25314a";
          ctx.fill();
          ctx.beginPath();
          ctx.arc(sign * eyeX + lookX - eyeR * 0.16, eyeY + lookY - eyeR * 0.18, eyeR * 0.16, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fill();
        }
      }
    }

    // Name and mass.
    if (screenR > 13) {
      const size = clamp(screenR * 0.24, 8.5, 27);
      const fs = size / state.camera.zoom;
      const nameY = r * (screenR > 30 ? 0.22 : 0.05);
      ctx.font = `800 ${fs}px "Baloo 2", "Nunito", "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = fs * 0.22;
      ctx.strokeStyle = "rgba(20, 33, 61, 0.5)";
      ctx.strokeText(entity.name, 0, nameY);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(entity.name, 0, nameY);

      if (screenR > 34) {
        const ms = fs * 0.62;
        ctx.font = `700 ${ms}px "Nunito", "Segoe UI", sans-serif`;
        ctx.lineWidth = ms * 0.24;
        ctx.strokeStyle = "rgba(20, 33, 61, 0.38)";
        ctx.strokeText(fmtMass(cell.mass), 0, nameY + fs * 0.92);
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        ctx.fillText(fmtMass(cell.mass), 0, nameY + fs * 0.92);
      }
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha * 0.9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloaters() {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of state.floaters) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      const fs = 18 / state.camera.zoom;
      ctx.globalAlpha = a;
      ctx.font = `800 ${fs}px "Baloo 2", "Nunito", sans-serif`;
      ctx.lineWidth = fs * 0.2;
      ctx.strokeStyle = "rgba(20,33,61,0.45)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawMinimap() {
    const size = W < 720 ? 96 : 146;
    const margin = W < 720 ? 12 : 18;
    const cx = W - margin - size / 2;
    const cy = H - margin - size / 2;
    const radius = size / 2 - 5;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(17, 29, 54, 0.6)";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    const scale = radius / CONFIG.worldRadius;
    for (const entity of state.entities.values()) {
      if (!entity.alive) continue;
      for (const cell of entity.cells) {
        if (!cell.alive) continue;
        const x = cx + cell.x * scale;
        const y = cy + cell.y * scale;
        ctx.beginPath();
        ctx.arc(x, y, entity.isPlayer ? 3 : clamp(radiusOf(cell.mass) * scale, 1.2, 3.2), 0, Math.PI * 2);
        ctx.fillStyle = entity.isPlayer ? "#ffffff" : entity.color.main;
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function render(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#eaf1fa");
    bg.addColorStop(1, "#e4edf8");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const zoom = state.camera.zoom;
    const sx = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 15 : 0;
    const sy = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 15 : 0;

    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-state.camera.x, -state.camera.y);

    drawArena(t);
    drawFood();
    drawViruses(t);
    drawParticles();
    drawCells(t);
    drawFloaters();

    ctx.restore();

    drawMinimap();
  }

  // -------------------------------------------------------------------- loop

  function frame(now) {
    const dt = Math.min(0.05, Math.max(0.0001, (now - state.lastFrame) / 1000));
    state.lastFrame = now;

    if (state.mode === "playing" || state.mode === "menu" || state.mode === "dead") {
      update(dt);
    }

    // If the device can't keep up, quietly drop to 1x canvas resolution.
    if (state.mode === "playing" && renderScale > 1) {
      if (!qualityStart) qualityStart = now;
      qualityFrames++;
      const elapsed = now - qualityStart;
      if (elapsed > 2500) {
        const fps = (qualityFrames * 1000) / elapsed;
        qualityStart = now;
        qualityFrames = 0;
        if (fps < 48) {
          renderScale = 1;
          resize();
        }
      }
    } else {
      qualityStart = 0;
      qualityFrames = 0;
    }

    render(now / 1000);
    requestAnimationFrame(frame);
  }

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = renderScale;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ------------------------------------------------------------------ wiring

  function initColorSwatches() {
    PALETTE.forEach((color, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "swatch";
      button.style.setProperty("--swatch", color.main);
      button.setAttribute("aria-label", `Blob color ${index + 1}`);
      button.addEventListener("click", () => {
        state.selectedColor = index;
        writeStore(CONFIG.botColor, String(index));
        updateSwatches();
      });
      colorRow.appendChild(button);
    });
    updateSwatches();
  }

  function updateSwatches() {
    Array.from(colorRow.children).forEach((child, index) => {
      child.classList.toggle("selected", index === state.selectedColor);
    });
  }

  $("play-form").addEventListener("submit", (e) => {
    e.preventDefault();
    startGame();
  });

  $("again-btn").addEventListener("click", startGame);
  $("menu-btn").addEventListener("click", goToMenu);
  $("resume-btn").addEventListener("click", togglePause);
  $("pause-menu-btn").addEventListener("click", goToMenu);
  $("btn-split").addEventListener("click", (e) => {
    e.preventDefault();
    ensureAudio();
    splitPlayer();
  });
  $("btn-eject").addEventListener("click", (e) => {
    e.preventDefault();
    ensureAudio();
    ejectMass();
  });

  muteBtn.addEventListener("click", () => {
    state.muted = !state.muted;
    muteBtn.classList.toggle("muted", state.muted);
    if (!state.muted) {
      ensureAudio();
      tone(600, 0.08, "sine", 0.02, 800);
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.mode === "playing") togglePause();
  });

  window.addEventListener("resize", resize);

  // -------------------------------------------------------------------- boot

  nameInput.value = readStore(CONFIG.botNames) || "";
  bestEl.textContent = fmtMass(state.best);
  massEl.textContent = String(CONFIG.startMass);

  initColorSwatches();
  resize();
  buildWorld(false);
  renderLeaderboard();
  state.mode = "menu";
  app.dataset.mode = "menu";
  menuEl.classList.remove("is-hidden");
  deadEl.classList.add("is-hidden");
  pauseEl.classList.add("is-hidden");

  requestAnimationFrame((now) => {
    state.lastFrame = now;
    requestAnimationFrame(frame);
  });

  if (new URLSearchParams(location.search).has("debug")) {
    window.__blobBattle = { state, CONFIG, startGame, goToMenu, splitPlayer, ejectMass, render, update };
  }
})();
