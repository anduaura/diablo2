'use strict';
/* =====================================================================
   SANCTUARY — a Diablo II–inspired action RPG for the browser.
   Original code & procedural art. Mobile-first: tap to move/attack,
   hold to run, on-screen skill & potion buttons.
   ===================================================================== */

/* ---------------- helpers ---------------- */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const choice = a => a[Math.floor(Math.random() * a.length)];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
// deterministic per-tile hash for floor decoration
const thash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177 | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
};

/* ---------------- constants ---------------- */
const TILE = 44, MAP_W = 52, MAP_H = 52;
const T_WALL = 0, T_FLOOR = 1, T_UP = 2, T_DOWN = 3;
const SAVE_KEY = 'sanctuary_save_v1';

const FLOOR_NAMES = ['Rotting Cellars', 'Bone Crypts', 'Drowned Catacombs',
  'Ashen Halls', 'Blood Vaults', 'Screaming Depths', 'Molten Warrens', 'Abyssal Sanctum'];
const BOSS_NAMES = ['Gharok the Flayed', 'Mistress Vex', 'Korlath, Tomb Warden',
  'The Hollow King', 'Balegrim the Devourer', 'Ashmaw the Eternal'];

/* ---------------- audio (tiny synth) ---------------- */
let AC = null, soundOn = true;
function audioInit() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (AC && AC.state === 'suspended') AC.resume(); }
function blip(freq, dur, type, vol, slide) {
  if (!AC || !soundOn) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur);
  } catch (e) { }
}
const sfx = {
  hit: () => blip(rand(140, 180), 0.09, 'square', 0.05, -60),
  hurt: () => blip(90, 0.16, 'sawtooth', 0.06, -40),
  shoot: () => blip(rand(500, 640), 0.08, 'triangle', 0.045, -300),
  fire: () => blip(rand(200, 260), 0.22, 'sawtooth', 0.05, -140),
  pickup: () => { blip(660, 0.07, 'sine', 0.05, 200); },
  gold: () => { blip(1180, 0.06, 'triangle', 0.045, 150); },
  potion: () => blip(320, 0.2, 'sine', 0.06, 240),
  level: () => { blip(392, 0.14, 'triangle', 0.07, 0); setTimeout(() => blip(523, 0.14, 'triangle', 0.07, 0), 130); setTimeout(() => blip(659, 0.3, 'triangle', 0.07, 0), 260); },
  die: () => blip(160, 0.9, 'sawtooth', 0.08, -120),
  boss: () => blip(70, 0.9, 'sawtooth', 0.09, -20),
  stairs: () => blip(240, 0.4, 'sine', 0.06, -160),
};

/* ---------------- class data ---------------- */
const CLASSES = {
  warrior: {
    name: 'Warrior', icon: '🛡️', color: '#c9a45a',
    desc: 'Relentless melee brawler. High life, crushing blows.',
    base: { str: 30, dex: 20, vit: 32, ene: 10 }, primary: 'str',
    weapon: { slot: 'weapon', base: 'Rusty Sword', icon: '🗡️', rarity: 'common', lvl: 1, dmg: [3, 6], mods: {} },
    atkRange: 64, atkCd: 0.55, ranged: false,
    skills: [
      { id: 'cleave', name: 'Cleave', icon: '🪓', mana: 7, cd: 2.0, desc: 'Sweeping blow: 180% damage in an arc' },
      { id: 'warcry', name: 'War Cry', icon: '💢', mana: 16, cd: 8, desc: 'Shockwave: damages & stuns nearby foes' }],
  },
  sorceress: {
    name: 'Sorceress', icon: '🔮', color: '#7f95e8',
    desc: 'Fragile master of fire and frost. Fights from afar.',
    base: { str: 12, dex: 18, vit: 20, ene: 40 }, primary: 'ene',
    weapon: { slot: 'weapon', base: 'Gnarled Staff', icon: '🪄', rarity: 'common', lvl: 1, dmg: [2, 5], mods: {} },
    atkRange: 330, atkCd: 0.6, ranged: true, projKind: 'fire',
    skills: [
      { id: 'fireball', name: 'Fireball', icon: '🔥', mana: 11, cd: 1.6, desc: 'Explosive bolt: 220% damage in an area' },
      { id: 'frostnova', name: 'Frost Nova', icon: '❄️', mana: 15, cd: 7, desc: 'Icy ring: damages & chills all nearby foes' }],
  },
  huntress: {
    name: 'Huntress', icon: '🏹', color: '#7fbf6a',
    desc: 'Swift ranger. Deadly volleys and piercing shots.',
    base: { str: 18, dex: 36, vit: 22, ene: 14 }, primary: 'dex',
    weapon: { slot: 'weapon', base: 'Short Bow', icon: '🏹', rarity: 'common', lvl: 1, dmg: [2, 6], mods: {} },
    atkRange: 340, atkCd: 0.48, ranged: true, projKind: 'arrow',
    skills: [
      { id: 'multishot', name: 'Multishot', icon: '🎯', mana: 9, cd: 2.2, desc: 'Fan of 5 arrows, 95% damage each' },
      { id: 'skewer', name: 'Skewer', icon: '⚡', mana: 13, cd: 5, desc: 'Piercing bolt: 220% damage through everything' }],
  },
};

/* ---------------- monster data ---------------- */
const MTYPES = [
  { id: 'fallen', name: 'Fallen Imp', hp: 15, dmg: [2, 4], spd: 118, r: 11, xp: 8, gold: [2, 6], atkCd: 1.0, range: 26, minL: 1, w: 3, color: '#c0392b' },
  { id: 'zombie', name: 'Zombie', hp: 34, dmg: [3, 7], spd: 44, r: 14, xp: 13, gold: [3, 8], atkCd: 1.4, range: 30, minL: 1, w: 3, color: '#6a8a4a' },
  { id: 'skel', name: 'Skeleton', hp: 24, dmg: [4, 8], spd: 92, r: 13, xp: 14, gold: [3, 9], atkCd: 1.0, range: 30, minL: 2, w: 3, color: '#cfc9b8' },
  { id: 'archer', name: 'Bone Archer', hp: 18, dmg: [4, 9], spd: 80, r: 12, xp: 17, gold: [4, 10], atkCd: 1.7, range: 250, ranged: true, minL: 3, w: 2, color: '#b8ab8f' },
  { id: 'ghoul', name: 'Ghoul', hp: 46, dmg: [7, 12], spd: 108, r: 14, xp: 24, gold: [5, 13], atkCd: 0.9, range: 32, minL: 5, w: 2, color: '#7a5a8a' },
  { id: 'brute', name: 'Hell Brute', hp: 100, dmg: [11, 18], spd: 66, r: 20, xp: 45, gold: [10, 24], atkCd: 1.5, range: 42, minL: 7, w: 1, color: '#8a2c1a' },
];

/* ---------------- item data ---------------- */
const SLOTS = ['weapon', 'helm', 'armor', 'boots', 'ring', 'amulet'];
const SLOT_ICONS = { weapon: '🗡️', helm: '⛑️', armor: '🥋', boots: '🥾', ring: '💍', amulet: '📿' };
const WEAPON_ICONS = { warrior: ['🗡️', '⚔️', '🪓', '🔨'], sorceress: ['🪄', '🦯', '🔱'], huntress: ['🏹'] };
const BASE_NAMES = {
  weapon: { warrior: ['Sword', 'War Axe', 'Great Maul', 'Broad Blade'], sorceress: ['Staff', 'Rune Rod', 'Grim Scepter'], huntress: ['Hunting Bow', 'War Bow', 'Razor Bow'] },
  helm: ['Cap', 'Helm', 'Great Helm', 'Crown'], armor: ['Leather Armor', 'Ring Mail', 'Plate Mail', 'Ancient Plate'],
  boots: ['Boots', 'Heavy Boots', 'Greaves', 'War Treads'], ring: ['Ring', 'Band', 'Seal'], amulet: ['Amulet', 'Talisman', 'Idol'],
};
const AFFIXES = [
  { stat: 'str', txt: v => `+${v} Strength`, roll: l => ri(1, 2 + Math.floor(l * 0.8)) },
  { stat: 'dex', txt: v => `+${v} Dexterity`, roll: l => ri(1, 2 + Math.floor(l * 0.8)) },
  { stat: 'vit', txt: v => `+${v} Vitality`, roll: l => ri(1, 2 + Math.floor(l * 0.8)) },
  { stat: 'ene', txt: v => `+${v} Energy`, roll: l => ri(1, 2 + Math.floor(l * 0.8)) },
  { stat: 'hp', txt: v => `+${v} Life`, roll: l => ri(5, 10 + l * 4) },
  { stat: 'mp', txt: v => `+${v} Mana`, roll: l => ri(4, 8 + l * 3) },
  { stat: 'dmgPct', txt: v => `+${v}% Damage`, roll: l => ri(5, 10 + l * 4) },
  { stat: 'armor', txt: v => `+${v} Armor`, roll: l => ri(3, 6 + l * 3) },
  { stat: 'leech', txt: v => `${v}% Life Steal`, roll: l => ri(2, 3 + Math.floor(l / 3)) },
  { stat: 'mf', txt: v => `+${v}% Magic Find`, roll: l => ri(5, 10 + l * 3) },
];
const UNIQUES = [
  { slot: 'weapon', name: 'Gravebite', mods: { dmgPct: 60, leech: 8, str: 10 } },
  { slot: 'weapon', name: 'Embersong', mods: { dmgPct: 45, ene: 15, mp: 30 } },
  { slot: 'helm', name: 'Stormhowl', mods: { armor: 25, dex: 12, mf: 25 } },
  { slot: 'armor', name: 'Embershroud', mods: { armor: 40, hp: 50, vit: 10 } },
  { slot: 'boots', name: 'Wolfstride', mods: { armor: 15, dex: 10, hp: 25 } },
  { slot: 'ring', name: 'Eye of the Abyss', mods: { dmgPct: 25, mf: 30, mp: 20 } },
  { slot: 'amulet', name: 'Whisper of Thorns', mods: { str: 8, dex: 8, vit: 8, ene: 8 } },
];

/* ---------------- DOM refs ---------------- */
const $ = id => document.getElementById(id);
const cvs = $('game'), ctx = cvs.getContext('2d');
const mmCvs = $('minimap'), mmCtx = mmCvs.getContext('2d');
const lightCvs = document.createElement('canvas'), lightCtx = lightCvs.getContext('2d');

let VW = 0, VH = 0, DPR = 1, ZOOM = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  cvs.width = VW * DPR; cvs.height = VH * DPR;
  cvs.style.width = VW + 'px'; cvs.style.height = VH + 'px';
  lightCvs.width = VW; lightCvs.height = VH;
  mmCvs.width = 124 * DPR; mmCvs.height = 124 * DPR;
  ZOOM = clamp(Math.min(VW, VH) / 560, 1.0, 1.7);
}
window.addEventListener('resize', resize); resize();

/* ---------------- game state ---------------- */
let G = null;              // active game (null = menu)
let paused = false;        // panel open → world frozen
let saveDirty = false;

function newPlayer(clsId) {
  const c = CLASSES[clsId];
  return {
    cls: clsId, x: 0, y: 0, r: 14, dir: 0,
    level: 1, xp: 0, statPts: 0, gold: 0,
    stats: { ...c.base },
    equip: { weapon: JSON.parse(JSON.stringify(c.weapon)), helm: null, armor: null, boots: null, ring: null, amulet: null },
    inv: [], potions: { hp: 2, mp: 1 },
    hp: 1, mp: 1,                     // set by recalc
    atkT: 0, cd: [0, 0], target: null, path: null, moveTo: null,
    hurtT: 0, swingT: 0, deaths: 0,
  };
}

function derived(p) {
  const c = CLASSES[p.cls];
  const m = { str: 0, dex: 0, vit: 0, ene: 0, hp: 0, mp: 0, dmgPct: 0, armor: 0, leech: 0, mf: 0 };
  let wdmg = [1, 2], warmor = 0;
  for (const s of SLOTS) {
    const it = p.equip[s]; if (!it) continue;
    if (it.dmg) wdmg = it.dmg;
    if (it.armor) warmor += it.armor;
    for (const k in it.mods) m[k] += it.mods[k];
  }
  const str = p.stats.str + m.str, dex = p.stats.dex + m.dex,
    vit = p.stats.vit + m.vit, ene = p.stats.ene + m.ene;
  const prim = { str, dex, ene }[c.primary] ?? str;
  const mult = (1 + prim * 0.012) * (1 + m.dmgPct / 100);
  return {
    str, dex, vit, ene,
    maxHp: Math.round(40 + vit * 3.5 + p.level * 8 + m.hp),
    maxMp: Math.round(20 + ene * 2.5 + p.level * 3 + m.mp),
    dmgLo: Math.max(1, Math.round(wdmg[0] * mult)),
    dmgHi: Math.max(2, Math.round(wdmg[1] * mult)),
    armor: Math.round(warmor + m.armor + dex * 0.25),
    crit: Math.min(0.5, 0.05 + dex * 0.002),
    leech: m.leech / 100, mf: m.mf,
    hpRegen: 1 + vit * 0.03, mpRegen: 1.6 + ene * 0.06,
  };
}
function recalc() { G.d = derived(G.p); G.p.hp = Math.min(G.p.hp, G.d.maxHp); G.p.mp = Math.min(G.p.mp, G.d.maxMp); }
const xpNext = lvl => Math.round(80 * Math.pow(lvl, 1.6));

/* ---------------- dungeon generation ---------------- */
function genLevel(dlvl) {
  const map = []; for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(T_WALL));
  const rooms = [];
  for (let i = 0; i < 60 && rooms.length < 11; i++) {
    const w = ri(5, 9), h = ri(5, 9), x = ri(2, MAP_W - w - 3), y = ri(2, MAP_H - h - 3);
    if (rooms.some(r => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map[y][x] = T_FLOOR;
  const corr = (x1, y1, x2, y2) => {
    let x = x1, y = y1;
    while (x !== x2) { map[y][x] = map[y][x] || T_FLOOR; map[Math.min(y + 1, MAP_H - 1)][x] = map[Math.min(y + 1, MAP_H - 1)][x] || T_FLOOR; x += Math.sign(x2 - x); }
    while (y !== y2) { map[y][x] = map[y][x] || T_FLOOR; map[y][Math.min(x + 1, MAP_W - 1)] = map[y][Math.min(x + 1, MAP_W - 1)] || T_FLOOR; y += Math.sign(y2 - y); }
    map[y][x] = map[y][x] || T_FLOOR;
  };
  for (let i = 1; i < rooms.length; i++) corr(rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy);

  // entrance = room 0, exit = farthest room
  const r0 = rooms[0];
  let exit = rooms[1] || r0, best = -1;
  for (let i = 1; i < rooms.length; i++) {
    const d = dist(r0.cx, r0.cy, rooms[i].cx, rooms[i].cy);
    if (d > best) { best = d; exit = rooms[i]; }
  }
  map[r0.cy][r0.cx] = T_UP;
  map[exit.cy][exit.cx] = T_DOWN;

  // torches on walls adjacent to floor
  const torches = [];
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (map[y][x] === T_WALL && map[y + 1][x] >= T_FLOOR && thash(x, y) < 0.09)
      torches.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE * 0.9 });
  }

  // monsters
  const monsters = [];
  const isBossFloor = dlvl % 5 === 0;
  const pool = MTYPES.filter(t => t.minL <= dlvl);
  const scaleHp = 1 + 0.4 * (dlvl - 1) + 0.05 * (dlvl - 1) * (dlvl - 1);
  const scaleDmg = 1 + 0.22 * (dlvl - 1);
  const scaleXp = 1 + 0.3 * (dlvl - 1);
  const wpick = () => {
    let tot = 0; for (const t of pool) tot += t.w;
    let r = Math.random() * tot;
    for (const t of pool) { r -= t.w; if (r <= 0) return t; }
    return pool[0];
  };
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    if (isBossFloor && room === exit) continue;         // boss room kept clear for the boss
    const n = Math.min(7, ri(2, 3) + Math.floor(dlvl / 3));
    for (let k = 0; k < n; k++) {
      const t = wpick();
      const champ = Math.random() < 0.08;
      monsters.push(makeMonster(t, (room.x + rand(0.8, room.w - 0.8)) * TILE, (room.y + rand(0.8, room.h - 0.8)) * TILE, scaleHp, scaleDmg, scaleXp, champ, false, dlvl));
    }
  }
  let boss = null;
  if (isBossFloor) {
    const bt = { id: 'boss', name: choice(BOSS_NAMES), hp: 240, dmg: [12, 20], spd: 78, r: 26, xp: 160, gold: [60, 120], atkCd: 1.1, range: 52, w: 0, minL: 1, color: '#a01818' };
    boss = makeMonster(bt, exit.cx * TILE + TILE / 2, exit.cy * TILE - TILE, scaleHp, scaleDmg, scaleXp, false, true, dlvl);
    monsters.push(boss);
  }

  return {
    map, rooms, torches, monsters, boss,
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: isBossFloor,
    entrance: { x: r0.cx * TILE + TILE / 2, y: r0.cy * TILE + TILE / 2 + TILE * 0.7 },
    exitTile: { x: exit.cx, y: exit.cy },
  };
}

function makeMonster(t, x, y, sh, sd, sx, champ, isBoss, dlvl) {
  const hp = Math.round(t.hp * sh * (champ ? 2.2 : 1) * (isBoss ? 1 : 1));
  return {
    type: t, x, y, r: t.r * (champ ? 1.25 : 1),
    hp, maxHp: hp,
    dmg: [Math.round(t.dmg[0] * sd * (champ ? 1.5 : 1)), Math.round(t.dmg[1] * sd * (champ ? 1.5 : 1))],
    spd: t.spd * rand(0.9, 1.1), xp: Math.round(t.xp * sx * (champ ? 2.5 : 1)),
    gold: t.gold, atkCd: t.atkCd, range: t.range, ranged: !!t.ranged,
    champ, boss: isBoss, name: champ ? 'Champion ' + t.name : t.name, dlvl,
    aggro: false, atkT: rand(0, 0.5), stunT: 0, slowT: 0, hurtT: 0, hitT: 99,
    dir: rand(0, 6.28), blocked: 0, path: null, pathT: 0, novaT: isBoss ? 3 : 0,
  };
}

/* ---------------- map queries ---------------- */
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T_WALL;
  return G.lvl.map[ty][tx];
}
function walkable(tx, ty) { return tileAt(tx, ty) >= T_FLOOR; }
function circleFree(x, y, r) {
  const x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
  const y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++)
    if (!walkable(tx, ty)) return false;
  return true;
}
function moveCircle(e, dx, dy) {
  if (dx && circleFree(e.x + dx, e.y, e.r)) e.x += dx;
  else if (dx && circleFree(e.x + dx, e.y, e.r * 0.6)) e.x += dx; // squeeze
  if (dy && circleFree(e.x, e.y + dy, e.r)) e.y += dy;
  else if (dy && circleFree(e.x, e.y + dy, e.r * 0.6)) e.y += dy;
}
function los(x1, y1, x2, y2) {
  const steps = Math.ceil(dist(x1, y1, x2, y2) / (TILE * 0.4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!walkable(Math.floor((x1 + (x2 - x1) * t) / TILE), Math.floor((y1 + (y2 - y1) * t) / TILE))) return false;
  }
  return true;
}

/* A* on the tile grid */
function findPath(sx, sy, tx, ty) {
  if (!walkable(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];
  const idx = (x, y) => y * MAP_W + x;
  const open = [{ x: sx, y: sy, g: 0, f: 0 }];
  const came = new Map(), gScore = new Map([[idx(sx, sy), 0]]);
  const closed = new Set();
  let expand = 0;
  while (open.length && expand++ < 3500) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    const ci = idx(cur.x, cur.y);
    if (cur.x === tx && cur.y === ty) {
      const path = []; let k = ci;
      while (came.has(k)) { path.push({ x: (k % MAP_W) * TILE + TILE / 2, y: Math.floor(k / MAP_W) * TILE + TILE / 2 }); k = came.get(k); }
      path.reverse();
      return path;
    }
    closed.add(ci);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cur.x + dx, cur.y) || !walkable(cur.x, cur.y + dy))) continue;
      const ni = idx(nx, ny);
      if (closed.has(ni)) continue;
      const g = cur.g + (dx && dy ? 1.4 : 1);
      if (g < (gScore.get(ni) ?? Infinity)) {
        gScore.set(ni, g); came.set(ni, ci);
        open.push({ x: nx, y: ny, g, f: g + Math.hypot(tx - nx, ty - ny) });
      }
    }
  }
  return null;
}

/* ---------------- items ---------------- */
function makeItem(slot, ilvl, forceRarity) {
  const p = G.p, clsId = p.cls;
  let rarity = forceRarity;
  if (!rarity) {
    const mf = 1 + (G.d ? G.d.mf : 0) / 100;
    const r = Math.random();
    rarity = r < 0.02 * mf ? 'unique' : r < 0.12 * mf ? 'rare' : r < 0.42 * mf ? 'magic' : 'common';
  }
  if (rarity === 'unique') {
    const pool = UNIQUES.filter(u => u.slot === slot);
    if (pool.length) {
      const u = choice(pool);
      const it = { slot, base: u.name, name: u.name, icon: slot === 'weapon' ? choice(WEAPON_ICONS[clsId]) : SLOT_ICONS[slot], rarity: 'unique', lvl: ilvl, mods: { ...u.mods } };
      if (slot === 'weapon') it.dmg = [3 + ilvl * 2, 6 + ilvl * 3];
      else if (slot !== 'ring' && slot !== 'amulet') it.armor = 4 + ilvl * 3;
      return it;
    }
    rarity = 'rare';
  }
  const tier = Math.min(Math.floor(ilvl / 4), 3);
  const bases = slot === 'weapon' ? BASE_NAMES.weapon[clsId] : BASE_NAMES[slot];
  const base = bases[Math.min(tier, bases.length - 1)];
  const it = { slot, base, name: base, icon: slot === 'weapon' ? choice(WEAPON_ICONS[clsId]) : SLOT_ICONS[slot], rarity, lvl: ilvl, mods: {} };
  if (slot === 'weapon') it.dmg = [Math.max(1, 2 + Math.round(ilvl * 1.6 * rand(0.8, 1.1))), 4 + Math.round(ilvl * 2.4 * rand(0.85, 1.15))];
  else if (slot === 'ring' || slot === 'amulet') { /* jewelry: mods only */ }
  else it.armor = 2 + Math.round(ilvl * 2.2 * rand(0.8, 1.2));
  const nAff = rarity === 'rare' ? ri(3, 4) : rarity === 'magic' ? ri(1, 2) : 0;
  const used = new Set();
  for (let i = 0; i < nAff; i++) {
    const a = choice(AFFIXES);
    if (used.has(a.stat)) continue;
    used.add(a.stat);
    it.mods[a.stat] = (it.mods[a.stat] || 0) + a.roll(ilvl);
  }
  if (rarity === 'magic') it.name = base + ' ' + choice(['of Power', 'of the Fox', 'of the Wolf', 'of Souls', 'of Embers', 'of Frost', 'of the Colossus']);
  if (rarity === 'rare') it.name = choice(['Doom', 'Grim', 'Storm', 'Blood', 'Shadow', 'Bone', 'Raven']) + choice([' Spike', ' Ward', ' Song', ' Grasp', ' Veil', ' Brand']) ;
  return it;
}
const sellPrice = it => ({ common: 8, magic: 25, rare: 70, unique: 200 }[it.rarity] + it.lvl * 6);
function modLines(it) {
  const lines = [];
  if (it.dmg) lines.push(`Damage: ${it.dmg[0]}–${it.dmg[1]}`);
  if (it.armor) lines.push(`Armor: ${it.armor}`);
  for (const k in it.mods) {
    const a = AFFIXES.find(a => a.stat === k);
    if (a) lines.push(a.txt(it.mods[k]));
  }
  return lines;
}

/* ---------------- floating text / particles ---------------- */
function ftext(x, y, txt, color, size) {
  G.texts.push({ x: x + rand(-8, 8), y, txt, color: color || '#fff', size: size || 15, life: 1, vy: -46 });
}
function burst(x, y, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(20, spd || 120);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, r: rand(1.5, 3.5), color, life: rand(0.3, 0.7) });
  }
}
function banner(txt) {
  const b = $('banner');
  b.textContent = txt;
  b.classList.remove('hidden');
  // restart CSS animation
  b.style.animation = 'none'; void b.offsetHeight; b.style.animation = '';
}

/* ---------------- combat ---------------- */
function playerAtk() { return ri(G.d.dmgLo, G.d.dmgHi); }

function hitMonster(m, dmg, opts) {
  opts = opts || {};
  if (m.hp <= 0) return;
  const crit = !opts.noCrit && Math.random() < G.d.crit;
  if (crit) dmg = Math.round(dmg * 1.8);
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg; m.hurtT = 0.15; m.hitT = 0; m.aggro = true;
  if (opts.stun) m.stunT = Math.max(m.stunT, opts.stun);
  if (opts.slow) m.slowT = Math.max(m.slowT, opts.slow);
  if (opts.kb) {
    const a = Math.atan2(m.y - G.p.y, m.x - G.p.x);
    moveCircle(m, Math.cos(a) * opts.kb, Math.sin(a) * opts.kb);
  }
  ftext(m.x, m.y - m.r - 8, dmg + (crit ? '!' : ''), crit ? '#ffd76a' : '#fff', crit ? 19 : 14);
  burst(m.x, m.y - m.r / 2, m.type.color, crit ? 10 : 5);
  sfx.hit();
  if (G.d.leech > 0) G.p.hp = Math.min(G.d.maxHp, G.p.hp + dmg * G.d.leech);
  if (m.hp <= 0) killMonster(m);
}

function killMonster(m) {
  burst(m.x, m.y, m.type.color, 16, 160);
  burst(m.x, m.y, '#3a3a3a', 8, 80);
  // xp
  const p = G.p;
  p.xp += m.xp;
  ftext(m.x, m.y - 26, '+' + m.xp + ' xp', '#b8a4e8', 12);
  while (p.xp >= xpNext(p.level)) {
    p.xp -= xpNext(p.level); p.level++; p.statPts += 5;
    recalc(); p.hp = G.d.maxHp; p.mp = G.d.maxMp;
    banner('LEVEL ' + p.level + '!  +5 stat points');
    burst(p.x, p.y, '#ffd76a', 30, 200);
    sfx.level(); updateBadge();
  }
  dropLoot(m);
  if (m.boss) {
    G.lvl.locked = false;
    banner(m.name + ' has fallen! The stairs open…');
    sfx.boss();
  }
  saveDirty = true;
}

function dropLoot(m) {
  const x = m.x, y = m.y, dlvl = G.dlvl;
  const scatter = () => ({ x: x + rand(-22, 22), y: y + rand(-22, 22) });
  const rGold = m.boss ? 1 : 0.62, rPot = m.boss ? 1 : 0.16, rItem = m.boss ? 1 : (m.champ ? 0.55 : 0.17);
  if (Math.random() < rGold) {
    const amt = Math.round(ri(m.gold[0], m.gold[1]) * (1 + dlvl * 0.25));
    G.drops.push({ kind: 'gold', amt, ...scatter() });
  }
  if (Math.random() < rPot) G.drops.push({ kind: Math.random() < 0.6 ? 'hpPot' : 'mpPot', ...scatter() });
  if (Math.random() < rItem) {
    const slot = choice(SLOTS);
    const it = makeItem(slot, Math.max(1, dlvl + ri(-1, 1)), m.boss ? (Math.random() < 0.3 ? 'unique' : 'rare') : null);
    G.drops.push({ kind: 'item', item: it, ...scatter() });
  }
}

function hurtPlayer(dmg, mlvl) {
  const p = G.p;
  const red = clamp(G.d.armor / (G.d.armor + 60 + 12 * (mlvl || G.dlvl)), 0, 0.75);
  dmg = Math.max(1, Math.round(dmg * (1 - red)));
  p.hp -= dmg; p.hurtT = 0.25;
  ftext(p.x, p.y - 26, '-' + dmg, '#ff6a5a', 15);
  sfx.hurt();
  if (p.hp <= 0) {
    p.hp = 0; p.deaths++;
    const lost = Math.floor(p.gold * 0.1);
    p.gold -= lost;
    $('deathInfo').textContent = (lost > 0 ? 'The darkness claims ' + lost + ' gold. ' : '') + 'Your body lies on floor ' + G.dlvl + '.';
    $('deathScreen').classList.remove('hidden');
    sfx.die();
    saveDirty = true; saveGame();
  }
}

/* skills */
function castSkill(i) {
  const p = G.p, c = CLASSES[p.cls], sk = c.skills[i];
  if (!sk || p.hp <= 0 || paused) return;
  if (p.cd[i] > 0) return;
  if (p.mp < sk.mana) { ftext(p.x, p.y - 30, 'Not enough mana', '#8fb3ff', 12); return; }
  p.mp -= sk.mana; p.cd[i] = sk.cd; p.swingT = 0.22;
  // aim: current target if alive, else facing
  let aim = p.dir;
  const t = p.target && p.target.hp > 0 ? p.target : nearestMonster(p.x, p.y, 420);
  if (t) { aim = Math.atan2(t.y - p.y, t.x - p.x); p.dir = aim; }
  const atk = playerAtk();
  switch (sk.id) {
    case 'cleave':
      for (const m of G.lvl.monsters) {
        if (m.hp <= 0) continue;
        const d = dist(p.x, p.y, m.x, m.y);
        if (d < 95 + m.r) {
          let da = Math.atan2(m.y - p.y, m.x - p.x) - aim;
          while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          if (Math.abs(da) < 1.35) hitMonster(m, atk * 1.8, { kb: 14 });
        }
      }
      burst(p.x + Math.cos(aim) * 50, p.y + Math.sin(aim) * 50, '#e8d9a8', 12, 180);
      sfx.fire();
      break;
    case 'warcry':
      for (const m of G.lvl.monsters) {
        if (m.hp <= 0) continue;
        if (dist(p.x, p.y, m.x, m.y) < 135 + m.r) hitMonster(m, atk * 0.9, { stun: 1.7, kb: 26, noCrit: true });
      }
      G.rings.push({ x: p.x, y: p.y, r: 10, max: 140, color: '#e8b45a', life: 0.35 });
      sfx.boss();
      break;
    case 'fireball':
      shoot(p.x, p.y, aim, 380, atk * 2.2, 'p', { kind: 'fireball', r: 7, aoe: 72 });
      sfx.fire();
      break;
    case 'frostnova':
      for (const m of G.lvl.monsters) {
        if (m.hp <= 0) continue;
        if (dist(p.x, p.y, m.x, m.y) < 150 + m.r) hitMonster(m, atk * 1.2, { slow: 3.5, noCrit: true });
      }
      G.rings.push({ x: p.x, y: p.y, r: 10, max: 155, color: '#9adcff', life: 0.4 });
      sfx.potion();
      break;
    case 'multishot':
      for (let k = -2; k <= 2; k++) shoot(p.x, p.y, aim + k * 0.22, 470, atk * 0.95, 'p', { kind: 'arrow', r: 4 });
      sfx.shoot();
      break;
    case 'skewer':
      shoot(p.x, p.y, aim, 560, atk * 2.2, 'p', { kind: 'bolt', r: 5, pierce: true });
      sfx.shoot();
      break;
  }
  updateHUD();
}

function shoot(x, y, ang, spd, dmg, from, o) {
  o = o || {};
  G.projs.push({
    x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
    dmg, from, r: o.r || 4, kind: o.kind || 'arrow',
    aoe: o.aoe || 0, pierce: !!o.pierce, hit: new Set(), life: 1.6,
  });
}

function nearestMonster(x, y, maxD) {
  let best = null, bd = maxD;
  for (const m of G.lvl.monsters) {
    if (m.hp <= 0) continue;
    const d = dist(x, y, m.x, m.y);
    if (d < bd && los(x, y, m.x, m.y)) { bd = d; best = m; }
  }
  return best;
}

function drinkPotion(kind) {
  const p = G.p;
  if (p.hp <= 0 || !G) return;
  if (kind === 'hp' && p.potions.hp > 0 && p.hp < G.d.maxHp) {
    p.potions.hp--; p.hp = Math.min(G.d.maxHp, p.hp + Math.round(G.d.maxHp * 0.45) + 15);
    burst(p.x, p.y - 10, '#ff6a5a', 10, 90); sfx.potion();
  } else if (kind === 'mp' && p.potions.mp > 0 && p.mp < G.d.maxMp) {
    p.potions.mp--; p.mp = Math.min(G.d.maxMp, p.mp + Math.round(G.d.maxMp * 0.5) + 12);
    burst(p.x, p.y - 10, '#6aa0ff', 10, 90); sfx.potion();
  }
  updateHUD(); saveDirty = true;
}

/* ---------------- level flow ---------------- */
function enterLevel(dlvl, fresh) {
  G.dlvl = dlvl;
  G.lvl = genLevel(dlvl);
  G.projs = []; G.parts = []; G.texts = []; G.drops = []; G.rings = [];
  const p = G.p;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null;
  const tierName = FLOOR_NAMES[Math.min(Math.floor((dlvl - 1) / 3), FLOOR_NAMES.length - 1)];
  $('floorLabel').textContent = tierName + ' · ' + dlvl;
  banner(dlvl % 5 === 0 ? tierName + ' — ' + dlvl + '  ⚠ a great evil stirs…' : tierName + ' — Floor ' + dlvl);
  if (dlvl % 5 === 0) sfx.boss(); else sfx.stairs();
  saveDirty = true; saveGame();
}

/* ---------------- save / load ---------------- */
function saveGame() {
  if (!G) return;
  try {
    const p = G.p;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1, cls: p.cls, level: p.level, xp: p.xp, statPts: p.statPts, gold: p.gold,
      stats: p.stats, equip: p.equip, inv: p.inv, potions: p.potions,
      hp: p.hp, mp: p.mp, dlvl: G.dlvl, deaths: p.deaths, soundOn,
    }));
    saveDirty = false;
  } catch (e) { }
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
function startGame(clsId, save) {
  const p = newPlayer(clsId);
  if (save) {
    Object.assign(p, {
      level: save.level, xp: save.xp, statPts: save.statPts, gold: save.gold,
      stats: save.stats, equip: save.equip, inv: save.inv || [], potions: save.potions,
      deaths: save.deaths || 0,
    });
    soundOn = save.soundOn !== false;
  }
  G = { p, dlvl: save ? save.dlvl : 1, lvl: null, projs: [], parts: [], texts: [], drops: [], rings: [], time: 0, mmT: 0 };
  recalc();
  p.hp = save ? clamp(save.hp, 1, G.d.maxHp) : G.d.maxHp;
  p.mp = save ? clamp(save.mp, 0, G.d.maxMp) : G.d.maxMp;
  enterLevel(G.dlvl, true);
  $('menuScreen').classList.add('hidden');
  $('deathScreen').classList.add('hidden');
  $('topbar').classList.remove('hidden');
  $('hud').classList.remove('hidden');
  buildSkillbar(); updateHUD(); updateBadge();
  paused = false;
}

/* ---------------- update loop ---------------- */
const keys = {};
function update(dt) {
  const p = G.p, d = G.d;
  G.time += dt;
  if (p.hp <= 0) { updateWorldFx(dt); return; }

  // regen & timers
  p.hp = Math.min(d.maxHp, p.hp + d.hpRegen * dt);
  p.mp = Math.min(d.maxMp, p.mp + d.mpRegen * dt);
  p.cd[0] = Math.max(0, p.cd[0] - dt); p.cd[1] = Math.max(0, p.cd[1] - dt);
  p.atkT = Math.max(0, p.atkT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.swingT = Math.max(0, p.swingT - dt);

  /* --- player movement --- */
  const spd = 175;
  let kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
  let ky = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
  if (kx || ky) { p.path = null; p.moveTo = null; p.target = null; const l = Math.hypot(kx, ky); moveCircle(p, kx / l * spd * dt, ky / l * spd * dt); p.dir = Math.atan2(ky, kx); }
  else if (pointer.drag && pointer.down) {
    const w = screenToWorld(pointer.x, pointer.y);
    const dd = dist(p.x, p.y, w.x, w.y);
    if (dd > 18) { const a = Math.atan2(w.y - p.y, w.x - p.x); p.dir = a; moveCircle(p, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt); }
    p.path = null; p.moveTo = null;
  } else {
    // chase attack target
    if (p.target) {
      if (p.target.hp <= 0) { p.target = null; }
      else {
        const c = CLASSES[p.cls];
        const dd = dist(p.x, p.y, p.target.x, p.target.y);
        const inRange = dd < c.atkRange + p.target.r && (!c.ranged || los(p.x, p.y, p.target.x, p.target.y));
        if (inRange) {
          p.path = null; p.moveTo = null;
          p.dir = Math.atan2(p.target.y - p.y, p.target.x - p.x);
          if (p.atkT <= 0) {
            p.atkT = c.atkCd; p.swingT = 0.2;
            if (c.ranged) { shoot(p.x, p.y, p.dir, 460, playerAtk(), 'p', { kind: c.projKind, r: 4 }); sfx.shoot(); }
            else hitMonster(p.target, playerAtk());
          }
        } else if (!p.moveTo || dist(p.moveTo.x, p.moveTo.y, p.target.x, p.target.y) > TILE * 1.5) {
          setMoveTarget(p.target.x, p.target.y);
        }
      }
    }
    // follow path / direct move
    if (p.path && p.path.length) {
      const wp = p.path[0];
      const dd = dist(p.x, p.y, wp.x, wp.y);
      if (dd < 8) p.path.shift();
      else { const a = Math.atan2(wp.y - p.y, wp.x - p.x); p.dir = a; moveCircle(p, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt); }
      if (!p.path.length) p.path = null;
    } else if (p.moveTo) {
      const dd = dist(p.x, p.y, p.moveTo.x, p.moveTo.y);
      if (dd < 6) p.moveTo = null;
      else { const a = Math.atan2(p.moveTo.y - p.y, p.moveTo.x - p.x); p.dir = a; moveCircle(p, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt); }
    }
  }

  /* --- stairs --- */
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
  if (tileAt(ptx, pty) === T_DOWN) {
    if (G.lvl.locked) {
      if (!G.lockMsgT || G.time - G.lockMsgT > 3) { banner('The stairs are sealed — slay ' + (G.lvl.boss ? G.lvl.boss.name : 'the guardian') + '!'); G.lockMsgT = G.time; }
      p.moveTo = null; p.path = null;
      moveCircle(p, (p.x - (ptx * TILE + TILE / 2)) > 0 ? 3 : -3, 3);
    } else {
      enterLevel(G.dlvl + 1, false);
      return;
    }
  }

  /* --- pickups --- */
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const dr = G.drops[i];
    const dd = dist(p.x, p.y, dr.x, dr.y);
    if (dr.kind === 'gold' && dd < 34) {
      p.gold += dr.amt; ftext(dr.x, dr.y - 12, '+' + dr.amt + ' gold', '#e8c14d', 12);
      G.drops.splice(i, 1); sfx.gold(); updateHUD(); saveDirty = true;
    } else if ((dr.kind === 'hpPot' || dr.kind === 'mpPot') && dd < 34) {
      p.potions[dr.kind === 'hpPot' ? 'hp' : 'mp']++;
      ftext(dr.x, dr.y - 12, dr.kind === 'hpPot' ? 'Health Potion' : 'Mana Potion', dr.kind === 'hpPot' ? '#ff8a7a' : '#8fb3ff', 12);
      G.drops.splice(i, 1); sfx.pickup(); updateHUD(); saveDirty = true;
    } else if (dr.kind === 'item' && dd < 30) {
      if (p.inv.length >= 24) { if (!dr.fullMsg) { ftext(p.x, p.y - 30, 'Inventory full!', '#ff8a7a', 13); dr.fullMsg = true; } }
      else {
        p.inv.push(dr.item);
        ftext(dr.x, dr.y - 12, dr.item.name, rarityColor(dr.item.rarity), 13);
        G.drops.splice(i, 1); sfx.pickup(); saveDirty = true;
        if ($('invPanel') && !$('invPanel').classList.contains('hidden')) renderInv();
      }
    }
  }

  /* --- monsters --- */
  const ms = G.lvl.monsters;
  for (const m of ms) {
    if (m.hp <= 0) continue;
    m.atkT -= dt; m.hurtT = Math.max(0, m.hurtT - dt); m.hitT += dt;
    if (m.stunT > 0) { m.stunT -= dt; continue; }
    m.slowT = Math.max(0, m.slowT - dt);
    const dd = dist(m.x, m.y, p.x, p.y);
    if (!m.aggro) {
      if (dd < 265 && los(m.x, m.y, p.x, p.y)) { m.aggro = true; if (m.boss) { banner('⚔ ' + m.name + ' ⚔'); sfx.boss(); } }
      else continue;
    }
    if (p.hp <= 0) continue;
    const mspd = m.spd * (m.slowT > 0 ? 0.42 : 1);
    m.dir = Math.atan2(p.y - m.y, p.x - m.x);
    if (m.ranged) {
      if (dd < m.range && los(m.x, m.y, p.x, p.y)) {
        if (m.atkT <= 0) {
          m.atkT = m.atkCd;
          shoot(m.x, m.y, m.dir + rand(-0.06, 0.06), 300, ri(m.dmg[0], m.dmg[1]), 'm', { kind: 'bone', r: 4 });
        }
        if (dd < 120) { moveCircle(m, -Math.cos(m.dir) * mspd * 0.6 * dt, -Math.sin(m.dir) * mspd * 0.6 * dt); }
      } else chaseStep(m, mspd, dt);
    } else {
      if (dd < m.range + p.r) {
        if (m.atkT <= 0) { m.atkT = m.atkCd; hurtPlayer(ri(m.dmg[0], m.dmg[1]), m.dlvl); }
      } else chaseStep(m, mspd, dt);
    }
    // boss nova
    if (m.boss) {
      m.novaT -= dt;
      if (m.novaT <= 0 && dd < 420) {
        m.novaT = 6;
        for (let k = 0; k < 10; k++) shoot(m.x, m.y, k / 10 * Math.PI * 2, 230, Math.round(m.dmg[1] * 0.8), 'm', { kind: 'fireball', r: 6 });
        G.rings.push({ x: m.x, y: m.y, r: 12, max: 90, color: '#ff5a3a', life: 0.3 });
        sfx.fire();
      }
    }
  }
  // separation (nearby only)
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i]; if (a.hp <= 0) continue;
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j]; if (b.hp <= 0) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dd = Math.hypot(dx, dy), min = a.r + b.r;
      if (dd > 0.01 && dd < min) {
        const push = (min - dd) / 2, nx = dx / dd, ny = dy / dd;
        moveCircle(a, -nx * push, -ny * push); moveCircle(b, nx * push, ny * push);
      }
    }
  }

  /* --- projectiles --- */
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const pr = G.projs[i];
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    let dead = pr.life <= 0;
    if (!walkable(Math.floor(pr.x / TILE), Math.floor(pr.y / TILE))) dead = true;
    if (!dead && pr.from === 'p') {
      for (const m of ms) {
        if (m.hp <= 0 || pr.hit.has(m)) continue;
        if (dist(pr.x, pr.y, m.x, m.y) < m.r + pr.r) {
          pr.hit.add(m);
          if (pr.aoe) {
            for (const m2 of ms) if (m2.hp > 0 && dist(pr.x, pr.y, m2.x, m2.y) < pr.aoe + m2.r) hitMonster(m2, pr.dmg);
            burst(pr.x, pr.y, '#ff8a3a', 18, 200);
            G.rings.push({ x: pr.x, y: pr.y, r: 8, max: pr.aoe, color: '#ff8a3a', life: 0.25 });
            dead = true;
          } else {
            hitMonster(m, pr.dmg);
            if (!pr.pierce) dead = true;
          }
          if (dead) break;
        }
      }
    } else if (!dead && pr.from === 'm') {
      if (p.hp > 0 && dist(pr.x, pr.y, p.x, p.y) < p.r + pr.r) {
        hurtPlayer(pr.dmg, G.dlvl);
        dead = true;
      }
    }
    if (dead) {
      if (pr.kind === 'fireball') burst(pr.x, pr.y, '#ff8a3a', 6, 120);
      G.projs.splice(i, 1);
    }
  }

  updateWorldFx(dt);

  /* --- fog of war (reveal near player) --- */
  G.mmT -= dt;
  if (G.mmT <= 0) {
    G.mmT = 0.25;
    const R = 9;
    for (let ty = pty - R; ty <= pty + R; ty++) for (let tx = ptx - R; tx <= ptx + R; tx++) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) continue;
      if ((tx - ptx) * (tx - ptx) + (ty - pty) * (ty - pty) <= R * R) G.lvl.seen[ty * MAP_W + tx] = 1;
    }
    drawMinimap();
  }
  updateHUD();
}

function chaseStep(m, mspd, dt) {
  const p = G.p;
  if (los(m.x, m.y, p.x, p.y)) {
    m.path = null;
    const ox = m.x, oy = m.y;
    moveCircle(m, Math.cos(m.dir) * mspd * dt, Math.sin(m.dir) * mspd * dt);
    if (dist(ox, oy, m.x, m.y) < mspd * dt * 0.25) m.blocked += dt; else m.blocked = 0;
  } else {
    m.pathT -= dt;
    if ((!m.path || !m.path.length) && m.pathT <= 0) {
      m.pathT = 0.8;
      m.path = findPath(Math.floor(m.x / TILE), Math.floor(m.y / TILE), Math.floor(p.x / TILE), Math.floor(p.y / TILE));
      if (m.path && m.path.length > 24) m.path = null; // too far, give up quietly
    }
    if (m.path && m.path.length) {
      const wp = m.path[0];
      if (dist(m.x, m.y, wp.x, wp.y) < 8) m.path.shift();
      else { const a = Math.atan2(wp.y - m.y, wp.x - m.x); moveCircle(m, Math.cos(a) * mspd * dt, Math.sin(a) * mspd * dt); }
    }
  }
}

function updateWorldFx(dt) {
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const q = G.parts[i];
    q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 260 * dt; q.life -= dt;
    if (q.life <= 0) G.parts.splice(i, 1);
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.y += t.vy * dt; t.life -= dt * 0.9;
    if (t.life <= 0) G.texts.splice(i, 1);
  }
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i];
    r.life -= dt;
    if (r.life <= 0) G.rings.splice(i, 1);
  }
}

function setMoveTarget(wx, wy) {
  const p = G.p;
  if (los(p.x, p.y, wx, wy)) { p.moveTo = { x: wx, y: wy }; p.path = null; return; }
  const path = findPath(Math.floor(p.x / TILE), Math.floor(p.y / TILE), Math.floor(wx / TILE), Math.floor(wy / TILE));
  if (path) { p.path = path; p.moveTo = { x: wx, y: wy }; if (path.length) path[path.length - 1] = { x: wx, y: wy }; }
  else { p.moveTo = { x: wx, y: wy }; p.path = null; }
}

/* ---------------- rendering ---------------- */
let cam = { x: 0, y: 0 };
function worldToScreen(wx, wy) { return { x: (wx - cam.x) * ZOOM + VW / 2, y: (wy - cam.y) * ZOOM + VH / 2 }; }
function screenToWorld(sx, sy) { return { x: (sx - VW / 2) / ZOOM + cam.x, y: (sy - VH / 2) / ZOOM + cam.y }; }

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#070404';
  ctx.fillRect(0, 0, VW, VH);
  if (!G) return;
  const p = G.p;
  cam.x = clamp(p.x, VW / 2 / ZOOM, MAP_W * TILE - VW / 2 / ZOOM);
  cam.y = clamp(p.y, VH / 2 / ZOOM, MAP_H * TILE - VH / 2 / ZOOM);
  if (MAP_W * TILE < VW / ZOOM) cam.x = MAP_W * TILE / 2;
  if (MAP_H * TILE < VH / ZOOM) cam.y = MAP_H * TILE / 2;

  ctx.save();
  ctx.translate(VW / 2, VH / 2); ctx.scale(ZOOM, ZOOM); ctx.translate(-cam.x, -cam.y);

  /* tiles */
  const x0 = Math.max(0, Math.floor((cam.x - VW / 2 / ZOOM) / TILE) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + VW / 2 / ZOOM) / TILE) + 1);
  const y0 = Math.max(0, Math.floor((cam.y - VH / 2 / ZOOM) / TILE) - 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + VH / 2 / ZOOM) / TILE) + 1);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = G.lvl.map[ty][tx], px = tx * TILE, py = ty * TILE, h = thash(tx, ty);
    if (t === T_WALL) {
      // only draw walls bordering floor (rest stays black)
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy++) for (let dx = -1; dx <= 1; dx++)
        if (tileAt(tx + dx, ty + dy) >= T_FLOOR) { border = true; break; }
      if (border) {
        ctx.fillStyle = h < 0.5 ? '#241a12' : '#281d14';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#0f0a06';
        ctx.fillRect(px, py + TILE - 6, TILE, 6);
        ctx.fillStyle = '#312418';
        ctx.fillRect(px + 1, py + 1, TILE - 2, 4);
      }
    } else {
      ctx.fillStyle = h < 0.33 ? '#3b2e20' : h < 0.66 ? '#3f3223' : '#372b1e';
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = '#00000022';
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      if (h > 0.93) { // bones / rubble decoration
        ctx.fillStyle = '#00000033';
        ctx.beginPath(); ctx.ellipse(px + TILE * 0.5, py + TILE * 0.55, 8, 4, h * 6, 0, 7); ctx.fill();
        ctx.fillStyle = h > 0.965 ? '#b8ab8f' : '#4a3a28';
        ctx.fillRect(px + TILE * 0.3, py + TILE * 0.45, 9, 2.5);
        ctx.fillRect(px + TILE * 0.5, py + TILE * 0.55, 6, 2);
      }
      if (t === T_UP) {
        ctx.fillStyle = '#1a1208'; ctx.fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
        ctx.fillStyle = '#6a5a3a';
        for (let s = 0; s < 3; s++) ctx.fillRect(px + 8 + s * 4, py + 8 + s * 4, TILE - 16 - s * 8, 3);
      }
      if (t === T_DOWN) {
        const locked = G.lvl.locked;
        ctx.fillStyle = '#050302'; ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        ctx.strokeStyle = locked ? '#8a2c1a' : '#d9c65a';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
        ctx.fillStyle = locked ? '#8a2c1a' : '#d9c65a';
        ctx.font = 'bold 20px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(locked ? '✖' : '▼', px + TILE / 2, py + TILE / 2 + (locked ? 0 : Math.sin(G.time * 3) * 2));
      }
    }
  }

  /* torches */
  for (const t of G.lvl.torches) {
    if (t.x < cam.x - VW / ZOOM || t.x > cam.x + VW / ZOOM || t.y < cam.y - VH / ZOOM || t.y > cam.y + VH / ZOOM) continue;
    ctx.fillStyle = '#4a3418';
    ctx.fillRect(t.x - 2, t.y - 10, 4, 12);
    const fl = Math.sin(G.time * 9 + t.x) * 1.6;
    ctx.fillStyle = '#ffb03a';
    ctx.beginPath(); ctx.ellipse(t.x, t.y - 13 + fl * 0.4, 3.5, 6 + fl, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath(); ctx.ellipse(t.x, t.y - 12, 1.6, 3, 0, 0, 7); ctx.fill();
  }

  /* drops */
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const dr of G.drops) {
    const bob = Math.sin(G.time * 3 + dr.x) * 1.5;
    ctx.fillStyle = '#00000055';
    ctx.beginPath(); ctx.ellipse(dr.x, dr.y + 5, 8, 3.5, 0, 0, 7); ctx.fill();
    if (dr.kind === 'gold') {
      ctx.fillStyle = '#e8c14d';
      ctx.beginPath(); ctx.arc(dr.x, dr.y + bob * 0.4, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3c0'; ctx.beginPath(); ctx.arc(dr.x - 1.5, dr.y - 1.5 + bob * 0.4, 1.6, 0, 7); ctx.fill();
    } else if (dr.kind === 'hpPot' || dr.kind === 'mpPot') {
      ctx.fillStyle = dr.kind === 'hpPot' ? '#c8281e' : '#2848c8';
      ctx.beginPath(); ctx.arc(dr.x, dr.y + bob * 0.5, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#c9b98a'; ctx.fillRect(dr.x - 2, dr.y - 10 + bob * 0.5, 4, 5);
    } else {
      const col = rarityColor(dr.item.rarity);
      ctx.save(); ctx.translate(dr.x, dr.y + bob); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = col; ctx.fillRect(-6, -6, 12, 12);
      ctx.strokeStyle = '#00000088'; ctx.strokeRect(-6, -6, 12, 12);
      ctx.restore();
      ctx.font = '11px Georgia';
      ctx.fillStyle = '#000000aa';
      const nw = ctx.measureText(dr.item.name).width;
      ctx.fillRect(dr.x - nw / 2 - 3, dr.y - 24, nw + 6, 13);
      ctx.fillStyle = col;
      ctx.fillText(dr.item.name, dr.x, dr.y - 17.5);
    }
  }

  /* move marker */
  if (p.moveTo && p.hp > 0) {
    ctx.strokeStyle = '#c9b98a66'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.moveTo.x, p.moveTo.y, 7 + Math.sin(G.time * 6) * 2, 0, 7); ctx.stroke();
  }

  /* entities sorted by y */
  const ents = [];
  for (const m of G.lvl.monsters) if (m.hp > 0 && m.x > cam.x - VW / ZOOM && m.x < cam.x + VW / ZOOM && m.y > cam.y - VH / ZOOM && m.y < cam.y + VH / ZOOM) ents.push(m);
  ents.push(p);
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e === p) drawPlayer(p);
    else drawMonster(e);
  }

  /* projectiles */
  for (const pr of G.projs) {
    if (pr.kind === 'fireball') {
      ctx.fillStyle = '#ff8a3a';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.45, 0, 7); ctx.fill();
      if (Math.random() < 0.5) G.parts.push({ x: pr.x, y: pr.y, vx: rand(-20, 20), vy: rand(-30, 5), r: rand(1.5, 3), color: '#ff8a3a', life: 0.3 });
    } else if (pr.kind === 'fire') {
      ctx.fillStyle = '#ffab4a';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.fill();
    } else if (pr.kind === 'bone') {
      ctx.fillStyle = '#cfc9b8';
      ctx.save(); ctx.translate(pr.x, pr.y); ctx.rotate(G.time * 12);
      ctx.fillRect(-5, -1.5, 10, 3); ctx.restore();
    } else if (pr.kind === 'bolt') {
      const a = Math.atan2(pr.vy, pr.vx);
      ctx.strokeStyle = '#9adcff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pr.x - Math.cos(a) * 12, pr.y - Math.sin(a) * 12); ctx.lineTo(pr.x, pr.y); ctx.stroke();
    } else { // arrow
      const a = Math.atan2(pr.vy, pr.vx);
      ctx.strokeStyle = '#c9b98a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pr.x - Math.cos(a) * 9, pr.y - Math.sin(a) * 9); ctx.lineTo(pr.x, pr.y); ctx.stroke();
    }
  }

  /* rings */
  for (const r of G.rings) {
    const t = 1 - r.life / 0.4;
    ctx.strokeStyle = r.color; ctx.globalAlpha = Math.max(0, r.life * 2.4);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * Math.min(1, t * 1.6), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* particles */
  for (const q of G.parts) {
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
  }
  ctx.globalAlpha = 1;

  /* floating text */
  for (const t of G.texts) {
    ctx.globalAlpha = clamp(t.life * 1.6, 0, 1);
    ctx.font = 'bold ' + t.size + 'px Georgia';
    ctx.fillStyle = '#000';
    ctx.fillText(t.txt, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  /* darkness + lights */
  drawLights();

  /* boss bar (screen space) */
  const boss = G.lvl.boss;
  if (boss && boss.hp > 0 && boss.aggro) {
    const w = Math.min(VW * 0.7, 340), x = (VW - w) / 2, y = 58;
    ctx.fillStyle = '#000000b0'; ctx.fillRect(x - 2, y - 2, w + 4, 18);
    ctx.fillStyle = '#4a0f0a'; ctx.fillRect(x, y, w, 10);
    ctx.fillStyle = '#c8281e'; ctx.fillRect(x, y, w * clamp(boss.hp / boss.maxHp, 0, 1), 10);
    ctx.fillStyle = '#e8d9a8'; ctx.font = '11px Georgia'; ctx.textAlign = 'center';
    ctx.fillText(boss.name, VW / 2, y + 22);
  }
}

function drawLights() {
  lightCtx.setTransform(1, 0, 0, 1, 0, 0);
  lightCtx.globalCompositeOperation = 'source-over';
  lightCtx.fillStyle = 'rgba(3,2,6,0.82)';
  lightCtx.fillRect(0, 0, VW, VH);
  lightCtx.globalCompositeOperation = 'destination-out';
  const hole = (wx, wy, r, a) => {
    const s = worldToScreen(wx, wy);
    if (s.x < -r || s.x > VW + r || s.y < -r || s.y > VH + r) return;
    const g = lightCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * ZOOM);
    g.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lightCtx.fillStyle = g;
    lightCtx.beginPath(); lightCtx.arc(s.x, s.y, r * ZOOM, 0, 7); lightCtx.fill();
  };
  hole(G.p.x, G.p.y, 280, 1);
  for (const t of G.lvl.torches) hole(t.x, t.y - 12, 110 + Math.sin(G.time * 8 + t.x) * 8, 0.9);
  for (const pr of G.projs) if (pr.kind === 'fireball' || pr.kind === 'fire') hole(pr.x, pr.y, 70, 0.8);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(lightCvs, 0, 0, VW, VH);
}

function drawPlayer(p) {
  const moving = !!(p.path || p.moveTo || (pointer.drag && pointer.down) ||
    keys['w'] || keys['a'] || keys['s'] || keys['d'] ||
    keys['arrowup'] || keys['arrowdown'] || keys['arrowleft'] || keys['arrowright']);
  const t = G.time;
  const stride = moving ? Math.sin(t * 11) : 0;
  const bob = moving ? Math.abs(Math.cos(t * 11)) * 1.5 : Math.sin(t * 2.2) * 0.7;
  const face = Math.cos(p.dir) >= 0 ? 1 : -1;
  const flash = p.hurtT > 0;
  const skin = flash ? '#ffb0a0' : '#d8b890';
  const swing = p.swingT > 0 ? Math.sin((0.22 - p.swingT) / 0.22 * Math.PI) : 0;

  // shadow
  ctx.fillStyle = '#00000066';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 13, 12, 4.5, 0, 0, 7); ctx.fill();

  ctx.save();
  ctx.translate(p.x, p.y - bob);
  ctx.scale(face, 1); // mirror the whole body when facing left

  const legs = (pants, boots) => {
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const off = stride * 4.2 * s;
      ctx.strokeStyle = pants; ctx.lineWidth = 3.8;
      ctx.beginPath(); ctx.moveTo(s * 2.8, 3); ctx.lineTo(s * 2.8 + off, 10.5); ctx.stroke();
      ctx.fillStyle = boots;
      ctx.fillRect(s * 2.8 + off - 2, 9.2, 5.4, 3.6);
    }
  };

  if (p.cls === 'warrior') {
    /* flowing cape behind */
    ctx.fillStyle = flash ? '#c86a5a' : '#7a1a12';
    ctx.beginPath();
    ctx.moveTo(-1, -9);
    ctx.quadraticCurveTo(-12 - stride * 1.5, -2, -9 - stride * 2.5, 11);
    ctx.quadraticCurveTo(-4, 7.5, -1, 5);
    ctx.closePath(); ctx.fill();
    legs('#3a2c20', flash ? '#a86a5a' : '#4a3826');
    /* plate torso */
    const g = ctx.createLinearGradient(0, -9, 0, 7);
    g.addColorStop(0, flash ? '#e8a89a' : '#aab0bc');
    g.addColorStop(0.55, flash ? '#c8887a' : '#7a8290');
    g.addColorStop(1, flash ? '#a86a5a' : '#4e545e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6.5, 6);
    ctx.quadraticCurveTo(-8.5, -6, 0, -9.5);
    ctx.quadraticCurveTo(8.5, -6, 6.5, 6);
    ctx.quadraticCurveTo(0, 8.5, -6.5, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(0, 5.5); ctx.stroke();
    /* belt & buckle */
    ctx.fillStyle = '#3c2c1a'; ctx.fillRect(-6.6, 3.4, 13.2, 3);
    ctx.fillStyle = '#c9a45a'; ctx.fillRect(-1.6, 3.7, 3.2, 2.4);
    /* round shield on the off-hand */
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath(); ctx.arc(-8.5, -1.5, 6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a909c'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = '#00000055'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(-8.5, -1.5, 4, 0, 7); ctx.stroke();
    ctx.fillStyle = '#9aa0ac';
    ctx.beginPath(); ctx.arc(-8.5, -1.5, 2.1, 0, 7); ctx.fill();
    /* pauldrons */
    ctx.fillStyle = flash ? '#e8a89a' : '#8e94a0';
    ctx.strokeStyle = '#2c3038'; ctx.lineWidth = 0.8;
    for (const sx of [-6.2, 6.2]) {
      ctx.beginPath(); ctx.arc(sx, -7.5, 3.6, 0, 7); ctx.fill(); ctx.stroke();
    }
    /* head, helm with cheek & nose guards, crest */
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, -14.5, 5, 0, 7); ctx.fill();
    ctx.fillStyle = flash ? '#e8a89a' : '#9aa0ac';
    ctx.beginPath(); ctx.arc(0, -15.5, 5.6, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
    ctx.fillRect(-5.5, -16, 2.4, 6);
    ctx.fillRect(3.1, -16, 2.4, 6);
    ctx.fillRect(-0.8, -15.5, 1.6, 3.8);
    ctx.fillStyle = '#20140a';
    ctx.fillRect(-3, -14.2, 1.8, 1.7);
    ctx.fillRect(1.3, -14.2, 1.8, 1.7);
    ctx.fillStyle = '#a3130b';
    ctx.beginPath();
    ctx.moveTo(-4.5, -19);
    ctx.quadraticCurveTo(0, -24.5, 4.5, -19);
    ctx.quadraticCurveTo(0, -21, -4.5, -19);
    ctx.closePath(); ctx.fill();
    /* sword arm */
    ctx.save();
    ctx.translate(6, -4.5);
    ctx.rotate(-0.55 + swing * 1.7);
    ctx.strokeStyle = skin; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4.5, 1.5); ctx.stroke();
    ctx.translate(5, 1.5); ctx.rotate(0.1);
    ctx.fillStyle = '#2c2018'; ctx.fillRect(-4.6, -1.1, 4, 2.2);
    ctx.fillStyle = '#c9a45a';
    ctx.beginPath(); ctx.arc(-5.2, 0, 1.5, 0, 7); ctx.fill();
    ctx.fillRect(-1, -3.6, 2, 7.2);
    ctx.fillStyle = '#ccd2da';
    ctx.beginPath();
    ctx.moveTo(1, -2); ctx.lineTo(14.5, -1); ctx.lineTo(17.5, 0); ctx.lineTo(14.5, 1); ctx.lineTo(1, 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(1.5, 0); ctx.lineTo(14.5, 0); ctx.stroke();
    ctx.restore();
    /* swing trail */
    if (swing > 0.1) {
      ctx.strokeStyle = 'rgba(232,217,168,' + (0.55 * swing).toFixed(3) + ')';
      ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(6, -4.5, 20, -1.35 + swing * 0.2, -1.35 + swing * 1.9); ctx.stroke();
    }

  } else if (p.cls === 'sorceress') {
    /* full-length robe, hem sways with stride */
    const g = ctx.createLinearGradient(0, -10, 0, 11);
    g.addColorStop(0, flash ? '#c86a5a' : '#3a4a9a');
    g.addColorStop(1, flash ? '#8a4a3a' : '#141c4a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8 - stride * 1.4, 11);
    ctx.quadraticCurveTo(-7.5, -7, 0, -10);
    ctx.quadraticCurveTo(7.5, -7, 8 + stride * 1.4, 11);
    ctx.quadraticCurveTo(0, 8.6, -8 - stride * 1.4, 11);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c9a45a'; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7.4 - stride * 1.4, 10);
    ctx.quadraticCurveTo(0, 7.8, 7.4 + stride * 1.4, 10);
    ctx.stroke();
    /* sash */
    ctx.strokeStyle = '#c9a45a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-5.2, 1.5); ctx.quadraticCurveTo(0, 3.2, 5.2, 1.5); ctx.stroke();
    /* hood with face peeking out */
    const hoodC = flash ? '#c86a5a' : '#28347a';
    ctx.fillStyle = hoodC;
    ctx.beginPath(); ctx.arc(-0.8, -14.6, 5.9, 0, 7); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-3.5, -19);
    ctx.quadraticCurveTo(-9, -12, -6, -5.5);
    ctx.quadraticCurveTo(-4.5, -9, -3.5, -11);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(1.4, -13.8, 3.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(-0.4, -14.4, 1.6, 1.6);
    ctx.fillRect(2.4, -14.4, 1.6, 1.6);
    ctx.strokeStyle = hoodC; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(1, -14, 4.7, Math.PI * 0.75, Math.PI * 1.9); ctx.stroke();
    /* staff arm + glowing orb staff */
    ctx.save();
    ctx.translate(6.5, -3);
    ctx.rotate(swing * 0.5);
    ctx.strokeStyle = skin; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(3, 1); ctx.stroke();
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(4.5, -13); ctx.stroke();
    const pulse = 2.9 + Math.sin(t * 3.2) * 0.5;
    const halo = ctx.createRadialGradient(4.8, -15, 0, 4.8, -15, pulse * 2.6);
    halo.addColorStop(0, 'rgba(143,179,255,0.85)');
    halo.addColorStop(1, 'rgba(143,179,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(4.8, -15, pulse * 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#8fb3ff';
    ctx.beginPath(); ctx.arc(4.8, -15, pulse, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8f2ff';
    ctx.beginPath(); ctx.arc(4, -15.8, pulse * 0.4, 0, 7); ctx.fill();
    ctx.restore();

  } else { /* huntress */
    /* short cape */
    ctx.fillStyle = flash ? '#c86a5a' : '#243c1e';
    ctx.beginPath();
    ctx.moveTo(-1, -9);
    ctx.quadraticCurveTo(-10 - stride * 1.2, -3, -7 - stride * 2, 7);
    ctx.quadraticCurveTo(-3, 5, -1, 3);
    ctx.closePath(); ctx.fill();
    /* quiver on the back */
    ctx.save();
    ctx.translate(-6, -6); ctx.rotate(0.5);
    ctx.fillStyle = '#4a3020'; ctx.fillRect(-2, -6, 4, 10);
    ctx.fillStyle = '#a3130b';
    ctx.fillRect(-1.7, -8.6, 1.4, 2.8); ctx.fillRect(0.4, -9.4, 1.4, 3.4);
    ctx.restore();
    legs('#2c3a24', flash ? '#a86a5a' : '#4a3826');
    /* leather torso */
    const g = ctx.createLinearGradient(0, -9, 0, 7);
    g.addColorStop(0, flash ? '#e8a89a' : '#7a5634');
    g.addColorStop(1, flash ? '#a86a5a' : '#3c2a18');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5.5, 6);
    ctx.quadraticCurveTo(-7.5, -6, 0, -9.5);
    ctx.quadraticCurveTo(7.5, -6, 5.5, 6);
    ctx.quadraticCurveTo(0, 8, -5.5, 6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#241608'; ctx.lineWidth = 0.8; ctx.stroke();
    /* chest strap */
    ctx.strokeStyle = '#2c2018'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-4.4, -7.5); ctx.lineTo(4.6, 3.5); ctx.stroke();
    ctx.fillStyle = '#3c2c1a'; ctx.fillRect(-5.6, 3.4, 11.2, 2.8);
    /* hooded head with ponytail, face peeking out */
    ctx.fillStyle = flash ? '#c88a6a' : '#6a4224';   // ponytail behind
    ctx.beginPath();
    ctx.moveTo(-4, -16);
    ctx.quadraticCurveTo(-9 - stride, -10, -6.5 - stride * 1.6, -3);
    ctx.quadraticCurveTo(-5, -8, -4.5, -12);
    ctx.closePath(); ctx.fill();
    const hoodC = flash ? '#c86a5a' : '#2e4a2a';
    ctx.fillStyle = hoodC;
    ctx.beginPath(); ctx.arc(-0.8, -14.4, 5.8, 0, 7); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(1.4, -13.6, 3.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(-0.4, -14.2, 1.6, 1.6);
    ctx.fillRect(2.4, -14.2, 1.6, 1.6);
    ctx.strokeStyle = hoodC; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(1, -13.8, 4.7, Math.PI * 0.75, Math.PI * 1.9); ctx.stroke();
    /* bow arm: recurve bow, string, nocked arrow while attacking */
    ctx.save();
    ctx.translate(7, -4);
    ctx.rotate(swing * 0.25);
    ctx.strokeStyle = skin; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1.5, 0); ctx.lineTo(2.5, 0.5); ctx.stroke();
    ctx.strokeStyle = '#7a5a30'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(3, 0.5, 10, -1.25, 1.25); ctx.stroke();
    ctx.strokeStyle = '#d8cdb4'; ctx.lineWidth = 0.8;
    const bx = 3 + Math.cos(1.25) * 10, by1 = 0.5 - Math.sin(1.25) * 10, by2 = 0.5 + Math.sin(1.25) * 10;
    const pull = swing * 4;
    ctx.beginPath(); ctx.moveTo(bx, by1); ctx.lineTo(3 - pull, 0.5); ctx.lineTo(bx, by2); ctx.stroke();
    if (swing > 0.05) {
      ctx.strokeStyle = '#c9b98a'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(3 - pull, 0.5); ctx.lineTo(12, 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawMonster(m) {
  const t = m.type, rr = m.r;
  const time = G.time;
  const ph = m.x * 0.13 + m.y * 0.07;
  const moving = m.aggro && m.stunT <= 0;
  const stride = moving ? Math.sin(time * 9 + ph) : 0;
  const bob = moving ? Math.abs(Math.cos(time * 9 + ph)) * rr * 0.08 : Math.sin(time * 2.6 + ph) * rr * 0.05;
  const face = Math.cos(m.dir) >= 0 ? 1 : -1;
  const hurt = m.hurtT > 0;
  const W = c => hurt ? '#ffffff' : c;

  // shadow + champion/boss ground ring
  ctx.fillStyle = '#00000066';
  ctx.beginPath(); ctx.ellipse(m.x, m.y + rr * 0.8, rr * 0.9, rr * 0.35, 0, 0, 7); ctx.fill();
  if (m.champ || m.boss) {
    ctx.strokeStyle = m.boss ? '#ff5a3aa8' : '#ffd76aa8';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(m.x, m.y + rr * 0.8, rr * 1.15 + Math.sin(time * 4) * 1.2, rr * 0.45, 0, 0, 7); ctx.stroke();
  }

  ctx.save();
  ctx.translate(m.x, m.y - bob);
  ctx.scale(face, 1);
  ctx.lineCap = 'round';

  if (t.id === 'skel' || t.id === 'archer') {
    /* -------- skeleton / bone archer -------- */
    ctx.scale(rr / 13, rr / 13);
    ctx.strokeStyle = W('#cfc9b8'); ctx.lineWidth = 2.6;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 3, 1); ctx.lineTo(sd * 3 + stride * 4 * sd, 10); ctx.stroke();
    }
    ctx.fillStyle = W('#b8b2a0');
    ctx.fillRect(-4, -1, 8, 3);
    ctx.strokeStyle = W('#cfc9b8'); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -11); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, -9.5 + i * 2.7, 4.6 - i * 0.5, 0.15, Math.PI - 0.15); ctx.stroke();
    }
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(5, -11); ctx.stroke();
    ctx.lineWidth = 2.2;   // rear arm swings
    ctx.beginPath(); ctx.moveTo(-5, -11); ctx.lineTo(-6.5, -4 + stride * 1.5); ctx.stroke();
    // skull
    ctx.fillStyle = W('#e0dbcc');
    ctx.beginPath(); ctx.arc(0, -16, 4.6, 0, 7); ctx.fill();
    ctx.fillRect(-2.6, -12.8, 5.2, 2.4);
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(-2.9, -17.2, 2.1, 2.1); ctx.fillRect(0.9, -17.2, 2.1, 2.1);
    ctx.fillRect(-0.5, -14.4, 1, 1.3);
    ctx.fillStyle = '#c83a2a';
    ctx.fillRect(-2.3, -16.6, 0.9, 0.9); ctx.fillRect(1.5, -16.6, 0.9, 0.9);
    ctx.strokeStyle = '#1a1008'; ctx.lineWidth = 0.6;    // jaw teeth lines
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 1.4, -12.6); ctx.lineTo(i * 1.4, -10.8); ctx.stroke(); }
    // weapon arm
    ctx.strokeStyle = W('#cfc9b8'); ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(5, -11); ctx.lineTo(8.5, -6.5); ctx.stroke();
    if (t.id === 'archer') {
      ctx.strokeStyle = W('#6a4a26'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(9, -6.5, 8, -1.2, 1.2); ctx.stroke();
      ctx.strokeStyle = '#d8cdb4'; ctx.lineWidth = 0.7;
      const ex = 9 + Math.cos(1.2) * 8, ey1 = -6.5 - Math.sin(1.2) * 8, ey2 = -6.5 + Math.sin(1.2) * 8;
      ctx.beginPath(); ctx.moveTo(ex, ey1); ctx.lineTo(9, -6.5); ctx.lineTo(ex, ey2); ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(8.5, -6.5); ctx.rotate(-0.55 + stride * 0.15);
      ctx.fillStyle = W('#5a4a32'); ctx.fillRect(-2, -1, 4, 2);
      ctx.fillStyle = W('#8a8378');
      ctx.beginPath(); ctx.moveTo(-1.1, -1); ctx.lineTo(-0.4, -10.5); ctx.lineTo(0.4, -10.5); ctx.lineTo(1.1, -1);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

  } else if (t.id === 'zombie') {
    /* -------- shambling zombie -------- */
    ctx.scale(rr / 14, rr / 14);
    ctx.strokeStyle = W('#4a5a3a'); ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(2.5, 2); ctx.lineTo(2.5 + stride * 3.5, 10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2.5, 2); ctx.lineTo(-4.5 - stride * 1.2, 10.5); ctx.stroke(); // dragging leg
    const g = ctx.createLinearGradient(0, -9, 0, 6);
    g.addColorStop(0, W('#6a8a4a')); g.addColorStop(1, W('#42542c'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6, 4);
    ctx.quadraticCurveTo(-8, -6, -1, -9);
    ctx.quadraticCurveTo(7.5, -7, 6, 4);
    ctx.quadraticCurveTo(0, 6.5, -6, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#4a3a2c');   // torn rags
    ctx.beginPath(); ctx.moveTo(-5.5, -2); ctx.lineTo(2, -3.5); ctx.lineTo(3, 1); ctx.lineTo(-1, 3.5); ctx.lineTo(-5.5, 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#7a1a12');   // open wound
    ctx.beginPath(); ctx.ellipse(3.4, -3.4, 1.7, 2.3, 0.4, 0, 7); ctx.fill();
    // both arms reaching forward
    ctx.strokeStyle = W('#6a8a4a'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(11, -5 + stride * 1.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(10.5, -1 - stride * 1.4); ctx.stroke();
    ctx.fillStyle = W('#8aa668');
    ctx.beginPath(); ctx.arc(11.3, -5 + stride * 1.4, 1.7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(10.8, -1 - stride * 1.4, 1.7, 0, 7); ctx.fill();
    // lolling head
    ctx.save();
    ctx.translate(1, -11); ctx.rotate(0.22);
    ctx.fillStyle = W('#7a9a58');
    ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#141008';
    ctx.fillRect(-2.5, -1.2, 1.8, 1.4); ctx.fillRect(0.9, -1.2, 1.8, 1.4);
    ctx.fillStyle = '#d8d8c0';
    ctx.fillRect(-2, -0.9, 0.8, 0.8);   // one milky eye
    ctx.fillStyle = '#2a1410';
    ctx.fillRect(-1.2, 1.6, 3.2, 1.8);  // gaping mouth
    ctx.restore();

  } else if (t.id === 'fallen') {
    /* -------- fallen imp -------- */
    ctx.scale(rr / 11, rr / 11);
    ctx.strokeStyle = W('#c0392b'); ctx.lineWidth = 2;   // whipping tail
    ctx.beginPath();
    ctx.moveTo(-3, 3);
    ctx.quadraticCurveTo(-9, 2 + Math.sin(time * 7 + ph) * 2, -12, -3 + Math.sin(time * 7 + ph) * 3);
    ctx.stroke();
    ctx.strokeStyle = W('#a02a1e'); ctx.lineWidth = 2.4;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 2, 4); ctx.lineTo(sd * 2 + stride * 3 * sd, 9.5); ctx.stroke();
    }
    ctx.fillStyle = W('#c0392b');   // crouched body
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(-6, -4, 0, -5.5);
    ctx.quadraticCurveTo(6, -4, 5, 4);
    ctx.quadraticCurveTo(0, 6, -5, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#d87a4a');   // belly
    ctx.beginPath(); ctx.ellipse(0.6, 0.2, 2.8, 3.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = W('#c0392b');   // big head
    ctx.beginPath(); ctx.arc(1, -8.5, 4.2, 0, 7); ctx.fill();
    ctx.beginPath();                // pointed ear
    ctx.moveTo(-2.6, -9.5); ctx.lineTo(-6.5, -11.5); ctx.lineTo(-2.8, -7.2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = W('#e8d9a8'); ctx.lineWidth = 1.6;   // horn nubs
    ctx.beginPath(); ctx.moveTo(-1, -12.2); ctx.lineTo(-2, -14.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -12.2); ctx.lineTo(4, -14.5); ctx.stroke();
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(-0.7, -9.8, 1.7, 1.7); ctx.fillRect(2.3, -9.8, 1.7, 1.7);
    ctx.strokeStyle = '#2a1410'; ctx.lineWidth = 1;   // wicked grin
    ctx.beginPath(); ctx.arc(1.4, -7.6, 2.2, 0.3, Math.PI - 0.6); ctx.stroke();
    ctx.strokeStyle = W('#9a938a'); ctx.lineWidth = 1.8;   // crude dagger
    ctx.beginPath(); ctx.moveTo(5.5, -2); ctx.lineTo(9.5, -5.5); ctx.stroke();

  } else if (t.id === 'ghoul') {
    /* -------- lanky ghoul -------- */
    ctx.scale(rr / 14, rr / 14);
    const g = ctx.createLinearGradient(0, -10, 0, 7);
    g.addColorStop(0, W('#7a5a8a')); g.addColorStop(1, W('#4a3458'));
    ctx.fillStyle = g;   // hunched body leaning forward
    ctx.beginPath();
    ctx.moveTo(-6, 5);
    ctx.quadraticCurveTo(-9, -8, 0, -10);
    ctx.quadraticCurveTo(8, -8.5, 5.5, -1);
    ctx.quadraticCurveTo(7, 3, 5.5, 5);
    ctx.quadraticCurveTo(0, 7, -6, 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#5a4468');   // back spines
    for (const [sx, sy] of [[-5.4, -6.5], [-3, -8.8], [0.2, -9.8]]) {
      ctx.beginPath(); ctx.moveTo(sx - 1.2, sy + 1.5); ctx.lineTo(sx, sy - 2.6); ctx.lineTo(sx + 1.4, sy + 1.2);
      ctx.closePath(); ctx.fill();
    }
    // long clawed arms
    ctx.strokeStyle = W('#8a6a9a'); ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(4, -5); ctx.quadraticCurveTo(9, -2, 10 + stride, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -3); ctx.quadraticCurveTo(7, 2, 8 - stride, 7); ctx.stroke();
    ctx.strokeStyle = W('#e8e4da'); ctx.lineWidth = 1.1;
    for (const k of [-1, 0, 1]) {
      ctx.beginPath(); ctx.moveTo(10 + stride, 6); ctx.lineTo(10 + stride + 2 + k * 0.8, 8.5 + k); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8 - stride, 7); ctx.lineTo(8 - stride + 2 + k * 0.8, 9.5 + k); ctx.stroke();
    }
    // head thrust forward
    ctx.fillStyle = W('#8a6a9a');
    ctx.beginPath(); ctx.arc(4, -11, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#baffd8';
    ctx.fillRect(2.4, -12.4, 1.6, 1.4); ctx.fillRect(5.2, -12.4, 1.6, 1.4);
    ctx.fillStyle = '#1a0c14';   // wide maw
    ctx.fillRect(1.8, -9.8, 5.2, 2.2);
    ctx.fillStyle = '#e8e4da';
    for (let i = 0; i < 3; i++) ctx.fillRect(2.4 + i * 1.7, -9.8, 0.8, 1);

  } else {
    /* -------- hell brute / boss demon -------- */
    ctx.scale(rr / 20, rr / 20);
    const boss = m.boss;
    ctx.strokeStyle = W('#6a2014'); ctx.lineWidth = 5.5;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 5, 6); ctx.lineTo(sd * 5 + stride * 4 * sd, 15); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -13, 0, 10);
    g.addColorStop(0, W(boss ? '#c04028' : '#a03a24'));
    g.addColorStop(1, W(boss ? '#601410' : '#5a1810'));
    ctx.fillStyle = g;   // massive torso
    ctx.beginPath();
    ctx.moveTo(-11, 8);
    ctx.quadraticCurveTo(-14, -10, 0, -13);
    ctx.quadraticCurveTo(14, -10, 11, 8);
    ctx.quadraticCurveTo(0, 11, -11, 8);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-10, -8.5, 5, 0, 7); ctx.fill();   // shoulder humps
    ctx.beginPath(); ctx.arc(10, -8.5, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#d8a06a'); ctx.lineWidth = 1.8;   // belly plates
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, -1 + i * 3.4, 7.4 - i * 1.1, 0.45, Math.PI - 0.45); ctx.stroke();
    }
    // heavy arms with fists
    ctx.strokeStyle = W('#8a2c1a'); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(15, 2 + stride * 2.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-10, -8); ctx.lineTo(-15, 2 - stride * 2.5); ctx.stroke();
    ctx.fillStyle = W('#6a2014');
    ctx.beginPath(); ctx.arc(15.4, 3.4 + stride * 2.5, 3.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(-15.4, 3.4 - stride * 2.5, 3.4, 0, 7); ctx.fill();
    // head
    ctx.fillStyle = W('#7a2416');
    ctx.beginPath(); ctx.arc(0, -16, 5.5, 0, 7); ctx.fill();
    // curved horns
    ctx.fillStyle = W('#e8d9a8');
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 3.5, -19);
      ctx.quadraticCurveTo(sd * 9, -22, sd * 10, -28);
      ctx.quadraticCurveTo(sd * 6, -24, sd * 2.5, -20.5);
      ctx.closePath(); ctx.fill();
      if (boss) {   // second horn pair for the boss
        ctx.beginPath();
        ctx.moveTo(sd * 1.5, -20.5);
        ctx.quadraticCurveTo(sd * 3, -25, sd * 2, -28.5);
        ctx.quadraticCurveTo(sd * 0.8, -24.5, sd * 0.4, -21);
        ctx.closePath(); ctx.fill();
      }
    }
    // glowing eyes + tusks
    if (boss) {
      const eg = ctx.createRadialGradient(0, -16.5, 0, 0, -16.5, 7);
      eg.addColorStop(0, 'rgba(255,225,77,0.5)'); eg.addColorStop(1, 'rgba(255,225,77,0)');
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(0, -16.5, 7, 0, 7); ctx.fill();
    }
    ctx.fillStyle = boss ? '#ffe14d' : '#ff3a2a';
    ctx.fillRect(-3, -17.4, 2.1, 2.1); ctx.fillRect(0.9, -17.4, 2.1, 2.1);
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.moveTo(-2.8, -12.4); ctx.lineTo(-2, -10.2); ctx.lineTo(-1.2, -12.4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1.2, -12.4); ctx.lineTo(2, -10.2); ctx.lineTo(2.8, -12.4); ctx.closePath(); ctx.fill();
  }

  ctx.restore();

  // slow tint
  if (m.slowT > 0) {
    ctx.fillStyle = '#9adcff44';
    ctx.beginPath(); ctx.arc(m.x, m.y - m.r * 0.4, m.r, 0, 7); ctx.fill();
  }
  // stun stars
  if (m.stunT > 0) {
    ctx.fillStyle = '#ffe9b0';
    for (let k = 0; k < 3; k++) {
      const a = G.time * 5 + k * 2.1;
      ctx.fillRect(m.x + Math.cos(a) * 10 - 1, m.y - m.r * 1.6 + Math.sin(a) * 3 - 1, 2.4, 2.4);
    }
  }
  // hp bar when recently hit
  if (m.hitT < 4 && m.hp < m.maxHp) {
    const w = m.r * 2.2;
    ctx.fillStyle = '#000000aa'; ctx.fillRect(m.x - w / 2 - 1, m.y - m.r * 1.9 - 1, w + 2, 5);
    ctx.fillStyle = '#5a0f0a'; ctx.fillRect(m.x - w / 2, m.y - m.r * 1.9, w, 3);
    ctx.fillStyle = m.champ || m.boss ? '#ffd76a' : '#c8281e';
    ctx.fillRect(m.x - w / 2, m.y - m.r * 1.9, w * clamp(m.hp / m.maxHp, 0, 1), 3);
  }
  // target indicator
  if (G.p.target === m) {
    ctx.strokeStyle = '#ff8a5a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 5 + Math.sin(G.time * 7) * 1.5, 0, 7); ctx.stroke();
  }
}

function drawMinimap() {
  const s = 124 * DPR / Math.max(MAP_W, MAP_H);
  mmCtx.setTransform(1, 0, 0, 1, 0, 0);
  mmCtx.clearRect(0, 0, mmCvs.width, mmCvs.height);
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (!G.lvl.seen[ty * MAP_W + tx]) continue;
    const t = G.lvl.map[ty][tx];
    if (t === T_WALL) continue;
    mmCtx.fillStyle = t === T_DOWN ? (G.lvl.locked ? '#c8281e' : '#ffd76a') : t === T_UP ? '#8fb3ff' : '#5a4a34';
    mmCtx.fillRect(tx * s, ty * s, Math.max(1.5, s), Math.max(1.5, s));
  }
  // player
  mmCtx.fillStyle = '#fff';
  mmCtx.fillRect(G.p.x / TILE * s - 2, G.p.y / TILE * s - 2, 4, 4);
  // aggroed monsters
  mmCtx.fillStyle = '#ff5a3a';
  for (const m of G.lvl.monsters) if (m.hp > 0 && m.aggro) mmCtx.fillRect(m.x / TILE * s - 1.5, m.y / TILE * s - 1.5, 3, 3);
}

/* ---------------- HUD & panels ---------------- */
const rarityColor = r => ({ common: '#e8e4da', magic: '#7f95e8', rare: '#e8d45a', unique: '#d98d4a' }[r]);

function buildSkillbar() {
  const c = CLASSES[G.p.cls];
  for (let i = 0; i < 2; i++) {
    const btn = $('btnSkill' + (i + 1)), sk = c.skills[i];
    btn.querySelector('.sicon').textContent = sk.icon;
    btn.querySelector('.cost').textContent = sk.mana;
    btn.title = sk.name + ' — ' + sk.desc;
  }
}
function updateHUD() {
  if (!G) return;
  const p = G.p, d = G.d;
  $('hpFill').style.height = clamp(p.hp / d.maxHp * 100, 0, 100) + '%';
  $('mpFill').style.height = clamp(p.mp / d.maxMp * 100, 0, 100) + '%';
  $('hpText').textContent = Math.ceil(p.hp);
  $('mpText').textContent = Math.ceil(p.mp);
  $('xpFill').style.width = clamp(p.xp / xpNext(p.level) * 100, 0, 100) + '%';
  $('goldLabel').textContent = '🪙 ' + p.gold;
  $('hpPotCount').textContent = p.potions.hp;
  $('mpPotCount').textContent = p.potions.mp;
  const c = CLASSES[p.cls];
  for (let i = 0; i < 2; i++) {
    const btn = $('btnSkill' + (i + 1)), sk = c.skills[i];
    btn.querySelector('.cdmask').style.height = (p.cd[i] / sk.cd * 100) + '%';
    btn.classList.toggle('nomana', p.mp < sk.mana);
  }
}
function updateBadge() {
  $('charBadge').classList.toggle('hidden', !G || G.p.statPts <= 0);
}

/* panels */
function anyPanelOpen() {
  return ['charPanel', 'invPanel', 'pausePanel'].some(id => !$(id).classList.contains('hidden')) || !$('itemPopup').classList.contains('hidden');
}
function closePanels() {
  ['charPanel', 'invPanel', 'pausePanel', 'itemPopup'].forEach(id => $(id).classList.add('hidden'));
  paused = false;
}
function togglePanel(id) {
  const el = $(id), wasOpen = !el.classList.contains('hidden');
  closePanels();
  if (!wasOpen) {
    el.classList.remove('hidden');
    if (id === 'charPanel') renderChar();
    if (id === 'invPanel') renderInv();
    if (id === 'pausePanel') renderPause();
    paused = true;
  }
}

function renderChar() {
  const p = G.p, d = G.d, c = CLASSES[p.cls];
  const row = (key, label) =>
    `<div class="statrow"><span class="sname">${label}${c.primary === key ? ' ★' : ''}</span><span class="sval">${d[key]}</span>
     <button class="statbtn" data-stat="${key}" ${p.statPts <= 0 ? 'disabled' : ''}>+</button></div>`;
  $('charPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">${c.icon} ${c.name} — Level ${p.level}</div>
    <div class="ptsleft">${p.statPts > 0 ? p.statPts + ' stat points to spend' : 'No points to spend'}</div>
    ${row('str', 'Strength')}${row('dex', 'Dexterity')}${row('vit', 'Vitality')}${row('ene', 'Energy')}
    <div class="derived">
      Damage: <b>${d.dmgLo}–${d.dmgHi}</b> · Armor: <b>${d.armor}</b> · Crit: <b>${Math.round(d.crit * 100)}%</b><br>
      Life: <b>${Math.ceil(p.hp)}/${d.maxHp}</b> · Mana: <b>${Math.ceil(p.mp)}/${d.maxMp}</b><br>
      Magic Find: <b>+${d.mf}%</b> · Life Steal: <b>${Math.round(d.leech * 100)}%</b><br>
      Experience: <b>${p.xp} / ${xpNext(p.level)}</b> · Deaths: <b>${p.deaths}</b>
    </div>`;
  $('charPanel').querySelectorAll('.statbtn').forEach(b => b.addEventListener('click', () => {
    if (G.p.statPts <= 0) return;
    G.p.statPts--; G.p.stats[b.dataset.stat]++;
    recalc(); renderChar(); updateBadge(); updateHUD(); saveDirty = true;
  }));
  $('charPanel').querySelector('[data-close]').addEventListener('click', closePanels);
}

function renderInv() {
  const p = G.p;
  const gambleCost = 120 + G.dlvl * 45;
  const potCost = 25 + G.dlvl * 6;
  const eqSlot = s => {
    const it = p.equip[s];
    return `<button class="islot eq ${it ? 'r-' + it.rarity : ''}" data-eq="${s}">${it ? it.icon : ''}<span class="slotlabel">${s}</span></button>`;
  };
  let grid = '';
  for (let i = 0; i < 24; i++) {
    const it = p.inv[i];
    grid += `<button class="islot ${it ? 'r-' + it.rarity : ''}" data-inv="${i}">${it ? it.icon : ''}</button>`;
  }
  $('invPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🎒 Inventory · 🪙 ${p.gold}</div>
    <div class="equipgrid">${SLOTS.map(eqSlot).join('')}</div>
    <div class="invactions">
      <button class="smallbtn" data-buy="hp" ${p.gold < potCost ? 'disabled' : ''}>🧪 Potion (${potCost}g)</button>
      <button class="smallbtn" data-buy="mp" ${p.gold < potCost ? 'disabled' : ''}>🔮 Potion (${potCost}g)</button>
      <button class="smallbtn" data-gamble ${p.gold < gambleCost ? 'disabled' : ''}>🎲 Gamble (${gambleCost}g)</button>
    </div>
    <div class="invgrid">${grid}</div>`;
  $('invPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('invPanel').querySelectorAll('[data-inv]').forEach(b => b.addEventListener('click', () => {
    const it = p.inv[+b.dataset.inv];
    if (it) showItemPopup(it, +b.dataset.inv, false);
  }));
  $('invPanel').querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', () => {
    const it = p.equip[b.dataset.eq];
    if (it) showItemPopup(it, b.dataset.eq, true);
  }));
  $('invPanel').querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
    if (p.gold < potCost) return;
    p.gold -= potCost; p.potions[b.dataset.buy]++;
    sfx.gold(); renderInv(); updateHUD(); saveDirty = true;
  }));
  const gb = $('invPanel').querySelector('[data-gamble]');
  gb.addEventListener('click', () => {
    if (p.gold < gambleCost || p.inv.length >= 24) return;
    p.gold -= gambleCost;
    const it = makeItem(choice(SLOTS), Math.max(1, G.dlvl), Math.random() < 0.08 ? 'unique' : Math.random() < 0.4 ? 'rare' : 'magic');
    p.inv.push(it);
    sfx.pickup(); renderInv(); updateHUD(); saveDirty = true;
    showItemPopup(it, p.inv.length - 1, false);
  });
}

function showItemPopup(it, ref, equipped) {
  const p = G.p;
  const pop = $('itemPopup');
  pop.innerHTML = `
    <div class="iname rc-${it.rarity}">${it.icon} ${it.name}</div>
    <div class="ibase">${it.base !== it.name ? it.base + ' · ' : ''}${it.slot} · item level ${it.lvl}</div>
    <div class="imods">${modLines(it).join('<br>') || '<i>no properties</i>'}</div>
    <div class="ibtns">
      ${equipped
        ? `<button class="smallbtn" data-act="unequip">Unequip</button>`
        : `<button class="smallbtn" data-act="equip">Equip</button>
           <button class="smallbtn" data-act="sell">Sell ${sellPrice(it)}g</button>`}
      <button class="smallbtn" data-act="close">Close</button>
    </div>`;
  pop.classList.remove('hidden');
  pop.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const act = b.dataset.act;
    if (act === 'equip') {
      const old = p.equip[it.slot];
      p.equip[it.slot] = it;
      p.inv.splice(ref, 1);
      if (old) p.inv.push(old);
      recalc(); sfx.pickup();
    } else if (act === 'unequip') {
      if (p.inv.length >= 24) { ftext(p.x, p.y - 30, 'Inventory full!', '#ff8a7a', 13); }
      else { p.inv.push(it); p.equip[ref] = null; recalc(); }
    } else if (act === 'sell') {
      p.gold += sellPrice(it);
      p.inv.splice(ref, 1);
      sfx.gold();
    }
    pop.classList.add('hidden');
    saveDirty = true;
    renderInv(); updateHUD(); updateBadge();
  }));
}

function renderPause() {
  $('pausePanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">☰ Menu</div>
    <div class="invactions" style="flex-direction:column">
      <button class="smallbtn" data-close>▶ Resume</button>
      <button class="smallbtn" data-snd>${soundOn ? '🔊 Sound: ON' : '🔇 Sound: OFF'}</button>
      <button class="smallbtn" data-quit>💾 Save & Main Menu</button>
      <button class="smallbtn" data-newchar style="color:#ff8a7a">☠ Abandon Hero (new character)</button>
    </div>
    <div class="derived" style="text-align:center">
      Tap to move & attack · hold to run<br>Keyboard: WASD move · 1/2 skills · Q/E potions · I/C panels
    </div>`;
  $('pausePanel').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  $('pausePanel').querySelector('[data-snd]').addEventListener('click', () => { soundOn = !soundOn; saveDirty = true; renderPause(); });
  $('pausePanel').querySelector('[data-quit]').addEventListener('click', () => { saveGame(); toMenu(); });
  $('pausePanel').querySelector('[data-newchar]').addEventListener('click', () => {
    if (confirm('Abandon this hero forever? Your save will be deleted.')) {
      localStorage.removeItem(SAVE_KEY);
      toMenu();
    }
  });
}

function toMenu() {
  closePanels();
  G = null;
  $('topbar').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('deathScreen').classList.add('hidden');
  $('menuScreen').classList.remove('hidden');
  refreshMenu();
}

function refreshMenu() {
  const save = loadSave();
  const btn = $('btnContinue');
  if (save) {
    btn.classList.remove('hidden');
    btn.textContent = '▶ Continue — ' + CLASSES[save.cls].name + ' Lv.' + save.level + ' (floor ' + save.dlvl + ')';
  } else btn.classList.add('hidden');
}

/* ---------------- input ---------------- */
const pointer = { down: false, drag: false, x: 0, y: 0, sx: 0, sy: 0, t: 0 };

cvs.addEventListener('pointerdown', e => {
  audioInit();
  if (!G || paused || G.p.hp <= 0) return;
  pointer.down = true; pointer.drag = false;
  pointer.x = pointer.sx = e.clientX; pointer.y = pointer.sy = e.clientY;
  pointer.t = performance.now();
  cvs.setPointerCapture(e.pointerId);
});
cvs.addEventListener('pointermove', e => {
  if (!pointer.down) return;
  pointer.x = e.clientX; pointer.y = e.clientY;
  if (!pointer.drag && dist(pointer.sx, pointer.sy, pointer.x, pointer.y) > 14) {
    pointer.drag = true;
    if (G) { G.p.target = null; }
  }
});
cvs.addEventListener('pointerup', e => {
  const wasDrag = pointer.drag, quick = performance.now() - pointer.t < 400;
  pointer.down = false; pointer.drag = false;
  if (!G || paused || G.p.hp <= 0) return;
  if (wasDrag && !quick) return;
  // tap: pick target
  const w = screenToWorld(e.clientX, e.clientY);
  const p = G.p;
  // monster?
  let best = null, bd = 40;
  for (const m of G.lvl.monsters) {
    if (m.hp <= 0) continue;
    const dd = dist(w.x, w.y, m.x, m.y - m.r * 0.5);
    if (dd < bd + m.r) { bd = dd; best = m; }
  }
  if (best) { p.target = best; p.moveTo = null; p.path = null; return; }
  p.target = null;
  // drop?
  for (const dr of G.drops) {
    if (dist(w.x, w.y, dr.x, dr.y) < 32) { setMoveTarget(dr.x, dr.y); return; }
  }
  setMoveTarget(w.x, w.y);
});
cvs.addEventListener('pointercancel', () => { pointer.down = false; pointer.drag = false; });
window.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (!G) return;
  if (k === '1') castSkill(0);
  if (k === '2') castSkill(1);
  if (k === 'q') drinkPotion('hp');
  if (k === 'e') drinkPotion('mp');
  if (k === 'i') togglePanel('invPanel');
  if (k === 'c') togglePanel('charPanel');
  if (k === 'escape') { if (anyPanelOpen()) closePanels(); else togglePanel('pausePanel'); }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

/* HUD buttons */
$('btnSkill1').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); castSkill(0); });
$('btnSkill2').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); castSkill(1); });
$('btnHpPot').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); drinkPotion('hp'); });
$('btnMpPot').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); drinkPotion('mp'); });
$('btnInv').addEventListener('click', () => togglePanel('invPanel'));
$('btnChar').addEventListener('click', () => togglePanel('charPanel'));
$('btnMenu').addEventListener('click', () => togglePanel('pausePanel'));
$('btnRespawn').addEventListener('click', () => {
  const p = G.p;
  p.hp = G.d.maxHp * 0.6; p.mp = G.d.maxMp * 0.6;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null;
  for (const m of G.lvl.monsters) m.aggro = false;
  $('deathScreen').classList.add('hidden');
  updateHUD();
});

/* menu: class cards */
(function buildMenu() {
  const wrap = $('classCards');
  for (const id in CLASSES) {
    const c = CLASSES[id];
    const card = document.createElement('button');
    card.className = 'classcard';
    card.innerHTML = `<span class="cicon">${c.icon}</span><span class="cname">${c.name}</span><span class="cdesc">${c.desc}</span>`;
    card.addEventListener('click', () => {
      audioInit();
      const save = loadSave();
      if (save && !confirm('Starting a new hero deletes your saved ' + CLASSES[save.cls].name + '. Continue?')) return;
      localStorage.removeItem(SAVE_KEY);
      startGame(id, null);
    });
    wrap.appendChild(card);
  }
  $('btnContinue').addEventListener('click', () => {
    audioInit();
    const save = loadSave();
    if (save) startGame(save.cls, save);
  });
  refreshMenu();
})();

/* ---------------- main loop ---------------- */
let lastT = performance.now();
function frame(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  if (G && !paused && !anyPanelOpen()) update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* autosave */
setInterval(() => { if (G && saveDirty) saveGame(); }, 8000);
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });

/* expose for debugging / tests */
window.__sanctuary = { get G() { return G; }, startGame, CLASSES, MTYPES, makeItem: (...a) => makeItem(...a), genLevel };
