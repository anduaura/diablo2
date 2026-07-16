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
const T_WALL = 0, T_FLOOR = 1, T_UP = 2, T_DOWN = 3, T_WP = 4;
const WP_FLOORS = [1, 5, 10, 15, 20, 25, 30, 35, 40];
const AUTO_TARGET_R = 180;   // idle heroes lock onto monsters inside this radius
const SAVE_KEY = 'sanctuary_save_v1';

const FLOOR_NAMES = ['Rotting Cellars', 'Bone Crypts', 'Drowned Catacombs',
  'Ashen Halls', 'Blood Vaults', 'Screaming Depths', 'Molten Warrens', 'Abyssal Sanctum'];
const BOSS_NAMES = ['Gharok the Flayed', 'Mistress Vex', 'Korlath, Tomb Warden',
  'The Hollow King', 'Balegrim the Devourer', 'Ashmaw the Eternal'];

/* per-tier environment palettes: f = floor variants, w = wall, wt = wall
   highlight, m = mortar/shadow, acc = accent (moss, embers, …) */
const TIER_PAL = [
  { f: ['#3b2e20', '#3f3223', '#372b1e'], w: '#2a1f15', wt: '#3a2c1c', m: '#140d07', acc: null },       // Rotting Cellars
  { f: ['#33343c', '#373841', '#2e2f37'], w: '#262832', wt: '#363844', m: '#101218', acc: '#5a6a7a' },  // Bone Crypts
  { f: ['#2c3a32', '#303e36', '#28362e'], w: '#1f2c26', wt: '#2c3c34', m: '#0c1410', acc: '#4a7a5a' },  // Drowned Catacombs
  { f: ['#38322e', '#3c3632', '#34302c'], w: '#2a2522', wt: '#38322e', m: '#120f0d', acc: '#8a8078' },  // Ashen Halls
  { f: ['#3a2624', '#3e2a28', '#362220'], w: '#2c1a18', wt: '#3c2624', m: '#140a09', acc: '#a03a2a' },  // Blood Vaults
  { f: ['#2e2838', '#322c3c', '#2a2434'], w: '#221c2c', wt: '#302a3a', m: '#0e0a14', acc: '#7a5a9a' },  // Screaming Depths
  { f: ['#32241c', '#362820', '#2e2018'], w: '#241812', wt: '#32221a', m: '#100a06', acc: '#ff7a2a' },  // Molten Warrens
  { f: ['#20222e', '#242632', '#1c1e2a'], w: '#181a24', wt: '#242630', m: '#0a0b12', acc: '#4a5adf' },  // Abyssal Sanctum
];

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
      { id: 'warcry', name: 'War Cry', icon: '💢', mana: 16, cd: 8, desc: 'Shockwave: damages & stuns nearby foes' },
      { id: 'whirlwind', name: 'Whirlwind', icon: '🌪️', mana: 12, cd: 5, lvl: 6, desc: 'Spin: 160% damage to everything around you' },
      { id: 'rage', name: 'Berserker Rage', icon: '😡', mana: 20, cd: 18, lvl: 12, desc: '+60% damage and +25% speed for 6s' }],
  },
  sorceress: {
    name: 'Sorceress', icon: '🔮', color: '#7f95e8',
    desc: 'Fragile master of fire and frost. Fights from afar.',
    base: { str: 12, dex: 18, vit: 20, ene: 40 }, primary: 'ene',
    weapon: { slot: 'weapon', base: 'Gnarled Staff', icon: '🪄', rarity: 'common', lvl: 1, dmg: [2, 5], mods: {} },
    atkRange: 330, atkCd: 0.6, ranged: true, projKind: 'fire',
    skills: [
      { id: 'fireball', name: 'Fireball', icon: '🔥', mana: 11, cd: 1.6, desc: 'Explosive bolt: 220% damage in an area' },
      { id: 'frostnova', name: 'Frost Nova', icon: '❄️', mana: 15, cd: 7, desc: 'Icy ring: damages & chills all nearby foes' },
      { id: 'chain', name: 'Chain Lightning', icon: '⚡', mana: 14, cd: 4, lvl: 6, desc: 'Lightning arcs through up to 5 enemies' },
      { id: 'meteor', name: 'Meteor', icon: '☄️', mana: 22, cd: 8, lvl: 12, desc: 'Call a meteor: 300% damage in a large area' }],
  },
  huntress: {
    name: 'Huntress', icon: '🏹', color: '#7fbf6a',
    desc: 'Swift ranger. Deadly volleys and piercing shots.',
    base: { str: 18, dex: 36, vit: 22, ene: 14 }, primary: 'dex',
    weapon: { slot: 'weapon', base: 'Short Bow', icon: '🏹', rarity: 'common', lvl: 1, dmg: [2, 6], mods: {} },
    atkRange: 340, atkCd: 0.48, ranged: true, projKind: 'arrow',
    skills: [
      { id: 'multishot', name: 'Multishot', icon: '🎯', mana: 9, cd: 2.2, desc: 'Fan of 5 arrows, 95% damage each' },
      { id: 'skewer', name: 'Skewer', icon: '🗡️', mana: 13, cd: 5, desc: 'Piercing bolt: 220% damage through everything' },
      { id: 'poisoncloud', name: 'Poison Cloud', icon: '☠️', mana: 12, cd: 6, lvl: 6, desc: 'Toxic cloud poisons foes inside for 4s' },
      { id: 'strafe', name: 'Strafe', icon: '🌠', mana: 16, cd: 7, lvl: 12, desc: 'Rapid-fire 8 auto-aimed arrows' }],
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
  { stat: 'fireDmg', txt: v => `+${v} Fire Damage`, roll: l => ri(2, 4 + l * 2) },
  { stat: 'coldDmg', txt: v => `+${v} Cold Damage & Chill`, roll: l => ri(2, 3 + l * 2) },
  { stat: 'lightDmg', txt: v => `+${v} Lightning Damage`, roll: l => ri(2, 5 + l * 2) },
  { stat: 'poisonDmg', txt: v => `+${v} Poison Damage over 3s`, roll: l => ri(3, 6 + l * 2) },
];
const GEMS = {
  ruby: { name: 'Ruby', icon: '🔴', color: '#ff5a3a', stat: 'fireDmg', txt: v => `+${v} Fire Damage` },
  sapphire: { name: 'Sapphire', icon: '🔵', color: '#5ab0ff', stat: 'coldDmg', txt: v => `+${v} Cold Damage & Chill` },
  topaz: { name: 'Topaz', icon: '🟡', color: '#ffd23a', stat: 'lightDmg', txt: v => `+${v} Lightning Damage` },
  emerald: { name: 'Emerald', icon: '🟢', color: '#4ad46a', stat: 'poisonDmg', txt: v => `+${v} Poison Damage over 3s` },
  skull: { name: 'Skull', icon: '💀', color: '#cfc9b8', stat: 'leech', txt: v => `${v}% Life Steal` },
};
function makeGem(ilvl) {
  const k = choice(Object.keys(GEMS));
  const q = ilvl < 5 ? 0 : ilvl < 10 ? 1 : 2;
  const v = (k === 'skull' ? 2 : 3) + q * (k === 'skull' ? 2 : 4) + ri(0, 2);
  return {
    slot: 'gem', g: k, v, icon: GEMS[k].icon, rarity: 'magic', mods: {},
    name: ['Chipped ', '', 'Flawless '][q] + GEMS[k].name, base: 'gem', lvl: ilvl,
  };
}
/* two full sockets with matching gems awaken a runeword (either order) */
const RUNEWORDS = {
  'ruby+ruby': { name: 'Inferno', mods: { dmgPct: 15, fireDmg: 10 } },
  'sapphire+sapphire': { name: 'Glacier', mods: { coldDmg: 14, mp: 25 } },
  'topaz+topaz': { name: 'Stormcaller', mods: { lightDmg: 18, dmgPct: 10 } },
  'emerald+emerald': { name: 'Plaguebearer', mods: { poisonDmg: 16, hp: 25 } },
  'skull+skull': { name: 'Deathpact', mods: { leech: 10, mf: 25 } },
  'ruby+sapphire': { name: 'Equinox', mods: { fireDmg: 6, coldDmg: 6, hp: 20, mp: 20 } },
  'topaz+emerald': { name: 'Venomstorm', mods: { lightDmg: 8, poisonDmg: 10, dmgPct: 8 } },
  'skull+ruby': { name: 'Bloodfire', mods: { leech: 6, fireDmg: 8, hp: 15 } },
  'sapphire+skull': { name: 'Grave Chill', mods: { coldDmg: 10, leech: 5, mf: 15 } },
  'topaz+ruby': { name: 'Firestorm', mods: { fireDmg: 8, lightDmg: 8, dmgPct: 12 } },
};
function runewordOf(it) {
  if (!it || !it.gems || !it.sockets || it.sockets < 2 || it.gems.length < it.sockets) return null;
  const k = it.gems.map(g => g.g).join('+');
  return RUNEWORDS[k] || RUNEWORDS[it.gems.map(g => g.g).reverse().join('+')] || null;
}
const UNIQUES = [
  { slot: 'weapon', name: 'Gravebite', mods: { dmgPct: 60, leech: 8, str: 10, poisonDmg: 8 } },
  { slot: 'weapon', name: 'Embersong', mods: { dmgPct: 45, ene: 15, mp: 30, fireDmg: 12 } },
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
    atkT: 0, cd: [0, 0, 0, 0], target: null, path: null, moveTo: null,
    hurtT: 0, swingT: 0, deaths: 0,
    rageT: 0, spinT: 0, strafeN: 0, strafeT: 0,
  };
}

function derived(p) {
  const c = CLASSES[p.cls];
  const m = { str: 0, dex: 0, vit: 0, ene: 0, hp: 0, mp: 0, dmgPct: 0, armor: 0, leech: 0, mf: 0, fireDmg: 0, coldDmg: 0, lightDmg: 0, poisonDmg: 0 };
  let wdmg = [1, 2], warmor = 0;
  for (const s of SLOTS) {
    const it = p.equip[s]; if (!it) continue;
    if (it.dmg) wdmg = it.dmg;
    if (it.armor) warmor += it.armor;
    for (const k in it.mods) m[k] = (m[k] || 0) + it.mods[k];
    if (it.gems) for (const g of it.gems) m[GEMS[g.g].stat] += g.v;
    const rw = runewordOf(it);
    if (rw) for (const k in rw.mods) m[k] = (m[k] || 0) + rw.mods[k];
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
    fire: m.fireDmg, cold: m.coldDmg, light: m.lightDmg, poison: m.poisonDmg,
    hpRegen: 1 + vit * 0.03, mpRegen: 1.6 + ene * 0.06,
  };
}
function domEle(d) {   // dominant elemental color, or null
  const arr = [['#ff8a3a', d.fire], ['#7ac8ff', d.cold], ['#ffd23a', d.light], ['#4ad46a', d.poison]];
  arr.sort((a, b) => b[1] - a[1]);
  return arr[0][1] > 0 ? arr[0][0] : null;
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

  // pillars in large rooms (never on a room center, where stairs go)
  for (const r of rooms) {
    if (r.w >= 6 && r.h >= 6 && Math.random() < 0.65) {
      for (const [ppx, ppy] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]]) {
        if (Math.random() < 0.75 && !(ppx === r.cx && ppy === r.cy)) map[ppy][ppx] = T_WALL;
      }
    }
  }

  // entrance = room 0, exit = farthest room
  const r0 = rooms[0];
  let exit = rooms[1] || r0, best = -1;
  for (let i = 1; i < rooms.length; i++) {
    const d = dist(r0.cx, r0.cy, rooms[i].cx, rooms[i].cy);
    if (d > best) { best = d; exit = rooms[i]; }
  }
  map[r0.cy][r0.cx] = T_UP;
  map[exit.cy][exit.cx] = T_DOWN;

  // waypoint room on designated floors
  let wp = null;
  if (WP_FLOORS.includes(dlvl)) {
    const wpRoom = rooms.find(r => r !== r0 && r !== exit) || r0;
    const wx = wpRoom.cx + 1 < wpRoom.x + wpRoom.w ? wpRoom.cx + 1 : wpRoom.cx - 1;
    if (map[wpRoom.cy][wx] === T_FLOOR) {
      map[wpRoom.cy][wx] = T_WP;
      wp = { x: wx * TILE + TILE / 2, y: wpRoom.cy * TILE + TILE / 2 };
    }
  }

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
      let mx, my, tries = 0;
      do {
        mx = room.x + rand(0.8, room.w - 0.8);
        my = room.y + rand(0.8, room.h - 0.8);
      } while (map[Math.floor(my)][Math.floor(mx)] !== T_FLOOR && ++tries < 10);
      if (map[Math.floor(my)][Math.floor(mx)] !== T_FLOOR) continue;
      monsters.push(makeMonster(t, mx * TILE, my * TILE, scaleHp, scaleDmg, scaleXp, champ, false, dlvl));
    }
  }
  let boss = null;
  if (isBossFloor) {
    const bt = { id: 'boss', name: choice(BOSS_NAMES), hp: 240, dmg: [12, 20], spd: 78, r: 26, xp: 160, gold: [60, 120], atkCd: 1.1, range: 52, w: 0, minL: 1, color: '#a01818' };
    boss = makeMonster(bt, exit.cx * TILE + TILE / 2, exit.cy * TILE - TILE, scaleHp, scaleDmg, scaleXp, false, true, dlvl);
    monsters.push(boss);
  }

  return {
    map, rooms, torches, monsters, boss, wp,
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: isBossFloor,
    entrance: { x: r0.cx * TILE + TILE / 2, y: r0.cy * TILE + TILE / 2 + TILE * 0.7 },
    exitTile: { x: exit.cx, y: exit.cy },
  };
}

/* -------- town: safe hub with merchant, waypoint and stairs down -------- */
function genTown() {
  const map = []; for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(T_WALL));
  const R = { x: 20, y: 20, w: 13, h: 11, cx: 26, cy: 25 };
  for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) map[y][x] = T_FLOOR;
  map[R.cy][R.x + R.w - 2] = T_DOWN;
  map[R.cy][R.x + 2] = T_WP;
  map[R.y + 1][R.x + 1] = T_WALL; map[R.y + 1][R.x + R.w - 2] = T_WALL;   // corner pillars
  map[R.y + R.h - 2][R.x + 1] = T_WALL; map[R.y + R.h - 2][R.x + R.w - 2] = T_WALL;
  const torches = [];
  for (let x = R.x + 1; x < R.x + R.w - 1; x += 3) torches.push({ x: x * TILE + TILE / 2, y: (R.y - 1) * TILE + TILE * 0.9 });
  const ilvl = Math.max(1, (G && G.deepest) || 1);
  const shopStock = [];
  for (let i = 0; i < 4; i++) shopStock.push(makeItem(choice(SLOTS), ilvl, Math.random() < 0.15 ? 'rare' : 'magic'));
  return {
    map, rooms: [R], torches, monsters: [], boss: null, wp: { x: (R.x + 2) * TILE + TILE / 2, y: R.cy * TILE + TILE / 2 },
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: false,
    entrance: { x: R.cx * TILE + TILE / 2, y: (R.cy + 2) * TILE + TILE / 2 },
    exitTile: { x: R.x + R.w - 2, y: R.cy },
    vendor: { x: (R.x + 5) * TILE + TILE / 2, y: (R.y + 2) * TILE + TILE / 2 },
    shopStock,
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
      if (slot === 'weapon') { it.dmg = [3 + ilvl * 2, 6 + ilvl * 3]; it.sockets = 1; it.gems = []; }
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
  if (slot === 'weapon') it.sockets = Math.random() < 0.08 ? 2 : Math.random() < 0.25 ? 1 : 0;
  else if (slot === 'helm' || slot === 'armor') it.sockets = Math.random() < 0.15 ? 1 : 0;
  if (it.sockets) it.gems = [];
  if (rarity === 'magic') it.name = base + ' ' + choice(['of Power', 'of the Fox', 'of the Wolf', 'of Souls', 'of Embers', 'of Frost', 'of the Colossus']);
  if (rarity === 'rare') it.name = choice(['Doom', 'Grim', 'Storm', 'Blood', 'Shadow', 'Bone', 'Raven']) + choice([' Spike', ' Ward', ' Song', ' Grasp', ' Veil', ' Brand']) ;
  return it;
}
const sellPrice = it => ({ common: 8, magic: 25, rare: 70, unique: 200 }[it.rarity] + it.lvl * 6);
function modLines(it) {
  if (it.g) return [GEMS[it.g].txt(it.v), 'Embed into a socketed item'];
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
function spark(x, y, color, n, spd) {   // additive glowing embers
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(30, spd || 160);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, r: rand(1.5, 3), color, life: rand(0.25, 0.6), glow: true });
  }
}
function shake(a) { G.shakeT = Math.max(G.shakeT || 0, a); }
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
}
function banner(txt) {
  const b = $('banner');
  b.textContent = txt;
  b.classList.remove('hidden');
  // restart CSS animation
  b.style.animation = 'none'; void b.offsetHeight; b.style.animation = '';
}

/* ---------------- combat ---------------- */
function playerAtk() { return Math.round(ri(G.d.dmgLo, G.d.dmgHi) * (G.p.rageT > 0 ? 1.6 : 1)); }

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
  if (crit) G.rings.push({ x: m.x, y: m.y - m.r * 0.5, r: 2, max: 16, color: '#ffd76a', life: 0.15 });
  sfx.hit();
  if (opts.ele) {   // weapon elemental procs (basic attacks & physical skills)
    const d2 = G.d;
    if (d2.fire > 0) { m.hp -= d2.fire; ftext(m.x + 9, m.y - m.r - 4, d2.fire, '#ff8a3a', 12); spark(m.x, m.y - m.r / 2, '#ff8a3a', 3, 130); }
    if (d2.cold > 0) { m.hp -= d2.cold; m.slowT = Math.max(m.slowT, 1.3); ftext(m.x - 9, m.y - m.r - 4, d2.cold, '#7ac8ff', 12); spark(m.x, m.y - m.r / 2, '#bfe8ff', 3, 110); }
    if (d2.light > 0) { m.hp -= d2.light; ftext(m.x, m.y - m.r - 20, d2.light, '#ffd23a', 12); spark(m.x, m.y - m.r / 2, '#ffd23a', 4, 220); }
    if (d2.poison > 0) { m.poisonT = 3; m.poisonDps = d2.poison / 3; m.pTick = 0; }
  }
  if (G.d.leech > 0) G.p.hp = Math.min(G.d.maxHp, G.p.hp + dmg * G.d.leech);
  if (m.hp <= 0) killMonster(m);
}

function killMonster(m) {
  burst(m.x, m.y, m.type.color, 16, 160);
  burst(m.x, m.y, '#3a3a3a', 8, 80);
  spark(m.x, m.y, m.type.color, m.boss ? 30 : 7, m.boss ? 300 : 180);
  if (m.boss) shake(0.4);
  // xp
  const p = G.p;
  p.xp += m.xp;
  ftext(m.x, m.y - 26, '+' + m.xp + ' xp', '#b8a4e8', 12);
  while (p.xp >= xpNext(p.level)) {
    p.xp -= xpNext(p.level); p.level++; p.statPts += 5;
    recalc(); p.hp = G.d.maxHp; p.mp = G.d.maxMp;
    banner('LEVEL ' + p.level + '!  +5 stat points');
    burst(p.x, p.y, '#ffd76a', 30, 200);
    spark(p.x, p.y, '#ffd76a', 30, 260);
    G.rings.push({ x: p.x, y: p.y, r: 8, max: 70, color: '#ffd76a', life: 0.5 });
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
  if (Math.random() < (m.boss ? 0.8 : 0.06)) G.drops.push({ kind: 'item', item: makeGem(Math.max(1, dlvl)), ...scatter() });
}

function hurtPlayer(dmg, mlvl) {
  const p = G.p;
  const red = clamp(G.d.armor / (G.d.armor + 60 + 12 * (mlvl || G.dlvl)), 0, 0.75);
  dmg = Math.max(1, Math.round(dmg * (1 - red)));
  p.hp -= dmg; p.hurtT = 0.25;
  ftext(p.x, p.y - 26, '-' + dmg, '#ff6a5a', 15);
  shake(clamp(dmg / G.d.maxHp * 1.5, 0.08, 0.3));
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
  if (p.level < (sk.lvl || 1)) { ftext(p.x, p.y - 30, 'Unlocks at level ' + sk.lvl, '#c9b98a', 12); return; }
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
          if (Math.abs(da) < 1.35) hitMonster(m, atk * 1.8, { kb: 14, ele: true });
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
      burst(p.x, p.y + 8, '#8a7a5a', 14, 140);
      shake(0.16);
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
      G.rings.push({ x: p.x, y: p.y, r: 6, max: 120, color: '#ffffff', life: 0.25 });
      spark(p.x, p.y, '#bfe8ff', 24, 240);
      sfx.potion();
      break;
    case 'multishot':
      for (let k = -2; k <= 2; k++) shoot(p.x, p.y, aim + k * 0.22, 470, atk * 0.95, 'p', { kind: 'arrow', r: 4, ele: true, color: domEle(G.d) });
      sfx.shoot();
      break;
    case 'skewer':
      shoot(p.x, p.y, aim, 560, atk * 2.2, 'p', { kind: 'bolt', r: 5, pierce: true, ele: true });
      sfx.shoot();
      break;
    case 'whirlwind':
      for (const m of G.lvl.monsters) {
        if (m.hp <= 0) continue;
        if (dist(p.x, p.y, m.x, m.y) < 115 + m.r) hitMonster(m, atk * 1.6, { ele: true, kb: 10 });
      }
      G.rings.push({ x: p.x, y: p.y, r: 20, max: 115, color: '#e8d9a8', life: 0.3 });
      p.spinT = 0.45;
      shake(0.1);
      sfx.fire();
      break;
    case 'rage':
      p.rageT = 6;
      G.rings.push({ x: p.x, y: p.y, r: 8, max: 60, color: '#ff5a3a', life: 0.3 });
      spark(p.x, p.y, '#ff5a3a', 18, 200);
      banner('BERSERKER RAGE!');
      sfx.boss();
      break;
    case 'chain': {
      let cur = (t && los(p.x, p.y, t.x, t.y)) ? t : nearestMonster(p.x, p.y, 320);
      let sx = p.x, sy = p.y - 8, jumps = 0;
      const zapped = new Set();
      while (cur && jumps < 5) {
        G.beams.push({ x1: sx, y1: sy, x2: cur.x, y2: cur.y - cur.r * 0.5, life: 0.25 });
        hitMonster(cur, atk * 1.5, { noCrit: true });
        zapped.add(cur);
        sx = cur.x; sy = cur.y - cur.r * 0.5;
        let next = null, bd = 190;
        for (const m of G.lvl.monsters) {
          if (m.hp <= 0 || zapped.has(m)) continue;
          const dd = dist(sx, sy, m.x, m.y);
          if (dd < bd) { bd = dd; next = m; }
        }
        cur = next; jumps++;
      }
      spark(p.x, p.y - 8, '#ffd23a', 8, 180);
      sfx.shoot();
      break;
    }
    case 'meteor': {
      const tx = t ? t.x : p.x + Math.cos(aim) * 160;
      const ty = t ? t.y : p.y + Math.sin(aim) * 160;
      G.meteors.push({ x: tx, y: ty, t: 0.85, dmg: Math.round(atk * 3) });
      sfx.fire();
      break;
    }
    case 'poisoncloud': {
      const tx = t ? t.x : p.x + Math.cos(aim) * 130;
      const ty = t ? t.y : p.y + Math.sin(aim) * 130;
      G.clouds.push({ x: tx, y: ty, life: 4, dps: Math.max(2, Math.round(atk * 0.5)) });
      sfx.potion();
      break;
    }
    case 'strafe':
      p.strafeN = 8; p.strafeT = 0;
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
    ele: !!o.ele, color: o.color || null,
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
  G.deepest = Math.max(G.deepest || 1, dlvl);
  G.lvl = dlvl === 0 ? genTown() : genLevel(dlvl);
  G.projs = []; G.parts = []; G.texts = []; G.drops = []; G.rings = [];
  G.beams = []; G.meteors = []; G.clouds = []; G.onWp = false;
  const p = G.p;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null;
  p.strafeN = 0;
  if (dlvl === 0) {
    G.tier = 0;
    $('floorLabel').textContent = 'Sanctuary · Town';
    banner('Sanctuary — safe haven');
    sfx.stairs();
  } else {
    G.tier = Math.min(Math.floor((dlvl - 1) / 3), TIER_PAL.length - 1);
    const tierName = FLOOR_NAMES[Math.min(Math.floor((dlvl - 1) / 3), FLOOR_NAMES.length - 1)];
    $('floorLabel').textContent = tierName + ' · ' + dlvl;
    banner(dlvl % 5 === 0 ? tierName + ' — ' + dlvl + '  ⚠ a great evil stirs…' : tierName + ' — Floor ' + dlvl);
    if (dlvl % 5 === 0) sfx.boss(); else sfx.stairs();
  }
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
      waypoints: G.waypoints, deepest: G.deepest,
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
  G = {
    p, dlvl: save ? save.dlvl : 0, lvl: null, projs: [], parts: [], texts: [], drops: [], rings: [],
    beams: [], meteors: [], clouds: [], time: 0, mmT: 0, tier: 0, shakeT: 0, onWp: false,
    waypoints: (save && save.waypoints) || [], deepest: (save && save.deepest) || 1,
  };
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

  p.rageT = Math.max(0, p.rageT - dt);
  p.spinT = Math.max(0, p.spinT - dt);

  // strafe: rapid-fire auto-aimed arrows
  if (p.strafeN > 0) {
    p.strafeT -= dt;
    if (p.strafeT <= 0) {
      p.strafeT = 0.09;
      const tgt = nearestMonster(p.x, p.y, 420);
      if (tgt) {
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        p.dir = a; p.swingT = 0.1;
        shoot(p.x, p.y, a + rand(-0.03, 0.03), 520, Math.round(playerAtk() * 0.8), 'p', { kind: 'arrow', r: 4, ele: true, color: domEle(d) });
        sfx.shoot();
      }
      p.strafeN--;
    }
  }
  // meteors falling
  for (let i = G.meteors.length - 1; i >= 0; i--) {
    const mt = G.meteors[i];
    mt.t -= dt;
    if (mt.t <= 0) {
      for (const m of G.lvl.monsters) if (m.hp > 0 && dist(mt.x, mt.y, m.x, m.y) < 95 + m.r) hitMonster(m, mt.dmg);
      burst(mt.x, mt.y, '#ff8a3a', 24, 240); burst(mt.x, mt.y, '#3a3230', 12, 100);
      spark(mt.x, mt.y, '#ffd27a', 20, 300);
      G.rings.push({ x: mt.x, y: mt.y, r: 10, max: 95, color: '#ff8a3a', life: 0.3 });
      shake(0.25); sfx.fire();
      G.meteors.splice(i, 1);
    }
  }
  // poison clouds
  for (let i = G.clouds.length - 1; i >= 0; i--) {
    const cl = G.clouds[i];
    cl.life -= dt;
    if (Math.random() < dt * 20) G.parts.push({ x: cl.x + rand(-60, 60), y: cl.y + rand(-45, 45), vx: rand(-6, 6), vy: rand(-14, -4), r: rand(2, 4), color: '#4ad46a', life: rand(0.4, 0.8), glow: true });
    for (const m of G.lvl.monsters) {
      if (m.hp <= 0) continue;
      if (dist(cl.x, cl.y, m.x, m.y) < 75 + m.r) { m.poisonT = Math.max(m.poisonT || 0, 0.8); m.poisonDps = Math.max(m.poisonDps || 0, cl.dps); }
    }
    if (cl.life <= 0) G.clouds.splice(i, 1);
  }

  // elemental / unique / raging weapons shed glowing wisps
  const wispC = (p.rageT > 0 ? '#ff5a3a' : null) || domEle(d) || (p.equip.weapon && p.equip.weapon.rarity === 'unique' ? '#d98d4a' : null);
  if (wispC && Math.random() < dt * 7) {
    G.parts.push({
      x: p.x + Math.cos(p.dir) * 14 + rand(-3, 3), y: p.y - 5 + Math.sin(p.dir) * 6 + rand(-3, 3),
      vx: rand(-8, 8), vy: rand(-24, -8), r: rand(1.2, 2.2), color: wispC, life: rand(0.3, 0.55), glow: true,
    });
  }

  /* --- player movement --- */
  const spd = 175 * (p.rageT > 0 ? 1.25 : 1);
  let kx = (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0);
  let ky = (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0);
  if (kx || ky) { p.path = null; p.moveTo = null; p.target = null; const l = Math.hypot(kx, ky); moveCircle(p, kx / l * spd * dt, ky / l * spd * dt); p.dir = Math.atan2(ky, kx); }
  else if (pointer.drag && pointer.down) {
    const w = screenToWorld(pointer.x, pointer.y);
    const dd = dist(p.x, p.y, w.x, w.y);
    if (dd > 18) { const a = Math.atan2(w.y - p.y, w.x - p.x); p.dir = a; moveCircle(p, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt); }
    p.path = null; p.moveTo = null;
  } else {
    // auto-target: an idle hero locks onto the nearest visible monster
    if ((!p.target || p.target.hp <= 0) && !p.path && !p.moveTo && G.dlvl > 0) {
      const near = nearestMonster(p.x, p.y, AUTO_TARGET_R);
      if (near) p.target = near;
    }
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
            if (c.ranged) { shoot(p.x, p.y, p.dir, 460, playerAtk(), 'p', { kind: c.projKind, r: 4, ele: true, color: domEle(G.d) }); sfx.shoot(); }
            else hitMonster(p.target, playerAtk(), { ele: true });
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

  /* --- stairs & waypoints --- */
  const ptx = Math.floor(p.x / TILE), pty = Math.floor(p.y / TILE);
  const curTile = tileAt(ptx, pty);
  if (curTile === T_WP) {
    if (!G.onWp) {
      G.onWp = true;
      if (G.dlvl > 0 && !G.waypoints.includes(G.dlvl)) {
        G.waypoints.push(G.dlvl);
        banner('Waypoint activated!');
        spark(p.x, p.y, '#5ab0ff', 20, 220); sfx.level();
        saveDirty = true;
      }
      togglePanel('wpPanel');
    }
  } else G.onWp = false;
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
    if (m.poisonT > 0) {
      m.poisonT -= dt;
      m.hp -= m.poisonDps * dt;
      m.pTick = (m.pTick || 0) + dt;
      if (m.pTick > 0.7) { m.pTick = 0; ftext(m.x, m.y - m.r - 6, Math.max(1, Math.round(m.poisonDps * 0.7)), '#4ad46a', 11); }
      if (Math.random() < dt * 5) burst(m.x + rand(-0.5, 0.5) * m.r, m.y - m.r, '#4ad46a', 1, 30);
      if (m.hp <= 0) { m.hp = 0; killMonster(m); continue; }
    }
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
        spark(m.x, m.y, '#ff7a3a', 14, 220);
        shake(0.2);
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
            burst(pr.x, pr.y, '#3a3230', 10, 90);
            spark(pr.x, pr.y, '#ffd27a', 16, 280);
            G.rings.push({ x: pr.x, y: pr.y, r: 8, max: pr.aoe, color: '#ff8a3a', life: 0.25 });
            G.rings.push({ x: pr.x, y: pr.y, r: 4, max: pr.aoe * 0.55, color: '#ffe9b0', life: 0.16 });
            shake(0.14);
            dead = true;
          } else {
            hitMonster(m, pr.dmg, { ele: pr.ele });
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
  G.shakeT = Math.max(0, (G.shakeT || 0) - dt);
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
  for (let i = G.beams.length - 1; i >= 0; i--) {
    G.beams[i].life -= dt;
    if (G.beams[i].life <= 0) G.beams.splice(i, 1);
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
  if (G.shakeT > 0) { cam.x += rand(-1, 1) * G.shakeT * 26; cam.y += rand(-1, 1) * G.shakeT * 26; }

  ctx.save();
  ctx.translate(VW / 2, VH / 2); ctx.scale(ZOOM, ZOOM); ctx.translate(-cam.x, -cam.y);

  /* tiles */
  const x0 = Math.max(0, Math.floor((cam.x - VW / 2 / ZOOM) / TILE) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((cam.x + VW / 2 / ZOOM) / TILE) + 1);
  const y0 = Math.max(0, Math.floor((cam.y - VH / 2 / ZOOM) / TILE) - 1);
  const y1 = Math.min(MAP_H - 1, Math.ceil((cam.y + VH / 2 / ZOOM) / TILE) + 1);
  const pal = TIER_PAL[G.tier || 0];
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = G.lvl.map[ty][tx], px = tx * TILE, py = ty * TILE, h = thash(tx, ty);
    if (t === T_WALL) {
      // only draw walls bordering floor (rest stays black)
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy++) for (let dx = -1; dx <= 1; dx++)
        if (tileAt(tx + dx, ty + dy) >= T_FLOOR) { border = true; break; }
      if (!border) continue;
      const pillar = walkable(tx - 1, ty) && walkable(tx + 1, ty) && walkable(tx, ty - 1) && walkable(tx, ty + 1);
      if (pillar) {
        // free-standing column on a floor base
        ctx.fillStyle = pal.f[Math.floor(h * 3) % 3];
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = '#00000066';
        ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE - 8, 15, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = pal.wt;
        ctx.fillRect(px + 8, py + TILE - 14, TILE - 16, 8);
        const cg = ctx.createLinearGradient(px + 11, 0, px + TILE - 11, 0);
        cg.addColorStop(0, pal.m); cg.addColorStop(0.4, pal.wt); cg.addColorStop(1, pal.m);
        ctx.fillStyle = cg;
        ctx.fillRect(px + 11, py - 16, TILE - 22, TILE + 2);
        ctx.fillStyle = pal.wt;
        ctx.fillRect(px + 7, py - 22, TILE - 14, 7);
        ctx.fillStyle = '#00000044';
        ctx.fillRect(px + 11, py - 15, TILE - 22, 3);
      } else {
        // brick wall
        ctx.fillStyle = pal.w;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.strokeStyle = pal.m; ctx.lineWidth = 1.4;
        for (let row = 0; row < 3; row++) {
          const ry = py + 5 + row * 13;
          ctx.beginPath(); ctx.moveTo(px, ry); ctx.lineTo(px + TILE, ry); ctx.stroke();
          const off = ((tx * 3 + ty * 7 + row) % 2) * 11 + 8;
          ctx.beginPath(); ctx.moveTo(px + off, ry); ctx.lineTo(px + off, ry + 13); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(px + off + 22, ry); ctx.lineTo(px + off + 22, ry + 13); ctx.stroke();
        }
        ctx.fillStyle = pal.wt;
        ctx.fillRect(px, py, TILE, 5);
        ctx.fillStyle = '#00000055';
        ctx.fillRect(px, py + TILE - 5, TILE, 5);
        if (h > 0.9 && pal.acc) {   // moss / seep stain
          ctx.fillStyle = pal.acc + '26';
          ctx.beginPath(); ctx.ellipse(px + TILE * h, py + TILE * 0.55, 7, 12, 0, 0, 7); ctx.fill();
        }
      }
    } else {
      // flagstone floor
      ctx.fillStyle = pal.f[Math.floor(h * 3) % 3];
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = pal.m + '99'; ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      const h2 = thash(tx * 5 + 1, ty * 3 + 2);
      ctx.strokeStyle = pal.m + '55';
      if (h2 < 0.35) { ctx.beginPath(); ctx.moveTo(px + TILE * (0.3 + h2), py); ctx.lineTo(px + TILE * (0.3 + h2), py + TILE); ctx.stroke(); }
      else if (h2 < 0.7) { ctx.beginPath(); ctx.moveTo(px, py + TILE * h2); ctx.lineTo(px + TILE, py + TILE * h2); ctx.stroke(); }
      if (h > 0.84 && h < 0.93) {   // cracks (ember-lit in the Molten Warrens)
        const molten = G.tier === 6 && pal.acc;
        ctx.strokeStyle = molten ? pal.acc + 'aa' : pal.m + 'cc';
        ctx.lineWidth = molten ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(px + 6 + h * 20, py + 8);
        ctx.lineTo(px + 14 + h2 * 16, py + 18 + h * 10);
        ctx.lineTo(px + 8 + h * 24, py + 32 + h2 * 8);
        ctx.stroke();
      }
      if (h < 0.05) {   // dark stain
        ctx.fillStyle = '#00000030';
        ctx.beginPath(); ctx.ellipse(px + TILE * 0.5, py + TILE * 0.5, 12 + h * 100, 8, h * 40, 0, 7); ctx.fill();
      }
      if (h > 0.93) { // bones / rubble decoration
        ctx.fillStyle = '#00000033';
        ctx.beginPath(); ctx.ellipse(px + TILE * 0.5, py + TILE * 0.55, 8, 4, h * 6, 0, 7); ctx.fill();
        ctx.fillStyle = h > 0.965 ? '#b8ab8f' : '#4a3a28';
        ctx.fillRect(px + TILE * 0.3, py + TILE * 0.45, 9, 2.5);
        ctx.fillRect(px + TILE * 0.5, py + TILE * 0.55, 6, 2);
      }
      if (t === T_WP) {
        ctx.strokeStyle = '#5ab0ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 15 + Math.sin(G.time * 2.5) * 1.5, 0, 7); ctx.stroke();
        ctx.strokeStyle = '#9adcff';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 9, G.time * 1.4, G.time * 1.4 + 4.2); ctx.stroke();
        ctx.fillStyle = '#bfe8ff';
        ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 2.5 + Math.sin(G.time * 4) * 0.8, 0, 7); ctx.fill();
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
      const col = dr.item.g ? GEMS[dr.item.g].color : rarityColor(dr.item.rarity);
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

  /* poison clouds (under entities) */
  for (const cl of G.clouds) {
    ctx.fillStyle = 'rgba(74,212,106,0.12)';
    ctx.beginPath(); ctx.arc(cl.x, cl.y, 75, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(74,212,106,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cl.x, cl.y, 75 + Math.sin(G.time * 3) * 3, 0, 7); ctx.stroke();
  }

  /* town vendor */
  if (G.lvl.vendor) drawVendor(G.lvl.vendor);

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
      const fg = ctx.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r * 2.6);
      fg.addColorStop(0, 'rgba(255,170,80,0.55)'); fg.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8a3a';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.arc(pr.x, pr.y, pr.r * 0.45, 0, 7); ctx.fill();
      if (Math.random() < 0.8) G.parts.push({ x: pr.x, y: pr.y, vx: rand(-25, 25), vy: rand(-35, 5), r: rand(1.5, 3), color: Math.random() < 0.5 ? '#ff8a3a' : '#ffd27a', life: 0.35, glow: true });
    } else if (pr.kind === 'fire') {
      ctx.fillStyle = pr.color || '#ffab4a';
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
      ctx.strokeStyle = pr.color || '#c9b98a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(pr.x - Math.cos(a) * 9, pr.y - Math.sin(a) * 9); ctx.lineTo(pr.x, pr.y); ctx.stroke();
      if (pr.color && Math.random() < 0.4) G.parts.push({ x: pr.x, y: pr.y, vx: rand(-10, 10), vy: rand(-10, 10), r: 1.5, color: pr.color, life: 0.25, glow: true });
    }
  }

  /* chain lightning beams */
  for (const b of G.beams) {
    ctx.globalAlpha = clamp(b.life * 4, 0, 1);
    ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
    for (let k = 1; k <= 3; k++) {
      const tt = k / 4;
      ctx.lineTo(b.x1 + (b.x2 - b.x1) * tt + rand(-7, 7), b.y1 + (b.y2 - b.y1) * tt + rand(-7, 7));
    }
    ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.strokeStyle = '#fff7cc'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* meteors: target reticle + falling rock */
  for (const mt of G.meteors) {
    ctx.strokeStyle = '#ff8a3a99'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mt.x, mt.y, 20 + 75 * (1 - mt.t / 0.85), 0, 7); ctx.stroke();
    const fx = mt.x + mt.t * 70, fy = mt.y - mt.t * 560;
    ctx.fillStyle = '#7a3a1a';
    ctx.beginPath(); ctx.arc(fx, fy, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff8a3a';
    ctx.beginPath(); ctx.arc(fx + 2, fy - 2, 5.5, 0, 7); ctx.fill();
    G.parts.push({ x: fx, y: fy, vx: rand(-10, 10), vy: rand(0, 25), r: rand(1.5, 3), color: '#ffd27a', life: 0.3, glow: true });
  }

  /* rings */
  for (const r of G.rings) {
    if (r.life0 === undefined) r.life0 = r.life;   // scale expansion to each ring's own duration
    const t = clamp(1 - r.life / r.life0, 0, 1);
    ctx.strokeStyle = r.color; ctx.globalAlpha = clamp(r.life * 2.4, 0, 1);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(0.5, r.r + (r.max - r.r) * Math.min(1, t * 1.6)), 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* particles: plain first, then glowing ones additively */
  for (const q of G.parts) {
    if (q.glow) continue;
    ctx.globalAlpha = clamp(q.life * 2, 0, 1);
    ctx.fillStyle = q.color;
    ctx.fillRect(q.x - q.r / 2, q.y - q.r / 2, q.r, q.r);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const q of G.parts) {
    if (!q.glow) continue;
    ctx.globalAlpha = clamp(q.life * 2, 0, 1) * 0.9;
    ctx.fillStyle = q.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
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
  if (G.lvl.wp) hole(G.lvl.wp.x, G.lvl.wp.y, 100, 0.85);
  if (G.lvl.vendor) hole(G.lvl.vendor.x, G.lvl.vendor.y, 120, 0.9);
  for (const mt of G.meteors) hole(mt.x + mt.t * 70, mt.y - mt.t * 560, 90, 0.85);
  for (const cl of G.clouds) hole(cl.x, cl.y, 95, 0.55);
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
  /* equipped gear drives the look */
  const eq = p.equip;
  const rarC = s => eq[s] && eq[s].rarity !== 'common' ? rarityColor(eq[s].rarity) : null;
  const bootC = flash ? '#a86a5a' : ({ magic: '#4a5a8a', rare: '#7a6a2e', unique: '#8a4e28' }[eq.boots && eq.boots.rarity] || '#4a3826');
  const drawAmulet = () => {
    if (!eq.amulet) return;
    ctx.strokeStyle = '#c9a45a'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0, -9, 3.4, 0.4, Math.PI - 0.4); ctx.stroke();
    ctx.fillStyle = rarC('amulet') || '#c9a45a';
    ctx.beginPath(); ctx.arc(0, -5.8, 1.5, 0, 7); ctx.fill();
  };
  const ringDot = (x, y) => {
    if (!eq.ring) return;
    ctx.fillStyle = rarC('ring') || '#c9a45a';
    ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill();
  };

  // shadow
  ctx.fillStyle = '#00000066';
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 13, 12, 4.5, 0, 0, 7); ctx.fill();
  // berserker rage aura
  if (p.rageT > 0) {
    ctx.strokeStyle = hexA('#ff5a3a', 0.5 + Math.sin(t * 9) * 0.2);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 12, 15 + Math.sin(t * 7) * 2, 6, 0, 0, 7); ctx.stroke();
  }

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
    legs('#3a2c20', bootC);
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
    ctx.fillStyle = rarC('armor') || '#c9a45a'; ctx.fillRect(-1.6, 3.7, 3.2, 2.4);
    drawAmulet();
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
    if (eq.helm) { ctx.fillStyle = '#c9a45a'; ctx.fillRect(-5.2, -18.4, 10.4, 1.5); }
    ctx.fillStyle = rarC('helm') || '#a3130b';
    ctx.beginPath();
    ctx.moveTo(-4.5, -19);
    ctx.quadraticCurveTo(0, -24.5, 4.5, -19);
    ctx.quadraticCurveTo(0, -21, -4.5, -19);
    ctx.closePath(); ctx.fill();
    /* sword arm (whirlwind spins it full-circle) */
    ctx.save();
    ctx.translate(6, -4.5);
    ctx.rotate(-0.55 + swing * 1.7 + (p.spinT > 0 ? (0.45 - p.spinT) * 28 : 0));
    ctx.strokeStyle = skin; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4.5, 1.5); ctx.stroke();
    ctx.translate(5, 1.5); ctx.rotate(0.1);
    const wI = eq.weapon ? eq.weapon.icon : '⚔️';
    ctx.fillStyle = '#2c2018'; ctx.fillRect(-4.6, -1.1, 4, 2.2);
    ctx.fillStyle = '#c9a45a';
    ctx.beginPath(); ctx.arc(-5.2, 0, 1.5, 0, 7); ctx.fill();
    if (wI === '🪓') {          // war axe
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(13, 0); ctx.stroke();
      ctx.fillStyle = '#ccd2da';
      ctx.beginPath();
      ctx.moveTo(10.5, -6.5);
      ctx.quadraticCurveTo(18, -7, 17.5, 0);
      ctx.quadraticCurveTo(18, 7, 10.5, 6.5);
      ctx.quadraticCurveTo(13.5, 0, 10.5, -6.5);
      ctx.closePath(); ctx.fill();
    } else if (wI === '🔨') {   // great maul
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-1, 0); ctx.lineTo(12, 0); ctx.stroke();
      ctx.fillStyle = '#8a909c'; ctx.fillRect(10, -5.2, 7, 10.4);
      ctx.fillStyle = '#5c626e'; ctx.fillRect(10, -5.2, 7, 3.2);
    } else {                    // sword / blade
      ctx.fillStyle = '#c9a45a';
      ctx.fillRect(-1, -3.6, 2, 7.2);
      ctx.fillStyle = '#ccd2da';
      ctx.beginPath();
      ctx.moveTo(1, -2); ctx.lineTo(14.5, -1); ctx.lineTo(17.5, 0); ctx.lineTo(14.5, 1); ctx.lineTo(1, 2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(1.5, 0); ctx.lineTo(14.5, 0); ctx.stroke();
    }
    if (rarC('weapon')) { ctx.fillStyle = rarC('weapon'); ctx.fillRect(-1.2, -1.2, 2.4, 2.4); }
    ringDot(-3.2, -1.8);
    ctx.restore();
    /* swing trail, tinted by the weapon's element */
    if (swing > 0.1) {
      ctx.strokeStyle = hexA(domEle(G.d) || '#e8d9a8', 0.55 * swing);
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
    const trimC = rarC('armor') || '#c9a45a';
    ctx.strokeStyle = trimC; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7.4 - stride * 1.4, 10);
    ctx.quadraticCurveTo(0, 7.8, 7.4 + stride * 1.4, 10);
    ctx.stroke();
    /* sash */
    ctx.strokeStyle = trimC; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-5.2, 1.5); ctx.quadraticCurveTo(0, 3.2, 5.2, 1.5); ctx.stroke();
    drawAmulet();
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
    if (eq.helm) {   // circlet over the hood
      ctx.strokeStyle = rarC('helm') || '#c9a45a'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(-0.8, -14.6, 5.2, Math.PI * 1.1, Math.PI * 1.98); ctx.stroke();
    }
    /* staff arm + glowing orb staff (orb takes the weapon's rarity color) */
    ctx.save();
    ctx.translate(6.5, -3);
    ctx.rotate(swing * 0.5);
    ctx.strokeStyle = skin; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(3, 1); ctx.stroke();
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(4.5, -13); ctx.stroke();
    const pulse = 2.9 + Math.sin(t * 3.2) * 0.5;
    const orbC = rarC('weapon') || '#8fb3ff';
    const halo = ctx.createRadialGradient(4.8, -15, 0, 4.8, -15, pulse * 2.6);
    halo.addColorStop(0, hexA(orbC, 0.85));
    halo.addColorStop(1, hexA(orbC, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(4.8, -15, pulse * 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = orbC;
    ctx.beginPath(); ctx.arc(4.8, -15, pulse, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8f2ff';
    ctx.beginPath(); ctx.arc(4, -15.8, pulse * 0.4, 0, 7); ctx.fill();
    ringDot(3, 1);
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
    legs('#2c3a24', bootC);
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
    ctx.fillStyle = rarC('armor') || '#c9a45a'; ctx.fillRect(-1.2, 3.7, 2.4, 2.2);
    drawAmulet();
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
    if (eq.helm) {   // metal brow band on the hood
      ctx.strokeStyle = rarC('helm') || '#c9a45a'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(-0.8, -14.4, 5.1, Math.PI * 1.1, Math.PI * 1.98); ctx.stroke();
    }
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
    if (rarC('weapon')) {   // gems on the bow limbs
      ctx.fillStyle = rarC('weapon');
      ctx.beginPath(); ctx.arc(3 + Math.cos(1.1) * 10, 0.5 - Math.sin(1.1) * 10, 1.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(3 + Math.cos(1.1) * 10, 0.5 + Math.sin(1.1) * 10, 1.3, 0, 7); ctx.fill();
    }
    ringDot(2.5, 0.5);
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
    ctx.fillStyle = '#bfe8ff';
    for (const [cx2, cy2, cr] of [[-0.8, -0.2, 2.6], [0.7, 0.3, 2], [0.1, -1.1, 2.2]]) {
      ctx.save();
      ctx.translate(m.x + cx2 * m.r, m.y + cy2 * m.r); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-cr / 2, -cr / 2, cr, cr);
      ctx.restore();
    }
  }
  if (m.poisonT > 0) {
    ctx.fillStyle = '#4ad46a33';
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

function drawVendor(v) {
  const bob = Math.sin(G.time * 2) * 0.8;
  ctx.fillStyle = '#00000066';
  ctx.beginPath(); ctx.ellipse(v.x, v.y + 12, 11, 4.5, 0, 0, 7); ctx.fill();
  // robe
  const g = ctx.createLinearGradient(v.x, v.y - 10, v.x, v.y + 12);
  g.addColorStop(0, '#7a5a34'); g.addColorStop(1, '#4a3520');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(v.x - 9, v.y + 12);
  ctx.quadraticCurveTo(v.x - 10, v.y - 7 + bob, v.x, v.y - 10 + bob);
  ctx.quadraticCurveTo(v.x + 10, v.y - 7 + bob, v.x + 9, v.y + 12);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#c9a45a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(v.x - 8, v.y + 9); ctx.quadraticCurveTo(v.x, v.y + 11, v.x + 8, v.y + 9); ctx.stroke();
  // face in hood
  ctx.fillStyle = '#5a3f24';
  ctx.beginPath(); ctx.arc(v.x - 0.6, v.y - 14 + bob, 5.6, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8b890';
  ctx.beginPath(); ctx.arc(v.x + 1, v.y - 13.3 + bob, 3.7, 0, 7); ctx.fill();
  ctx.fillStyle = '#20140a';
  ctx.fillRect(v.x - 0.6, v.y - 13.9 + bob, 1.5, 1.5); ctx.fillRect(v.x + 2, v.y - 13.9 + bob, 1.5, 1.5);
  // grey beard
  ctx.fillStyle = '#b8b2a0';
  ctx.beginPath(); ctx.ellipse(v.x + 1, v.y - 10 + bob, 2.8, 2.2, 0, 0, 7); ctx.fill();
  // lantern staff
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(v.x + 8, v.y + 10); ctx.lineTo(v.x + 9.5, v.y - 14 + bob); ctx.stroke();
  const fl = Math.sin(G.time * 6) * 0.5;
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath(); ctx.arc(v.x + 9.5, v.y - 17 + bob, 3 + fl, 0, 7); ctx.fill();
  // name label
  ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText('⚖ Merchant', v.x, v.y - 30);
}

function drawMinimap() {
  const s = 124 * DPR / Math.max(MAP_W, MAP_H);
  mmCtx.setTransform(1, 0, 0, 1, 0, 0);
  mmCtx.clearRect(0, 0, mmCvs.width, mmCvs.height);
  for (let ty = 0; ty < MAP_H; ty++) for (let tx = 0; tx < MAP_W; tx++) {
    if (!G.lvl.seen[ty * MAP_W + tx]) continue;
    const t = G.lvl.map[ty][tx];
    if (t === T_WALL) continue;
    mmCtx.fillStyle = t === T_DOWN ? (G.lvl.locked ? '#c8281e' : '#ffd76a') : t === T_UP ? '#8fb3ff' : t === T_WP ? '#5ab0ff' : '#5a4a34';
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
  for (let i = 0; i < 4; i++) {
    const btn = $('btnSkill' + (i + 1)), sk = c.skills[i];
    btn.querySelector('.sicon').textContent = sk.icon;
    btn.querySelector('.cost').textContent = sk.mana;
    btn.title = sk.name + (sk.lvl ? ' (level ' + sk.lvl + ')' : '') + ' — ' + sk.desc;
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
  for (let i = 0; i < 4; i++) {
    const btn = $('btnSkill' + (i + 1)), sk = c.skills[i];
    const locked = p.level < (sk.lvl || 1);
    btn.querySelector('.cdmask').style.height = locked ? '0%' : (p.cd[i] / sk.cd * 100) + '%';
    btn.querySelector('.cost').textContent = locked ? 'Lv' + sk.lvl : sk.mana;
    btn.classList.toggle('lockedskill', locked);
    btn.classList.toggle('nomana', !locked && p.mp < sk.mana);
  }
}
function updateBadge() {
  $('charBadge').classList.toggle('hidden', !G || G.p.statPts <= 0);
}

/* panels */
function anyPanelOpen() {
  return ['charPanel', 'invPanel', 'pausePanel', 'wpPanel', 'shopPanel'].some(id => !$(id).classList.contains('hidden')) || !$('itemPopup').classList.contains('hidden');
}
function closePanels() {
  ['charPanel', 'invPanel', 'pausePanel', 'wpPanel', 'shopPanel', 'itemPopup'].forEach(id => $(id).classList.add('hidden'));
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
    if (id === 'wpPanel') renderWp();
    if (id === 'shopPanel') renderShop();
    paused = true;
  }
}

function renderWp() {
  const dests = [0, ...G.waypoints.filter(w => w > 0).sort((a, b) => a - b)];
  const nameOf = d => d === 0 ? '⛺ Sanctuary Town'
    : FLOOR_NAMES[Math.min(Math.floor((d - 1) / 3), FLOOR_NAMES.length - 1)] + ' · Floor ' + d;
  $('wpPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🌀 Waypoint</div>
    <div class="invactions" style="flex-direction:column">
      ${dests.map(d => `<button class="smallbtn" data-wp="${d}" ${d === G.dlvl ? 'disabled' : ''}>${nameOf(d)}${d === G.dlvl ? ' (here)' : ''}</button>`).join('')}
    </div>
    <div class="derived" style="text-align:center">Waypoints awaken on floors ${WP_FLOORS.slice(0, 5).join(', ')}…<br>Step on one to bind it forever.</div>`;
  $('wpPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('wpPanel').querySelectorAll('[data-wp]').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.wp;
    closePanels();
    if (d !== G.dlvl) enterLevel(d, false);
  }));
}

function renderShop() {
  const p = G.p, stock = G.lvl.shopStock || [];
  const potCost = 20 + G.deepest * 5;
  const rows = stock.map((it, i) => it ? `
    <div class="shoprow">
      <span class="sicon2">${it.icon}</span>
      <span class="snm"><span class="rc-${it.rarity}">${it.name}</span><br><small>${modLines(it).slice(0, 2).join(' · ') || it.slot}</small></span>
      <button class="smallbtn" data-buy-item="${i}" ${p.gold < sellPrice(it) * 3 || p.inv.length >= 24 ? 'disabled' : ''}>${sellPrice(it) * 3}g</button>
    </div>` : '').join('');
  $('shopPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">⚖ Merchant · 🪙 ${p.gold}</div>
    <div class="invactions">
      <button class="smallbtn" data-pot="hp" ${p.gold < potCost ? 'disabled' : ''}>🧪 Potion (${potCost}g)</button>
      <button class="smallbtn" data-pot="mp" ${p.gold < potCost ? 'disabled' : ''}>🔮 Potion (${potCost}g)</button>
    </div>
    ${rows || '<div class="derived" style="text-align:center">Sold out — return after your next descent.</div>'}
    <div class="derived" style="text-align:center">Sell your loot from the inventory 🎒</div>`;
  $('shopPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('shopPanel').querySelectorAll('[data-pot]').forEach(b => b.addEventListener('click', () => {
    if (p.gold < potCost) return;
    p.gold -= potCost; p.potions[b.dataset.pot]++;
    sfx.gold(); renderShop(); updateHUD(); saveDirty = true;
  }));
  $('shopPanel').querySelectorAll('[data-buy-item]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.buyItem, it = G.lvl.shopStock[i];
    if (!it || p.gold < sellPrice(it) * 3 || p.inv.length >= 24) return;
    p.gold -= sellPrice(it) * 3;
    p.inv.push(it);
    G.lvl.shopStock[i] = null;
    sfx.pickup(); renderShop(); updateHUD(); saveDirty = true;
  }));
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
      ${(d.fire + d.cold + d.light + d.poison) > 0
        ? 'Elemental: <b>' + [d.fire ? '🔥' + d.fire : '', d.cold ? '❄️' + d.cold : '', d.light ? '⚡' + d.light : '', d.poison ? '☠️' + d.poison : ''].filter(Boolean).join(' ') + '</b><br>'
        : ''}
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
  const gemLines = it.gems && it.gems.length
    ? '<br>' + it.gems.map(g => `<span style="color:${GEMS[g.g].color}">◆ ${GEMS[g.g].txt(g.v)}</span>`).join('<br>')
    : '';
  const sockHtml = it.sockets
    ? '<div class="isock">' + Array.from({ length: it.sockets }, (_, i) => {
      const g = it.gems && it.gems[i];
      return g ? `<span style="color:${GEMS[g.g].color}">◆</span>` : '<span style="color:#5a4c34">◇</span>';
    }).join(' ') + '</div>'
    : '';
  const gemTargets = it.g ? SLOTS.filter(s => {
    const e2 = p.equip[s];
    return e2 && e2.sockets && (e2.gems ? e2.gems.length : 0) < e2.sockets;
  }) : [];
  const rw = runewordOf(it);
  const rwHtml = rw
    ? `<div class="rword">⟪ ${rw.name} ⟫<span>${Object.keys(rw.mods).map(k => { const a = AFFIXES.find(a => a.stat === k); return a ? a.txt(rw.mods[k]) : ''; }).filter(Boolean).join(' · ')}</span></div>`
    : '';
  pop.innerHTML = `
    <div class="iname rc-${it.rarity}" ${it.g ? `style="color:${GEMS[it.g].color}"` : ''}>${it.icon} ${it.name}</div>
    <div class="ibase">${it.base !== it.name && !it.g ? it.base + ' · ' : ''}${it.slot} · item level ${it.lvl}</div>
    ${rwHtml}
    <div class="imods">${modLines(it).join('<br>') || '<i>no properties</i>'}${gemLines}</div>
    ${sockHtml}
    <div class="ibtns">
      ${equipped
        ? `<button class="smallbtn" data-act="unequip">Unequip</button>`
        : it.g
          ? gemTargets.map(s => `<button class="smallbtn" data-embed="${s}">◆ ${p.equip[s].name}</button>`).join('') +
            `<button class="smallbtn" data-act="sell">Sell ${sellPrice(it)}g</button>`
          : `<button class="smallbtn" data-act="equip">Equip</button>
             <button class="smallbtn" data-act="sell">Sell ${sellPrice(it)}g</button>`}
      <button class="smallbtn" data-act="close">Close</button>
    </div>`;
  pop.classList.remove('hidden');
  pop.querySelectorAll('[data-embed]').forEach(b => b.addEventListener('click', () => {
    const target = p.equip[b.dataset.embed];
    if (!target || !target.sockets) return;
    if (!target.gems) target.gems = [];
    if (target.gems.length >= target.sockets) return;
    target.gems.push({ g: it.g, v: it.v });
    p.inv.splice(ref, 1);
    recalc(); sfx.pickup();
    ftext(p.x, p.y - 30, GEMS[it.g].name + ' embedded!', GEMS[it.g].color, 13);
    const rw2 = runewordOf(target);
    if (rw2) { banner('⟪ ' + rw2.name + ' ⟫ — runeword awakened!'); sfx.level(); }
    pop.classList.add('hidden');
    saveDirty = true;
    renderInv(); updateHUD();
  }));
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
      Tap to move & attack · hold to run<br>Keyboard: WASD move · 1-4 skills · Q/E potions · I/C panels
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
  // vendor?
  if (G.lvl.vendor && dist(w.x, w.y, G.lvl.vendor.x, G.lvl.vendor.y) < 44) {
    if (dist(p.x, p.y, G.lvl.vendor.x, G.lvl.vendor.y) < 95) togglePanel('shopPanel');
    else setMoveTarget(G.lvl.vendor.x, G.lvl.vendor.y + 34);
    return;
  }
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
  if (k === '3') castSkill(2);
  if (k === '4') castSkill(3);
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
$('btnSkill3').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); castSkill(2); });
$('btnSkill4').addEventListener('pointerdown', e => { e.preventDefault(); audioInit(); castSkill(3); });
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
  requestAnimationFrame(frame);   // schedule first so one bad frame can never freeze the game
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  try {
    if (G && !paused && !anyPanelOpen()) update(dt);
    render();
  } catch (err) {
    console.error(err);
  }
}
requestAnimationFrame(frame);

/* autosave */
setInterval(() => { if (G && saveDirty) saveGame(); }, 8000);
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });

/* expose for debugging / tests */
window.__sanctuary = { get G() { return G; }, startGame, CLASSES, MTYPES, makeItem: (...a) => makeItem(...a), genLevel, enterLevel: d => enterLevel(d, false) };
