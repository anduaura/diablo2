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

const BOSS_NAMES = ['Gharok the Flayed', 'Mistress Vex', 'Korlath, Tomb Warden',
  'The Hollow King', 'Balegrim the Devourer', 'Ashmaw the Eternal'];

/* five themed worlds, one per 5-floor arc (cycling after floor 25).
   pal: f = floor variants, w = wall, wt = wall highlight, m = mortar,
   acc = accent · deco picks the floor decoration set · flame = torch color */
const WORLDS = [
  { name: 'Verdant Fields', deco: 'flowers', flame: '#ffb03a',
    pal: { f: ['#39482b', '#3f4e31', '#354427'], w: '#2c3a22', wt: '#3c4c30', m: '#141c0e', acc: '#d8b84a' } },
  { name: 'Frozen Tundra', deco: 'snow', flame: '#9adcff',
    pal: { f: ['#6f7988', '#77818f', '#67717f'], w: '#4a5462', wt: '#5e6876', m: '#2a323e', acc: '#bfe8ff' } },
  { name: 'Molten Caldera', deco: 'lava', flame: '#ff6a2a',
    pal: { f: ['#2c2422', '#302826', '#282020'], w: '#221a18', wt: '#322624', m: '#100a08', acc: '#ff6a2a' } },
  { name: 'Plains of Undeath', deco: 'graves', flame: '#9adc8a',
    pal: { f: ['#38323e', '#3c3642', '#342e3a'], w: '#2a2430', wt: '#38323e', m: '#120e16', acc: '#9adc8a' } },
  { name: 'Drowned Abyss', deco: 'shells', flame: '#4ad4c8',
    pal: { f: ['#1f3a42', '#234048', '#1b363e'], w: '#182e34', wt: '#24404a', m: '#0a161a', acc: '#4ad4c8' } },
];
const worldOf = dlvl => dlvl <= 0 ? 0 : Math.floor((dlvl - 1) / 5) % WORLDS.length;

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
  necromancer: {
    name: 'Necromancer', icon: '💀', color: '#9adc8a',
    desc: 'Master of the dead. Raises an army of skeletal minions.',
    base: { str: 14, dex: 18, vit: 22, ene: 36 }, primary: 'ene',
    weapon: { slot: 'weapon', base: 'Bone Wand', icon: '🦴', rarity: 'common', lvl: 1, dmg: [2, 5], mods: {} },
    atkRange: 310, atkCd: 0.6, ranged: true, projKind: 'bone',
    skills: [
      { id: 'bonespear', name: 'Bone Spear', icon: '🦴', mana: 10, cd: 1.8, desc: 'Piercing spear of bone: 190% damage' },
      { id: 'raiseskel', name: 'Raise Skeleton', icon: '💀', mana: 15, cd: 1.5, desc: 'Summon a skeletal warrior (more with level)' },
      { id: 'curse', name: 'Curse of Frailty', icon: '🕯️', mana: 14, cd: 6, lvl: 6, desc: 'Cursed foes take +50% damage for 8s' },
      { id: 'golem', name: 'Bone Golem', icon: '🗿', mana: 25, cd: 10, lvl: 12, desc: 'Summon a hulking golem to tank for you' }],
  },
};
/* companion pets: six species from humble hound to DRAGON. Each pet also
   rolls a rarity grade (like items) that scales its random aura buffs and
   combat power. Only one travels with you; the rest wait at the stable. */
const PET_SPECIES = [
  { id: 'hound', name: 'Hound', icon: '🐕', price: 300, dmgMult: 0.3, kind: 'melee' },
  { id: 'wolf', name: 'Dire Wolf', icon: '🐺', price: 1200, dmgMult: 0.45, kind: 'melee' },
  { id: 'hawk', name: 'Hawk', icon: '🦅', price: 2500, dmgMult: 0.55, kind: 'fly' },
  { id: 'tiger', name: 'Tiger', icon: '🐯', price: 5000, dmgMult: 0.65, kind: 'melee' },
  { id: 'drake', name: 'Ember Drake', icon: '🐉', price: 12000, dmgMult: 0.8, kind: 'rangedfly' },
  { id: 'dragon', name: 'Dragon', icon: '🐲', price: 30000, dmgMult: 1.1, kind: 'dragon' },
];
const PET_RARITIES = ['common', 'magic', 'rare', 'unique', 'exotic'];
const STARTER_PET = { warrior: 0, sorceress: 1, huntress: 2, necromancer: -1 };
function rollPetRarity() {
  const r = Math.random();
  return r < 0.05 ? 'exotic' : r < 0.15 ? 'unique' : r < 0.4 ? 'rare' : r < 0.75 ? 'magic' : 'common';
}
function makePetData(spIdx, rarity) {
  const sp = PET_SPECIES[spIdx];
  const rIdx = PET_RARITIES.indexOf(rarity);
  const nMods = [1, ri(1, 2), ri(2, 3), 3, 4][rIdx];
  const mult = [0.7, 1, 1.3, 1.7, 2.2][rIdx];
  const ilvl = 2 + spIdx * 4;   // exotic species roll bigger buffs
  const mods = {}, used = new Set();
  for (let i = 0; i < nMods; i++) {
    const a = choice(AFFIXES);
    if (used.has(a.stat)) continue;
    used.add(a.stat);
    mods[a.stat] = (mods[a.stat] || 0) + Math.max(1, Math.round(a.roll(ilvl) * mult));
  }
  return { sp: spIdx, rarity, mods, price: Math.round(sp.price * (1 + rIdx * 0.6)) };
}

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
const WEAPON_ICONS = { warrior: ['🗡️', '⚔️', '🪓', '🔨'], sorceress: ['🪄', '🦯', '🔱'], huntress: ['🏹'], necromancer: ['🦴', '🪄'] };
const BASE_NAMES = {
  weapon: { warrior: ['Sword', 'War Axe', 'Great Maul', 'Broad Blade'], sorceress: ['Staff', 'Rune Rod', 'Grim Scepter'], huntress: ['Hunting Bow', 'War Bow', 'Razor Bow'], necromancer: ['Bone Wand', 'Skull Scepter', 'Tomb Staff'] },
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
/* wearable sets: fixed per-piece mods plus escalating bonuses (index =
   pieces worn) that activate as you equip more of the same set */
const SETS = {
  gravewarden: {
    name: "Gravewarden's Vigil",
    pieces: { helm: 'Gravewarden Casque', armor: 'Gravewarden Carapace', boots: 'Gravewarden Treads', amulet: 'Gravewarden Sigil' },
    pieceMods: { vit: 8, armor: 12, hp: 20 },
    bonuses: [null, null, { hp: 40, armor: 25 }, { vit: 15, leech: 5 }, { hp: 100, dmgPct: 20 }],
  },
  tempest: {
    name: 'Tempest Covenant',
    pieces: { weapon: 'Tempest Fang', ring: 'Tempest Loop', amulet: 'Tempest Eye', helm: 'Tempest Crown' },
    pieceMods: { ene: 8, mp: 15, lightDmg: 4 },
    bonuses: [null, null, { lightDmg: 10, coldDmg: 8 }, { dmgPct: 20, mp: 40 }, { fireDmg: 12, lightDmg: 15, ene: 20 }],
  },
  wolfpack: {
    name: "Wolfpack's Hunt",
    pieces: { weapon: 'Wolfpack Claw', armor: 'Wolfpack Hide', boots: 'Wolfpack Lopers', ring: 'Wolfpack Band' },
    pieceMods: { dex: 8, dmgPct: 8 },
    bonuses: [null, null, { dex: 12, mf: 15 }, { dmgPct: 15, leech: 4 }, { dex: 25, dmgPct: 30 }],
  },
};
const EXOTIC_NAMES = ['Voidfang', 'Starweaver', 'Nightmare Coil', 'Soulrender', 'Dawnbreaker', 'Chaosbrand', 'The Unmaking'];

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
  const starter = STARTER_PET[clsId] >= 0 ? [makePetData(STARTER_PET[clsId], 'common')] : [];
  return {
    pets: starter, activePet: starter.length ? 0 : -1,
    cls: clsId, x: 0, y: 0, r: 14, dir: 0,
    level: 1, xp: 0, statPts: 0, gold: 0,
    stats: { ...c.base },
    equip: { weapon: JSON.parse(JSON.stringify(c.weapon)), helm: null, armor: null, boots: null, ring: null, amulet: null },
    inv: [], potions: { hp: 2, mp: 1 },
    hp: 1, mp: 1,                     // set by recalc
    bagSlots: 24,
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
  // active companion's aura buffs the hero
  const actPet = p.pets && p.pets[p.activePet];
  if (actPet) for (const k in actPet.mods) m[k] = (m[k] || 0) + actPet.mods[k];
  // set bonuses: each threshold up to the worn count applies
  const setCount = {};
  for (const s of SLOTS) {
    const it = p.equip[s];
    if (it && it.set) setCount[it.set] = (setCount[it.set] || 0) + 1;
  }
  for (const sid in setCount) {
    const def = SETS[sid];
    if (!def) continue;
    for (let n = 2; n <= setCount[sid] && n < def.bonuses.length; n++) {
      const b = def.bonuses[n];
      if (b) for (const k in b) m[k] = (m[k] || 0) + b[k];
    }
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
  const ngm = 1 + (G && G.ng || 0) * 0.8;   // New Game+ multiplier
  const scaleHp = (1 + 0.4 * (dlvl - 1) + 0.05 * (dlvl - 1) * (dlvl - 1)) * ngm;
  const scaleDmg = (1 + 0.22 * (dlvl - 1)) * ngm;
  const scaleXp = (1 + 0.3 * (dlvl - 1)) * ngm;
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
    const isFinal = dlvl === 25;
    const bt = isFinal
      ? { id: 'boss', name: 'MALGOROTH, LORD OF THE ABYSS', hp: 700, dmg: [18, 28], spd: 88, r: 34, xp: 800, gold: [300, 500], atkCd: 1.0, range: 64, w: 0, minL: 1, color: '#7a0c20' }
      : { id: 'boss', name: choice(BOSS_NAMES), hp: 240, dmg: [12, 20], spd: 78, r: 26, xp: 160, gold: [60, 120], atkCd: 1.1, range: 52, w: 0, minL: 1, color: '#a01818' };
    boss = makeMonster(bt, exit.cx * TILE + TILE / 2, exit.cy * TILE - TILE, scaleHp, scaleDmg, scaleXp, false, true, dlvl);
    if (isFinal) { boss.final = true; boss.summonT = 6; boss.novaT = 2; }
    monsters.push(boss);
  }

  // dungeon events: shrines, treasure chests, gold piles
  const shrines = [], chests = [], goldPiles = [];
  const SHRINE_KINDS = ['combat', 'armor', 'speed', 'healing', 'gem', 'xp'];
  for (const room of rooms) {
    if (room === r0 || room === exit) continue;
    const mx = room.x + Math.floor(room.w / 2), topY = room.y + 1, botY = room.y + room.h - 2;
    if (Math.random() < 0.25 && shrines.length < 2 && map[topY][mx] === T_FLOOR) {
      shrines.push({ x: mx * TILE + TILE / 2, y: topY * TILE + TILE / 2, kind: choice(SHRINE_KINDS), used: false });
    } else if (Math.random() < 0.2 && chests.length < 2 && map[botY][mx] === T_FLOOR) {
      chests.push({ x: mx * TILE + TILE / 2, y: botY * TILE + TILE / 2, opened: false });
    } else if (Math.random() < 0.18) {
      const gx = Math.floor(room.x + rand(1, room.w - 1)), gy = Math.floor(room.y + rand(1, room.h - 1));
      if (map[gy][gx] === T_FLOOR) goldPiles.push({ x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2 });
    }
  }

  return {
    map, rooms, torches, monsters, boss, wp, shrines, chests, goldPiles,
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
  const ilvl = Math.max(1, ((G && G.deepest) || 1) + (G && G.ng || 0) * 8);
  const shopStock = [];
  for (let i = 0; i < 4; i++) shopStock.push(makeItem(choice(SLOTS), ilvl, Math.random() < 0.15 ? 'rare' : 'magic'));
  return {
    map, rooms: [R], torches, monsters: [], boss: null, shrines: [], chests: [], goldPiles: [],
    wp: { x: (R.x + 2) * TILE + TILE / 2, y: R.cy * TILE + TILE / 2 },
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: false,
    entrance: { x: R.cx * TILE + TILE / 2, y: (R.cy + 2) * TILE + TILE / 2 },
    exitTile: { x: R.x + R.w - 2, y: R.cy },
    vendor: { x: (R.x + 5) * TILE + TILE / 2, y: (R.y + 2) * TILE + TILE / 2 },
    stash: { x: (R.x + 8) * TILE + TILE / 2, y: (R.y + 2) * TILE + TILE / 2 },
    stable: { x: (R.x + 3) * TILE + TILE / 2, y: (R.y + 8) * TILE + TILE / 2 },
    petStock: Array.from({ length: 3 }, () => makePetData(ri(0, PET_SPECIES.length - 1), rollPetRarity())),
    shopStock,
  };
}

/* ---------------- shared town stash ---------------- */
const STASH_KEY = 'sanctuary_stash';
const STASH_MAX = 48;
function loadStash() { try { return JSON.parse(localStorage.getItem(STASH_KEY)) || []; } catch (e) { return []; } }
function saveStash(s) { try { localStorage.setItem(STASH_KEY, JSON.stringify(s)); } catch (e) { } }

const CHAMP_AFFIXES = {
  fire: { name: 'Fire-Enchanted', color: '#ff8a3a' },
  frost: { name: 'Frostbound', color: '#7ac8ff' },
  storm: { name: 'Storm-Charged', color: '#ffd23a' },
  vampiric: { name: 'Vampiric', color: '#c8281e' },
};
function makeMonster(t, x, y, sh, sd, sx, champ, isBoss, dlvl) {
  const hp = Math.round(t.hp * sh * (champ ? 2.2 : 1) * (isBoss ? 1 : 1));
  const affix = champ ? choice(Object.keys(CHAMP_AFFIXES)) : null;
  return {
    affix, stormT: rand(1, 3),
    type: t, x, y, r: t.r * (champ ? 1.25 : 1),
    hp, maxHp: hp,
    dmg: [Math.round(t.dmg[0] * sd * (champ ? 1.5 : 1)), Math.round(t.dmg[1] * sd * (champ ? 1.5 : 1))],
    spd: t.spd * rand(0.9, 1.1), xp: Math.round(t.xp * sx * (champ ? 2.5 : 1)),
    gold: t.gold, atkCd: t.atkCd, range: t.range, ranged: !!t.ranged,
    champ, boss: isBoss, name: champ ? CHAMP_AFFIXES[affix].name + ' ' + t.name : t.name, dlvl,
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
    rarity = r < 0.006 * mf ? 'exotic' : r < 0.02 * mf ? 'unique' : r < 0.035 * mf ? 'set'
      : r < 0.13 * mf ? 'rare' : r < 0.43 * mf ? 'magic' : 'common';
  }
  if (rarity === 'set') {
    const pool = Object.keys(SETS).filter(k => SETS[k].pieces[slot]);
    const sid = choice(pool);
    const def = SETS[sid];
    const it = {
      slot, set: sid, base: def.pieces[slot], name: def.pieces[slot],
      icon: slot === 'weapon' ? choice(WEAPON_ICONS[clsId]) : SLOT_ICONS[slot],
      rarity: 'set', lvl: ilvl, mods: { ...def.pieceMods },
    };
    if (slot === 'weapon') it.dmg = [2 + ilvl * 2, 5 + ilvl * 3];
    else if (slot !== 'ring' && slot !== 'amulet') it.armor = 3 + Math.round(ilvl * 2.5);
    return it;
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
  const nAff = rarity === 'exotic' ? 5 : rarity === 'rare' ? ri(3, 4) : rarity === 'magic' ? ri(1, 2) : 0;
  const used = new Set();
  for (let i = 0; i < nAff; i++) {
    const a = choice(AFFIXES);
    if (used.has(a.stat)) continue;
    used.add(a.stat);
    let v = a.roll(ilvl);
    if (rarity === 'exotic') v = Math.max(1, Math.round(v * 1.5));
    it.mods[a.stat] = (it.mods[a.stat] || 0) + v;
  }
  if (slot === 'weapon') it.sockets = Math.random() < 0.08 ? 2 : Math.random() < 0.25 ? 1 : 0;
  else if (slot === 'helm' || slot === 'armor') it.sockets = Math.random() < 0.15 ? 1 : 0;
  if (it.sockets) it.gems = [];
  if (rarity === 'magic') it.name = base + ' ' + choice(['of Power', 'of the Fox', 'of the Wolf', 'of Souls', 'of Embers', 'of Frost', 'of the Colossus']);
  if (rarity === 'rare') it.name = choice(['Doom', 'Grim', 'Storm', 'Blood', 'Shadow', 'Bone', 'Raven']) + choice([' Spike', ' Ward', ' Song', ' Grasp', ' Veil', ' Brand']) ;
  if (rarity === 'exotic') {
    it.name = choice(EXOTIC_NAMES);
    if (slot === 'weapon') {
      it.sockets = 2; it.gems = [];
      it.dmg = [Math.round(it.dmg[0] * 1.3), Math.round(it.dmg[1] * 1.3)];
    }
  }
  return it;
}
const sellPrice = it => ({ common: 8, magic: 25, rare: 70, unique: 200, set: 120, exotic: 320 }[it.rarity] + it.lvl * 6);
/* rough power score used by auto-equip to compare items */
function itemScore(it) {
  if (!it) return -1;
  let s = 0;
  if (it.dmg) s += (it.dmg[0] + it.dmg[1]) * 1.5;
  if (it.armor) s += it.armor * 2;
  const m = it.mods || {};
  s += (m.str || 0) + (m.dex || 0) + (m.vit || 0) + (m.ene || 0);
  s += (m.hp || 0) * 0.4 + (m.mp || 0) * 0.3;
  s += (m.dmgPct || 0) * 1.2 + (m.armor || 0) * 1.5;
  s += (m.leech || 0) * 3 + (m.mf || 0) * 0.5;
  s += ((m.fireDmg || 0) + (m.coldDmg || 0) + (m.lightDmg || 0) + (m.poisonDmg || 0)) * 1.5;
  if (it.gems) for (const g of it.gems) s += g.v * 1.5;
  const rw = runewordOf(it);
  if (rw) for (const k in rw.mods) s += rw.mods[k];
  s += (it.sockets || 0) * 4;
  if (it.set) s += 10;   // set potential counts for something
  return s;
}
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
function playerAtk() { return Math.round(ri(G.d.dmgLo, G.d.dmgHi) * (G.p.rageT > 0 ? 1.6 : 1) * (G.buffDmg > 0 ? 1.4 : 1)); }

function hitMonster(m, dmg, opts) {
  opts = opts || {};
  if (m.hp <= 0) return;
  const crit = !opts.noCrit && Math.random() < G.d.crit;
  if (crit) dmg = Math.round(dmg * 1.8);
  if (m.curseT > 0) dmg = Math.round(dmg * 1.5);
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
  if (!opts.noLeech && G.d.leech > 0) G.p.hp = Math.min(G.d.maxHp, G.p.hp + dmg * G.d.leech);
  if (m.hp <= 0) killMonster(m);
}

function grantLevelUps() {
  const p = G.p;
  while (p.xp >= xpNext(p.level)) {
    p.xp -= xpNext(p.level); p.level++; p.statPts += 5;
    recalc(); p.hp = G.d.maxHp; p.mp = G.d.maxMp;
    banner('LEVEL ' + p.level + '!  +5 stat points');
    burst(p.x, p.y, '#ffd76a', 30, 200);
    spark(p.x, p.y, '#ffd76a', 30, 260);
    G.rings.push({ x: p.x, y: p.y, r: 8, max: 70, color: '#ffd76a', life: 0.5 });
    sfx.level(); updateBadge();
  }
}

function activateShrine(s) {
  const p = G.p;
  spark(s.x, s.y - 14, '#bfe8ff', 18, 200); sfx.level();
  switch (s.kind) {
    case 'combat': G.buffDmg = 30; banner('Shrine of Battle — +40% damage!'); break;
    case 'armor': G.buffArmor = 30; banner('Shrine of Stone — +50% armor!'); break;
    case 'speed': G.buffSpd = 30; banner('Shrine of Wind — +25% speed!'); break;
    case 'healing':
      p.hp = G.d.maxHp; p.mp = G.d.maxMp;
      burst(p.x, p.y - 10, '#ff8a7a', 14, 120);
      banner('Shrine of Life — fully restored!');
      break;
    case 'gem':
      G.drops.push({ kind: 'item', item: makeGem(Math.max(1, G.dlvl + (G.ng || 0) * 8)), x: s.x + rand(-14, 14), y: s.y + 24 });
      banner('Gem Shrine — a jewel appears!');
      break;
    case 'xp': {
      const amt = Math.round(xpNext(p.level) * 0.35);
      p.xp += amt;
      ftext(s.x, s.y - 22, '+' + amt + ' xp', '#b8a4e8', 14);
      banner('Shrine of Wisdom!');
      grantLevelUps();
      break;
    }
  }
  updateHUD(); saveDirty = true;
}

function openChest(ch) {
  const ilvl = Math.max(1, G.dlvl + (G.ng || 0) * 8);
  G.drops.push({ kind: 'gold', amt: Math.round(ri(20, 60) * (1 + G.dlvl * 0.3) * (1 + (G.ng || 0) * 0.6)), x: ch.x + rand(-18, 18), y: ch.y + 26 });
  const n = ri(1, 2);
  for (let i = 0; i < n; i++) {
    G.drops.push({ kind: 'item', item: makeItem(choice(SLOTS), ilvl, Math.random() < 0.25 ? 'rare' : null), x: ch.x + rand(-24, 24), y: ch.y + rand(16, 32) });
  }
  if (Math.random() < 0.3) G.drops.push({ kind: 'item', item: makeGem(ilvl), x: ch.x, y: ch.y + 36 });
  burst(ch.x, ch.y - 6, '#e8c14d', 14, 140);
  spark(ch.x, ch.y - 6, '#ffe9b0', 8, 160);
  sfx.gold();
  banner('Treasure!');
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
  grantLevelUps();
  dropLoot(m);
  if (m.affix === 'fire') {   // fire-enchanted champions explode on death
    for (let k = 0; k < 8; k++) shoot(m.x, m.y, k / 8 * Math.PI * 2, 260, Math.round(m.dmg[1] * 0.9), 'm', { kind: 'fireball', r: 5 });
    G.rings.push({ x: m.x, y: m.y, r: 6, max: 62, color: '#ff8a3a', life: 0.25 });
    sfx.fire();
  }
  if (m.boss) {
    G.lvl.locked = false;
    banner(m.name + ' has fallen! The stairs open…');
    sfx.boss();
    if (m.final) showVictory();
  }
  saveDirty = true;
}

function showVictory() {
  const p = G.p;
  $('victoryInfo').textContent =
    'Malgoroth is no more. ' + CLASSES[p.cls].name + ' of level ' + p.level +
    (G.ng ? ', conqueror of NG+' + G.ng : '') + ' — Sanctuary is saved… for now.';
  $('victoryScreen').classList.remove('hidden');
  saveGame();
}
function newGamePlus() {
  G.ng = (G.ng || 0) + 1;
  G.waypoints = [];
  G.deepest = 1;
  const p = G.p;
  recalc(); p.hp = G.d.maxHp; p.mp = G.d.maxMp;
  $('victoryScreen').classList.add('hidden');
  enterLevel(0, true);
  banner('NEW GAME+' + G.ng + ' — the abyss deepens…');
  sfx.boss();
}

function dropLoot(m) {
  const x = m.x, y = m.y, dlvl = G.dlvl;
  const scatter = () => ({ x: x + rand(-22, 22), y: y + rand(-22, 22) });
  const rGold = m.boss ? 1 : 0.62, rPot = m.boss ? 1 : 0.16, rItem = m.boss ? 1 : (m.champ ? 0.55 : 0.17);
  const ngb = (G.ng || 0);
  if (Math.random() < rGold) {
    const amt = Math.round(ri(m.gold[0], m.gold[1]) * (1 + dlvl * 0.25) * (1 + ngb * 0.6));
    G.drops.push({ kind: 'gold', amt, ...scatter() });
  }
  if (Math.random() < rPot) G.drops.push({ kind: Math.random() < 0.6 ? 'hpPot' : 'mpPot', ...scatter() });
  if (Math.random() < rItem) {
    const slot = choice(SLOTS);
    const r3 = Math.random();
    const it = makeItem(slot, Math.max(1, dlvl + ri(-1, 1) + ngb * 8),
      m.boss ? (r3 < 0.12 ? 'exotic' : r3 < 0.35 ? 'unique' : r3 < 0.55 ? 'set' : 'rare') : null);
    G.drops.push({ kind: 'item', item: it, ...scatter() });
  }
  if (Math.random() < (m.boss ? 0.8 : 0.06)) G.drops.push({ kind: 'item', item: makeGem(Math.max(1, dlvl + ngb * 8)), ...scatter() });
}

function hurtPlayer(dmg, mlvl) {
  const p = G.p;
  const arm = G.d.armor * (G.buffArmor > 0 ? 1.5 : 1);
  const red = clamp(arm / (arm + 60 + 12 * (mlvl || G.dlvl)), 0, 0.75);
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
    case 'bonespear':
      shoot(p.x, p.y, aim, 540, atk * 1.9, 'p', { kind: 'bolt', r: 5, pierce: true, ele: true, color: '#e0dbcc' });
      sfx.shoot();
      break;
    case 'raiseskel': {
      const cap = Math.min(5, 2 + Math.floor(p.level / 8));
      if (G.minions.filter(mi => mi.kind === 'skel').length >= cap) {
        p.mp += sk.mana; p.cd[i] = 0;
        ftext(p.x, p.y - 30, 'Your army is full (' + cap + ')', '#9adc8a', 12);
        break;
      }
      const mi = makeMinion('skel');
      G.minions.push(mi);
      burst(mi.x, mi.y, '#cfc9b8', 12, 120);
      spark(mi.x, mi.y, '#9adc8a', 8, 140);
      sfx.potion();
      break;
    }
    case 'curse': {
      const cx2 = t ? t.x : p.x + Math.cos(aim) * 120;
      const cy2 = t ? t.y : p.y + Math.sin(aim) * 120;
      let hitAny = false;
      for (const m of G.lvl.monsters) {
        if (m.hp <= 0) continue;
        if (dist(cx2, cy2, m.x, m.y) < 140 + m.r) { m.curseT = 8; m.aggro = true; hitAny = true; }
      }
      G.rings.push({ x: cx2, y: cy2, r: 12, max: 140, color: '#b86adf', life: 0.35 });
      spark(cx2, cy2, '#b86adf', 12, 180);
      if (hitAny) banner('Cursed!');
      sfx.boss();
      break;
    }
    case 'golem': {
      for (let k = G.minions.length - 1; k >= 0; k--) {
        if (G.minions[k].kind === 'golem') { burst(G.minions[k].x, G.minions[k].y, '#cfc9b8', 10, 100); G.minions.splice(k, 1); }
      }
      const g2 = makeMinion('golem');
      G.minions.push(g2);
      burst(g2.x, g2.y, '#cfc9b8', 18, 160);
      spark(g2.x, g2.y, '#9adc8a', 12, 180);
      shake(0.15);
      sfx.boss();
      break;
    }
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

/* ---------------- loot collection (hero, pets & minions) ---------------- */
function collectDropsAt(x, y) {
  const p = G.p;
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const dr = G.drops[i];
    const dd = dist(x, y, dr.x, dr.y);
    if (dr.kind === 'gold' && dd < 34) {
      p.gold += dr.amt; ftext(dr.x, dr.y - 12, '+' + dr.amt + ' gold', '#e8c14d', 12);
      G.drops.splice(i, 1); sfx.gold(); updateHUD(); saveDirty = true;
    } else if ((dr.kind === 'hpPot' || dr.kind === 'mpPot') && dd < 34) {
      p.potions[dr.kind === 'hpPot' ? 'hp' : 'mp']++;
      ftext(dr.x, dr.y - 12, dr.kind === 'hpPot' ? 'Health Potion' : 'Mana Potion', dr.kind === 'hpPot' ? '#ff8a7a' : '#8fb3ff', 12);
      G.drops.splice(i, 1); sfx.pickup(); updateHUD(); saveDirty = true;
    } else if (dr.kind === 'item' && dd < 30) {
      const it = dr.item;
      if (G.autoEquip && !it.g && itemScore(it) > itemScore(p.equip[it.slot])) {
        // auto-equip upgrades; old piece goes to the bag (or the floor if full)
        const old = p.equip[it.slot];
        p.equip[it.slot] = it;
        if (old) {
          if (p.inv.length < p.bagSlots) p.inv.push(old);
          else G.drops.push({ kind: 'item', item: old, x: dr.x + rand(-10, 10), y: dr.y + rand(-10, 10) });
        }
        recalc();
        ftext(dr.x, dr.y - 12, '⬆ ' + it.name + ' equipped!', rarityColor(it.rarity), 13);
        spark(p.x, p.y - 10, rarityColor(it.rarity), 8, 140);
        G.drops.splice(i, 1); sfx.pickup(); saveDirty = true; updateHUD();
      } else if (G.autoSell > 0 && !it.g && !(it.sockets >= 2) &&
        (it.rarity === 'common' || (G.autoSell >= 2 && it.rarity === 'magic'))) {
        // auto-sell junk straight to gold (2-socket runeword bases are kept)
        const gold = sellPrice(it);
        p.gold += gold;
        ftext(dr.x, dr.y - 12, '+' + gold + 'g — ' + it.name + ' sold', '#e8c14d', 12);
        G.drops.splice(i, 1); sfx.gold(); saveDirty = true; updateHUD();
      } else if (p.inv.length >= p.bagSlots) {
        if (!dr.fullMsg) { ftext(p.x, p.y - 30, 'Inventory full!', '#ff8a7a', 13); dr.fullMsg = true; }
      } else {
        p.inv.push(it);
        ftext(dr.x, dr.y - 12, it.name, it.g ? GEMS[it.g].color : rarityColor(it.rarity), 13);
        G.drops.splice(i, 1); sfx.pickup(); saveDirty = true;
      }
      if (!G.drops.includes(dr) && !$('invPanel').classList.contains('hidden')) renderInv();
    }
  }
}
function tryOpenChests(x, y, r) {
  for (const ch of G.lvl.chests || []) {
    if (!ch.opened && dist(x, y, ch.x, ch.y) < r) { ch.opened = true; openChest(ch); }
  }
}
function findFetchTarget(x, y) {
  // nearest drop or unopened chest, leashed to the hero's surroundings
  const p = G.p;
  let best = null, bd = 1e9;
  for (const dr of G.drops) {
    if (dr.kind === 'item' && p.inv.length >= p.bagSlots) continue;   // don't hover over unpickable items
    if (dist(p.x, p.y, dr.x, dr.y) > 280) continue;
    const d = dist(x, y, dr.x, dr.y);
    if (d < bd) { bd = d; best = dr; }
  }
  for (const ch of G.lvl.chests || []) {
    if (ch.opened) continue;
    if (dist(p.x, p.y, ch.x, ch.y) > 280) continue;
    const d = dist(x, y, ch.x, ch.y);
    if (d < bd) { bd = d; best = ch; }
  }
  return best;
}
function blinkToMaster(e, flying) {
  // helpers that fall out of sight teleport back to the hero
  const p = G.p;
  if (dist(e.x, e.y, p.x, p.y) < 460) return false;
  burst(e.x, e.y, '#9adcff', 6, 90);
  e.x = p.x + rand(-36, 36);
  e.y = p.y + rand(-26, 26);
  if (!flying && !circleFree(e.x, e.y, e.r || 10)) { e.x = p.x; e.y = p.y; }
  spark(e.x, e.y, '#9adcff', 8, 140);
  return true;
}

/* ---------------- minions & pets ---------------- */
function makeMinion(kind) {
  const p = G.p, lvl = p.level;
  const mult = 1 + G.d.ene * 0.008;
  const base = kind === 'golem'
    ? { hp: 120 + lvl * 22, dmg: [8 + lvl * 2, 14 + lvl * 3], spd: 100, r: 17, range: 34, atkCd: 1.2 }
    : { hp: 30 + lvl * 8, dmg: [3 + lvl, 6 + Math.round(lvl * 1.6)], spd: 150, r: 11, range: 26, atkCd: 0.9 };
  return {
    isMinion: true, kind,
    x: p.x + rand(-34, 34), y: p.y + rand(-30, 30),
    hp: Math.round(base.hp * mult), maxHp: Math.round(base.hp * mult),
    dmg: [Math.round(base.dmg[0] * mult), Math.round(base.dmg[1] * mult)],
    spd: base.spd, r: base.r, range: base.range, atkCd: base.atkCd,
    atkT: rand(0, 0.4), dir: 0, swingT: 0, hurtT: 0,
    off: { x: rand(-30, 30), y: rand(-22, 22) },
  };
}
function spawnPet(data) {
  const p = G.p;
  return { isPet: true, kind: PET_SPECIES[data.sp].id, data, x: p.x + rand(-30, 30), y: p.y + 20, dir: 0, atkT: 0, swingT: 0 };
}
function hurtMinion(mi, dmg) {
  mi.hp -= dmg; mi.hurtT = 0.15;
  ftext(mi.x, mi.y - mi.r - 6, '-' + Math.round(dmg), '#9aa8b8', 11);
}
function minionDmg(mi) {
  let d = ri(mi.dmg[0], mi.dmg[1]);
  return d;
}

function updateMinions(dt) {
  const p = G.p;
  for (let i = G.minions.length - 1; i >= 0; i--) {
    const mi = G.minions[i];
    if (mi.hp <= 0) {
      burst(mi.x, mi.y, '#cfc9b8', 12, 130);
      ftext(mi.x, mi.y - 14, mi.kind === 'golem' ? 'Golem crumbles' : 'Skeleton falls', '#9aa8b8', 11);
      G.minions.splice(i, 1);
      continue;
    }
    mi.atkT -= dt;
    mi.swingT = Math.max(0, mi.swingT - dt);
    mi.hurtT = Math.max(0, mi.hurtT - dt);
    // find a monster near the master
    let best = null, bd = 1e9;
    for (const m of G.lvl.monsters) {
      if (m.hp <= 0) continue;
      if (dist(p.x, p.y, m.x, m.y) > 340) continue;   // leash to the master
      const dd = dist(mi.x, mi.y, m.x, m.y);
      if (dd < bd) { bd = dd; best = m; }
    }
    if (best) {
      mi.dir = Math.atan2(best.y - mi.y, best.x - mi.x);
      if (bd < best.r + mi.range) {
        if (mi.atkT <= 0) {
          mi.atkT = mi.atkCd; mi.swingT = 0.2;
          hitMonster(best, minionDmg(mi), { noCrit: true, noLeech: true });
        }
      } else moveCircle(mi, Math.cos(mi.dir) * mi.spd * dt, Math.sin(mi.dir) * mi.spd * dt);
    } else {
      if (blinkToMaster(mi, false)) continue;
      // idle skeletons haul loot and pry open chests
      const fetch = findFetchTarget(mi.x, mi.y);
      if (fetch) {
        const a = Math.atan2(fetch.y - mi.y, fetch.x - mi.x);
        mi.dir = a;
        moveCircle(mi, Math.cos(a) * mi.spd * dt, Math.sin(a) * mi.spd * dt);
        collectDropsAt(mi.x, mi.y);
        tryOpenChests(mi.x, mi.y, 32);
        continue;
      }
      const fx = p.x - Math.cos(p.dir) * 40 + mi.off.x, fy = p.y - Math.sin(p.dir) * 24 + mi.off.y;
      if (dist(mi.x, mi.y, fx, fy) > 30) {
        const a = Math.atan2(fy - mi.y, fx - mi.x);
        mi.dir = a;
        moveCircle(mi, Math.cos(a) * mi.spd * dt, Math.sin(a) * mi.spd * dt);
      }
    }
    // gentle separation between minions
    for (let j = i - 1; j >= 0; j--) {
      const o = G.minions[j];
      const dx = o.x - mi.x, dy = o.y - mi.y, dd = Math.hypot(dx, dy), min = o.r + mi.r;
      if (dd > 0.01 && dd < min) {
        const push = (min - dd) / 2;
        moveCircle(mi, -dx / dd * push, -dy / dd * push);
        moveCircle(o, dx / dd * push, dy / dd * push);
      }
    }
  }
}

function updatePet(dt) {
  const pet = G.pet, p = G.p;
  if (!pet) return;
  const def = PET_SPECIES[pet.data.sp];
  const rIdx = PET_RARITIES.indexOf(pet.data.rarity);
  pet.atkT -= dt;
  pet.swingT = Math.max(0, pet.swingT - dt);
  const flying = def.kind !== 'melee';
  const isRanged = def.kind === 'ranged' || def.kind === 'rangedfly' || def.kind === 'dragon';
  const spd = 210 + rIdx * 12;
  // nearest monster near the hero
  let best = null, bd = isRanged ? 240 : 150;
  for (const m of G.lvl.monsters) {
    if (m.hp <= 0 || !m.aggro) continue;
    if (dist(p.x, p.y, m.x, m.y) > 300) continue;
    const dd = dist(pet.x, pet.y, m.x, m.y);
    if (dd < bd) { bd = dd; best = m; }
  }
  if (best) {
    pet.dir = Math.atan2(best.y - pet.y, best.x - pet.x);
    const atkRange = isRanged ? 190 : best.r + 22;
    if (bd < atkRange) {
      if (pet.atkT <= 0) {
        pet.atkT = 1.15; pet.swingT = 0.2;
        const dmg = Math.max(1, Math.round(playerAtk() * def.dmgMult * (1 + 0.15 * rIdx)));
        if (def.kind === 'dragon') {
          shoot(pet.x, pet.y - 22, pet.dir, 380, dmg, 'p', { kind: 'fireball', r: 5, aoe: 48 });
          sfx.fire();
        } else if (def.kind === 'rangedfly') {
          shoot(pet.x, pet.y - 18, pet.dir, 430, dmg, 'p', { kind: 'fire', r: 3.5, color: '#ff9a4a' });
          sfx.shoot();
        } else if (def.kind === 'ranged') {
          shoot(pet.x, pet.y - 14, pet.dir, 420, dmg, 'p', { kind: 'fire', r: 3.5, color: '#b8a4ff' });
          sfx.shoot();
        } else {
          hitMonster(best, dmg, { noCrit: true, noLeech: true });
          sfx.hit();
        }
      }
      if (!flying) return;
    }
    const mv = spd * dt;
    if (bd >= atkRange) {
      if (flying) { pet.x += Math.cos(pet.dir) * mv; pet.y += Math.sin(pet.dir) * mv; }
      else moveCircle(pet, Math.cos(pet.dir) * mv, Math.sin(pet.dir) * mv);
    }
  } else {
    if (blinkToMaster(pet, flying)) return;
    // no enemies: fetch loot and crack open chests for the master
    const fetch = findFetchTarget(pet.x, pet.y);
    if (fetch) {
      const a = Math.atan2(fetch.y - pet.y, fetch.x - pet.x);
      pet.dir = a;
      const dd2 = dist(pet.x, pet.y, fetch.x, fetch.y);
      const mv = Math.min(spd * dt, dd2);
      if (flying) { pet.x += Math.cos(a) * mv; pet.y += Math.sin(a) * mv; }
      else moveCircle(pet, Math.cos(a) * mv, Math.sin(a) * mv);
      collectDropsAt(pet.x, pet.y);
      tryOpenChests(pet.x, pet.y, 32);
      return;
    }
    const fx = p.x - Math.cos(p.dir) * 36, fy = p.y - Math.sin(p.dir) * 20 + 12;
    const dd = dist(pet.x, pet.y, fx, fy);
    if (dd > 28) {
      const a = Math.atan2(fy - pet.y, fx - pet.x);
      pet.dir = a;
      const mv = Math.min(spd * dt, dd);
      if (flying) { pet.x += Math.cos(a) * mv; pet.y += Math.sin(a) * mv; }
      else moveCircle(pet, Math.cos(a) * mv, Math.sin(a) * mv);
    }
  }
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
  G.minions = [];
  const actPet = G.p.pets && G.p.pets[G.p.activePet];
  G.pet = actPet ? spawnPet(actPet) : null;
  const p = G.p;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null;
  p.strafeN = 0;
  for (const gp of G.lvl.goldPiles || []) {
    G.drops.push({ kind: 'gold', amt: Math.round(ri(12, 35) * (1 + dlvl * 0.3) * (1 + (G.ng || 0) * 0.6)), x: gp.x, y: gp.y });
  }
  if (dlvl === 0) {
    G.world = 0;
    $('floorLabel').textContent = 'Sanctuary · Town';
    banner('Sanctuary — safe haven');
    sfx.stairs();
  } else {
    G.world = worldOf(dlvl);
    const tierName = WORLDS[G.world].name;
    $('floorLabel').textContent = tierName + ' · ' + dlvl + (G.ng ? ' · NG+' + G.ng : '');
    banner(dlvl % 5 === 0 ? tierName + ' — ' + dlvl + '  ⚠ a great evil stirs…' : tierName + ' — Floor ' + dlvl);
    if (dlvl % 5 === 0) sfx.boss(); else sfx.stairs();
  }
  saveDirty = true; saveGame();
}

/* ---------------- save / load (3 hero slots) ---------------- */
const SLOT_KEY = i => 'sanctuary_slot_' + i;
function loadSlot(i) { try { return JSON.parse(localStorage.getItem(SLOT_KEY(i))); } catch (e) { return null; } }
function firstFreeSlot() { for (let i = 0; i < 3; i++) if (!loadSlot(i)) return i; return -1; }
(function migrateLegacySave() {
  try {
    const old = localStorage.getItem(SAVE_KEY);
    if (old && !localStorage.getItem(SLOT_KEY(0))) localStorage.setItem(SLOT_KEY(0), old);
    if (old) localStorage.removeItem(SAVE_KEY);
  } catch (e) { }
})();
function saveGame() {
  if (!G) return;
  try {
    const p = G.p;
    localStorage.setItem(SLOT_KEY(G.slot || 0), JSON.stringify({
      v: 1, cls: p.cls, level: p.level, xp: p.xp, statPts: p.statPts, gold: p.gold,
      stats: p.stats, equip: p.equip, inv: p.inv, potions: p.potions,
      hp: p.hp, mp: p.mp, dlvl: G.dlvl, deaths: p.deaths, soundOn,
      waypoints: G.waypoints, deepest: G.deepest,
      autoPot: G.autoPot, autoSkill: G.autoSkill, ng: G.ng || 0,
      autoEquip: G.autoEquip, autoSell: G.autoSell, portalFloor: G.portalFloor || 0,
      bagSlots: p.bagSlots || 24,
      pets: p.pets || [], activePet: p.activePet !== undefined ? p.activePet : -1,
    }));
    saveDirty = false;
  } catch (e) { }
}
function startGame(clsId, save, slot) {
  const p = newPlayer(clsId);
  if (save) {
    Object.assign(p, {
      level: save.level, xp: save.xp, statPts: save.statPts, gold: save.gold,
      stats: save.stats, equip: save.equip, inv: save.inv || [], potions: save.potions,
      deaths: save.deaths || 0, bagSlots: save.bagSlots || 24,
      pets: save.pets || (STARTER_PET[clsId] >= 0 ? [makePetData(STARTER_PET[clsId], 'common')] : []),
      activePet: save.pets ? (save.activePet !== undefined ? save.activePet : -1)
        : (STARTER_PET[clsId] >= 0 ? 0 : -1),
    });
    soundOn = save.soundOn !== false;
  }
  G = {
    p, dlvl: save ? save.dlvl : 0, lvl: null, projs: [], parts: [], texts: [], drops: [], rings: [],
    beams: [], meteors: [], clouds: [], time: 0, mmT: 0, world: 0, shakeT: 0, onWp: false,
    waypoints: (save && save.waypoints) || [], deepest: (save && save.deepest) || 1,
    autoPot: save && save.autoPot !== undefined ? save.autoPot : 0.35,
    autoSkill: !!(save && save.autoSkill), autoPotT: 0, autoSkillT: 0,
    slot: slot !== undefined ? slot : 0, ng: (save && save.ng) || 0,
    buffDmg: 0, buffArmor: 0, buffSpd: 0,
    minions: [], pet: null,
    autoEquip: save && save.autoEquip !== undefined ? save.autoEquip : true,
    autoSell: save && save.autoSell !== undefined ? save.autoSell : 1,
    portalFloor: (save && save.portalFloor) || 0,
  };
  recalc();
  p.hp = save ? clamp(save.hp, 1, G.d.maxHp) : G.d.maxHp;
  p.mp = save ? clamp(save.mp, 0, G.d.maxMp) : G.d.maxMp;
  enterLevel(G.dlvl, true);
  $('menuScreen').classList.add('hidden');
  $('deathScreen').classList.add('hidden');
  $('victoryScreen').classList.add('hidden');
  $('topbar').classList.remove('hidden');
  $('hud').classList.remove('hidden');
  $('btnAuto').classList.toggle('on', G.autoSkill);
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
  p.chillT = Math.max(0, (p.chillT || 0) - dt);
  G.buffDmg = Math.max(0, (G.buffDmg || 0) - dt);
  G.buffArmor = Math.max(0, (G.buffArmor || 0) - dt);
  G.buffSpd = Math.max(0, (G.buffSpd || 0) - dt);

  // shrines & treasure chests
  for (const s of G.lvl.shrines || []) {
    if (!s.used && dist(p.x, p.y, s.x, s.y) < 36) { s.used = true; activateShrine(s); }
  }
  tryOpenChests(p.x, p.y, 40);

  // auto-potion: drink when life falls under the chosen threshold
  G.autoPotT = Math.max(0, (G.autoPotT || 0) - dt);
  if (G.autoPot > 0 && p.hp / d.maxHp < G.autoPot && p.potions.hp > 0 && G.autoPotT <= 0) {
    G.autoPotT = 1.2;
    drinkPotion('hp');
    ftext(p.x, p.y - 42, 'auto potion', '#ff8a7a', 11);
  }

  // auto-skills: cast whatever is ready when enemies are in range
  if (G.autoSkill) {
    G.autoSkillT = Math.max(0, (G.autoSkillT || 0) - dt);
    if (G.autoSkillT <= 0) {
      const ranges = { cleave: 110, warcry: 130, whirlwind: 115, rage: 220, fireball: 320, frostnova: 140, chain: 300, meteor: 300, multishot: 320, skewer: 320, poisoncloud: 240, strafe: 350, bonespear: 320, raiseskel: 300, curse: 240, golem: 300 };
      const cc = CLASSES[p.cls];
      for (let i = 0; i < 4; i++) {
        const sk = cc.skills[i];
        if (p.level < (sk.lvl || 1) || p.cd[i] > 0 || p.mp < sk.mana) continue;
        if (sk.id === 'rage' && p.rageT > 0) continue;
        if (sk.id === 'raiseskel' && G.minions.filter(mi => mi.kind === 'skel').length >= Math.min(5, 2 + Math.floor(p.level / 8))) continue;
        if (sk.id === 'golem' && G.minions.some(mi => mi.kind === 'golem')) continue;
        const R = ranges[sk.id] || 300;
        const tgt = (p.target && p.target.hp > 0 && dist(p.x, p.y, p.target.x, p.target.y) < R + p.target.r)
          ? p.target : nearestMonster(p.x, p.y, R);
        if (!tgt) continue;
        castSkill(i);
        G.autoSkillT = 0.35;
        break;
      }
    }
  }

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
  const spd = 175 * (p.rageT > 0 ? 1.25 : 1) * (G.buffSpd > 0 ? 1.25 : 1) * (p.chillT > 0 ? 0.65 : 1);
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

  /* --- pickups (the hero, pets and minions all use the same logic) --- */
  collectDropsAt(p.x, p.y);

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
    m.curseT = Math.max(0, (m.curseT || 0) - dt);
    const dd = dist(m.x, m.y, p.x, p.y);   // distance to the hero (auras, novas, summons)
    // pick a target: the hero or the nearest minion
    let T = p, tdd = dd;
    for (const mi of G.minions) {
      const d2 = dist(m.x, m.y, mi.x, mi.y);
      if (d2 < tdd) { tdd = d2; T = mi; }
    }
    if (!m.aggro) {
      if (tdd < 265 && los(m.x, m.y, T.x, T.y)) { m.aggro = true; if (m.boss) { banner('⚔ ' + m.name + ' ⚔'); sfx.boss(); } }
      else continue;
    }
    if (p.hp <= 0) continue;
    const mspd = m.spd * (m.slowT > 0 ? 0.42 : 1);
    m.dir = Math.atan2(T.y - m.y, T.x - m.x);
    if (m.ranged) {
      if (tdd < m.range && los(m.x, m.y, T.x, T.y)) {
        if (m.atkT <= 0) {
          m.atkT = m.atkCd;
          shoot(m.x, m.y, m.dir + rand(-0.06, 0.06), 300, ri(m.dmg[0], m.dmg[1]), 'm', { kind: 'bone', r: 4 });
        }
        if (tdd < 120) { moveCircle(m, -Math.cos(m.dir) * mspd * 0.6 * dt, -Math.sin(m.dir) * mspd * 0.6 * dt); }
      } else chaseStep(m, mspd, dt, T);
    } else {
      if (tdd < m.range + T.r) {
        if (m.atkT <= 0) {
          m.atkT = m.atkCd;
          const raw = ri(m.dmg[0], m.dmg[1]);
          if (T === p) hurtPlayer(raw, m.dlvl);
          else hurtMinion(T, raw);
          if (m.affix === 'vampiric') {
            m.hp = Math.min(m.maxHp, m.hp + raw);
            ftext(m.x, m.y - m.r - 12, '+' + raw, '#c8281e', 11);
          }
        }
      } else chaseStep(m, mspd, dt, T);
    }
    // champion affix auras
    if (m.affix === 'frost' && dd < 110) {
      p.chillT = 0.4;
      if (Math.random() < dt * 4) burst(p.x, p.y - 10, '#bfe8ff', 1, 40);
    }
    if (m.affix === 'storm') {
      m.stormT -= dt;
      if (m.stormT <= 0 && dd < 300 && los(m.x, m.y, p.x, p.y)) {
        m.stormT = 3;
        shoot(m.x, m.y - m.r, m.dir, 340, Math.round(m.dmg[0] * 0.9), 'm', { kind: 'bone', r: 4 });
        spark(m.x, m.y - m.r, '#ffd23a', 4, 140);
      }
    }
    // final boss summons imps
    if (m.final) {
      m.summonT -= dt;
      if (m.summonT <= 0 && dd < 500 && ms.filter(x => x.hp > 0).length < 26) {
        m.summonT = 8;
        const ngm2 = 1 + (G.ng || 0) * 0.8;
        for (let k = 0; k < 2; k++) {
          const imp = makeMonster(MTYPES[0], m.x + rand(-60, 60), m.y + rand(-60, 60), 8 * ngm2, 4 * ngm2, 3 * ngm2, false, false, G.dlvl);
          imp.aggro = true;
          ms.push(imp);
          burst(imp.x, imp.y, '#7a0c20', 10, 140);
        }
        sfx.boss();
      }
    }
    // boss nova
    if (m.boss) {
      m.novaT -= dt;
      if (m.novaT <= 0 && dd < 420) {
        m.novaT = m.final ? 4.5 : 6;
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
      } else {
        for (const mi of G.minions) {
          if (dist(pr.x, pr.y, mi.x, mi.y) < mi.r + pr.r) { hurtMinion(mi, pr.dmg); dead = true; break; }
        }
      }
    }
    if (dead) {
      if (pr.kind === 'fireball') burst(pr.x, pr.y, '#ff8a3a', 6, 120);
      G.projs.splice(i, 1);
    }
  }

  updateMinions(dt);
  updatePet(dt);
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

function chaseStep(m, mspd, dt, T) {
  const p = T || G.p;
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
  const wrld = WORLDS[G.world || 0], pal = wrld.pal;
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
        const molten = wrld.deco === 'lava';
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
      if (h > 0.9) { // per-world floor decoration
        const cx3 = px + TILE * 0.5, cy3 = py + TILE * 0.55;
        if (wrld.deco === 'flowers') {
          ctx.strokeStyle = '#4a6a34'; ctx.lineWidth = 1.2;
          for (let k = 0; k < 3; k++) {
            ctx.beginPath(); ctx.moveTo(cx3 - 4 + k * 4, cy3 + 4); ctx.lineTo(cx3 - 6 + k * 4 + h * 4, cy3 - 4); ctx.stroke();
          }
          if (h > 0.95) {
            ctx.fillStyle = ['#d8b84a', '#c86a8a', '#e8e4da'][Math.floor(h * 40) % 3];
            ctx.fillRect(cx3 - 1, cy3 - 6, 2.6, 2.6);
          }
        } else if (wrld.deco === 'snow') {
          ctx.fillStyle = '#c8d2dc';
          ctx.beginPath(); ctx.ellipse(cx3, cy3, 9 + h * 8, 5, h * 3, 0, 7); ctx.fill();
          ctx.fillStyle = '#e8f0f8';
          ctx.fillRect(cx3 - 1 + h * 6, cy3 - 1, 2, 2);
        } else if (wrld.deco === 'lava') {
          ctx.fillStyle = '#1a1210';
          ctx.beginPath(); ctx.ellipse(cx3, cy3, 6, 4, h, 0, 7); ctx.fill();
          ctx.fillStyle = '#ff6a2a';
          ctx.fillRect(cx3 - 1, cy3 - 1, 2.2, 2.2);
        } else if (wrld.deco === 'graves') {
          if (h > 0.955) {   // leaning tombstone
            ctx.fillStyle = '#6a6472';
            ctx.fillRect(cx3 - 5, cy3 - 10, 10, 12);
            ctx.beginPath(); ctx.arc(cx3, cy3 - 10, 5, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#514b59';
            ctx.fillRect(cx3 - 3, cy3 - 8, 6, 1.6);
            ctx.fillRect(cx3 - 3, cy3 - 5, 4.5, 1.4);
          } else {   // scattered bones
            ctx.fillStyle = '#b8ab8f';
            ctx.fillRect(cx3 - 6, cy3 - 2, 9, 2.4);
            ctx.fillRect(cx3 - 1, cy3 + 1, 6, 2);
          }
        } else {   // shells & bubbles
          ctx.strokeStyle = '#7ac8bc'; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(cx3, cy3, 4.2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx3, cy3, 2, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
          if (h > 0.96) {
            ctx.fillStyle = '#bfe8ff44';
            ctx.beginPath(); ctx.arc(cx3 + 8, cy3 - 9, 2.2, 0, 7); ctx.fill();
          }
        }
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
    ctx.fillStyle = wrld.flame;
    ctx.beginPath(); ctx.ellipse(t.x, t.y - 13 + fl * 0.4, 3.5, 6 + fl, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffffcc';
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
      if (dr.item.sockets) {   // socket pips under the label
        for (let k = 0; k < dr.item.sockets; k++) {
          const g2 = dr.item.gems && dr.item.gems[k];
          const sx2 = dr.x - (dr.item.sockets - 1) * 4.5 + k * 9;
          ctx.save();
          ctx.translate(sx2, dr.y - 8);
          ctx.rotate(Math.PI / 4);
          if (g2) { ctx.fillStyle = GEMS[g2.g].color; ctx.fillRect(-2.3, -2.3, 4.6, 4.6); }
          else { ctx.strokeStyle = '#c9b98a'; ctx.lineWidth = 1; ctx.strokeRect(-2.1, -2.1, 4.2, 4.2); }
          ctx.restore();
        }
      }
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

  /* shrines & chests */
  for (const s of G.lvl.shrines || []) drawShrine(s);
  for (const ch of G.lvl.chests || []) drawChest(ch);

  /* town vendor, stash trunk & stable */
  if (G.lvl.vendor) drawVendor(G.lvl.vendor);
  if (G.lvl.stash) drawTrunk(G.lvl.stash);
  if (G.lvl.stable) drawStable(G.lvl.stable);

  /* entities sorted by y */
  const ents = [];
  for (const m of G.lvl.monsters) if (m.hp > 0 && m.x > cam.x - VW / ZOOM && m.x < cam.x + VW / ZOOM && m.y > cam.y - VH / ZOOM && m.y < cam.y + VH / ZOOM) ents.push(m);
  for (const mi of G.minions) ents.push(mi);
  if (G.pet) ents.push(G.pet);
  ents.push(p);
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e === p) drawPlayer(p);
    else if (e.isMinion) drawMinion(e);
    else if (e.isPet) drawPet(e);
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
      ctx.strokeStyle = pr.color || '#9adcff'; ctx.lineWidth = 3;
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
  for (const s of G.lvl.shrines || []) if (!s.used) hole(s.x, s.y - 14, 85, 0.8);
  if (G.lvl.vendor) hole(G.lvl.vendor.x, G.lvl.vendor.y, 120, 0.9);
  if (G.lvl.stash) hole(G.lvl.stash.x, G.lvl.stash.y, 100, 0.85);
  if (G.lvl.stable) hole(G.lvl.stable.x, G.lvl.stable.y, 130, 0.85);
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

  } else if (p.cls === 'necromancer') {
    /* full-length grave robe */
    const g = ctx.createLinearGradient(0, -10, 0, 11);
    g.addColorStop(0, flash ? '#c86a5a' : '#34343e');
    g.addColorStop(1, flash ? '#8a4a3a' : '#16161e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8 - stride * 1.4, 11);
    ctx.quadraticCurveTo(-7.5, -7, 0, -10);
    ctx.quadraticCurveTo(7.5, -7, 8 + stride * 1.4, 11);
    ctx.quadraticCurveTo(0, 8.6, -8 - stride * 1.4, 11);
    ctx.closePath(); ctx.fill();
    const trimC = rarC('armor') || '#9adc8a';
    ctx.strokeStyle = trimC; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-7.4 - stride * 1.4, 10);
    ctx.quadraticCurveTo(0, 7.8, 7.4 + stride * 1.4, 10);
    ctx.stroke();
    /* bone belt of skulls */
    ctx.fillStyle = '#cfc9b8';
    for (const bx of [-3.4, 0, 3.4]) { ctx.beginPath(); ctx.arc(bx, 2.6, 1.6, 0, 7); ctx.fill(); }
    drawAmulet();
    /* skull pauldron */
    ctx.fillStyle = flash ? '#e8a89a' : '#e0dbcc';
    ctx.beginPath(); ctx.arc(-6, -8, 3.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#16161e';
    ctx.fillRect(-7.2, -8.6, 1.3, 1.3); ctx.fillRect(-5.3, -8.6, 1.3, 1.3);
    /* hooded pale face, glowing green eyes */
    const hoodC = flash ? '#c86a5a' : '#24242e';
    ctx.fillStyle = hoodC;
    ctx.beginPath(); ctx.arc(-0.8, -14.6, 5.9, 0, 7); ctx.fill();
    ctx.fillStyle = flash ? '#ffb0a0' : '#d8d4c8';
    ctx.beginPath(); ctx.arc(1.4, -13.8, 3.8, 0, 7); ctx.fill();
    ctx.fillStyle = '#9adc8a';
    ctx.fillRect(-0.4, -14.4, 1.7, 1.7);
    ctx.fillRect(2.4, -14.4, 1.7, 1.7);
    ctx.strokeStyle = hoodC; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(1, -14, 4.7, Math.PI * 0.75, Math.PI * 1.9); ctx.stroke();
    if (eq.helm) {
      ctx.strokeStyle = rarC('helm') || '#c9a45a'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(-0.8, -14.6, 5.2, Math.PI * 1.1, Math.PI * 1.98); ctx.stroke();
    }
    /* scythe */
    ctx.save();
    ctx.translate(6.5, -3);
    ctx.rotate(swing * 0.6);
    ctx.strokeStyle = skin; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(3, 1); ctx.stroke();
    ctx.strokeStyle = '#3c3428'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(2, 10); ctx.lineTo(5, -14); ctx.stroke();
    const bladeC = rarC('weapon') || '#cfc9b8';
    ctx.fillStyle = bladeC;
    ctx.beginPath();
    ctx.moveTo(4.4, -14.5);
    ctx.quadraticCurveTo(12, -13.5, 15, -8);
    ctx.quadraticCurveTo(11, -11.5, 4.8, -11.8);
    ctx.closePath(); ctx.fill();
    if (Math.random() < 0.12) G.parts.push({ x: p.x + 6 * face, y: p.y - 16, vx: rand(-6, 6), vy: rand(-16, -6), r: rand(1, 2), color: '#9adc8a', life: 0.4, glow: true });
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
    ctx.strokeStyle = m.boss ? '#ff5a3aa8' : hexA(CHAMP_AFFIXES[m.affix].color, 0.66);
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
  if (m.curseT > 0) {
    ctx.fillStyle = '#b86adf2e';
    ctx.beginPath(); ctx.arc(m.x, m.y - m.r * 0.4, m.r + 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#b86adf';
    ctx.font = '9px serif'; ctx.textAlign = 'center';
    ctx.fillText('☠', m.x, m.y - m.r * 2.1 + Math.sin(G.time * 3) * 1.5);
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

function drawMinion(mi) {
  const t = G.time;
  const moving = true;
  const stride = Math.sin(t * 9 + mi.x * 0.1);
  const bob = Math.abs(Math.cos(t * 9 + mi.x * 0.1)) * mi.r * 0.07;
  const face = Math.cos(mi.dir) >= 0 ? 1 : -1;
  const W = c => mi.hurtT > 0 ? '#ffffff' : c;
  ctx.fillStyle = '#00000060';
  ctx.beginPath(); ctx.ellipse(mi.x, mi.y + mi.r * 0.8, mi.r * 0.9, mi.r * 0.35, 0, 0, 7); ctx.fill();
  // loyalty ring so friendlies read at a glance
  ctx.strokeStyle = '#9adc8a55'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(mi.x, mi.y + mi.r * 0.8, mi.r * 1.05, mi.r * 0.4, 0, 0, 7); ctx.stroke();
  ctx.save();
  ctx.translate(mi.x, mi.y - bob);
  ctx.scale(face, 1);
  if (mi.kind === 'golem') {
    ctx.scale(mi.r / 17, mi.r / 17);
    ctx.strokeStyle = W('#a8a294'); ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 4, 5); ctx.lineTo(sd * 4 + stride * 3.5 * sd, 13); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -11, 0, 8);
    g.addColorStop(0, W('#c4beae')); g.addColorStop(1, W('#7a7466'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-9, 7);
    ctx.quadraticCurveTo(-12, -9, 0, -11);
    ctx.quadraticCurveTo(12, -9, 9, 7);
    ctx.quadraticCurveTo(0, 9.5, -9, 7);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = W('#5a5448'); ctx.lineWidth = 1;   // bone plate cracks
    ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, -7); ctx.lineTo(5, 2); ctx.stroke();
    ctx.strokeStyle = W('#a8a294'); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(8, -7); ctx.lineTo(12, 1 + stride * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(-12, 1 - stride * 2); ctx.stroke();
    ctx.fillStyle = W('#c4beae');
    ctx.beginPath(); ctx.arc(0, -13.5, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#9adc8a';
    ctx.fillRect(-2.6, -14.6, 2, 2); ctx.fillRect(0.8, -14.6, 2, 2);
  } else {
    ctx.scale(mi.r / 13, mi.r / 13);
    ctx.strokeStyle = W('#cfc9b8'); ctx.lineWidth = 2.4;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 2.6, 1); ctx.lineTo(sd * 2.6 + stride * 3.6 * sd, 9.5); ctx.stroke();
    }
    ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -10); ctx.stroke();
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, -8.6 + i * 2.5, 4.1 - i * 0.5, 0.15, Math.PI - 0.15); ctx.stroke();
    }
    ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.moveTo(-4.5, -10); ctx.lineTo(4.5, -10); ctx.stroke();
    // sword arm swing
    ctx.save();
    ctx.translate(4.5, -10); ctx.rotate(0.5 + (mi.swingT > 0 ? Math.sin((0.2 - mi.swingT) / 0.2 * Math.PI) * 1.2 : 0));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3, 4); ctx.stroke();
    ctx.fillStyle = W('#8a8378');
    ctx.beginPath(); ctx.moveTo(2.4, 3.4); ctx.lineTo(9.5, 6.5); ctx.lineTo(2.9, 5.2); ctx.closePath(); ctx.fill();
    ctx.restore();
    // skull with necromantic green eyes
    ctx.fillStyle = W('#e0dbcc');
    ctx.beginPath(); ctx.arc(0, -14.5, 4.2, 0, 7); ctx.fill();
    ctx.fillRect(-2.3, -11.6, 4.6, 2);
    ctx.fillStyle = '#9adc8a';
    ctx.fillRect(-2.5, -15.4, 1.9, 1.9); ctx.fillRect(0.7, -15.4, 1.9, 1.9);
  }
  ctx.restore();
  // health bar when wounded
  if (mi.hp < mi.maxHp) {
    const w = mi.r * 2;
    ctx.fillStyle = '#000000aa'; ctx.fillRect(mi.x - w / 2 - 1, mi.y - mi.r * 2 - 1, w + 2, 4);
    ctx.fillStyle = '#9adc8a';
    ctx.fillRect(mi.x - w / 2, mi.y - mi.r * 2, w * clamp(mi.hp / mi.maxHp, 0, 1), 2.5);
  }
}

function drawPet(pet) {
  const t = G.time;
  const bob = Math.sin(t * 3 + 1) * 1.2;
  const face = Math.cos(pet.dir) >= 0 ? 1 : -1;
  // rare+ companions glow with their grade's color
  const rIdx = pet.data ? PET_RARITIES.indexOf(pet.data.rarity) : 0;
  if (rIdx >= 2) {
    ctx.strokeStyle = hexA(rarityColor(pet.data.rarity), 0.35 + Math.sin(t * 3) * 0.12);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 8, 15, 5.5, 0, 0, 7); ctx.stroke();
  }
  if (pet.kind === 'hound' || pet.kind === 'wolf' || pet.kind === 'tiger') {
    const wolf = pet.kind === 'wolf', tiger = pet.kind === 'tiger';
    const cBody = tiger ? '#d8863a' : wolf ? '#78828e' : '#6a5238';
    const cDark = tiger ? '#2c1c10' : wolf ? '#4e5762' : '#3a2c1c';
    const cLeg = tiger ? '#b8702e' : wolf ? '#565f6a' : '#4a3826';
    const s = tiger ? 1.32 : wolf ? 1.18 : 1;
    ctx.fillStyle = '#00000060';
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 8, 11 * s, 4 * s, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(pet.x, pet.y);
    ctx.scale(face * s, s);
    ctx.strokeStyle = cLeg; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    for (const [lx, ph] of [[-6, 0], [-3, 2], [3, 1], [6, 3]]) {
      ctx.beginPath(); ctx.moveTo(lx, 2); ctx.lineTo(lx + Math.sin(t * 10 + ph) * 2.5, 8); ctx.stroke();
    }
    ctx.fillStyle = cBody;   // body
    ctx.beginPath(); ctx.ellipse(0, 0 + bob * 0.3, 9.5, 5.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = cBody; ctx.lineWidth = wolf ? 3 : 2.2;   // tail
    ctx.beginPath(); ctx.moveTo(-9, -2);
    ctx.quadraticCurveTo(-13, -6 + Math.sin(t * 8) * 2, -15, -4 + Math.sin(t * 8) * 3); ctx.stroke();
    ctx.fillStyle = cBody;   // head + snout
    ctx.beginPath(); ctx.arc(9, -4 + bob * 0.3, 4.6, 0, 7); ctx.fill();
    ctx.fillRect(11, -4 + bob * 0.3, 5, 3.2);
    ctx.fillStyle = cDark;   // nose + ear
    ctx.fillRect(15, -3.6 + bob * 0.3, 1.8, 2);
    ctx.beginPath(); ctx.moveTo(7, -8); ctx.lineTo(9, -11.5); ctx.lineTo(10.5, -7.6); ctx.closePath(); ctx.fill();
    if (wolf) { ctx.beginPath(); ctx.moveTo(4.5, -8.4); ctx.lineTo(6, -11.8); ctx.lineTo(7.8, -7.9); ctx.closePath(); ctx.fill(); }
    if (tiger) {   // stripes + pale muzzle
      ctx.strokeStyle = cDark; ctx.lineWidth = 1.6;
      for (const sx2 of [-5, -1.5, 2]) {
        ctx.beginPath(); ctx.moveTo(sx2, -4.5 + bob * 0.3); ctx.lineTo(sx2 + 1, 3 + bob * 0.3); ctx.stroke();
      }
      ctx.fillStyle = '#e8d9c0';
      ctx.fillRect(11, -2.2 + bob * 0.3, 4.5, 1.6);
    }
    ctx.fillStyle = tiger ? '#ffe14d' : wolf ? '#9adcff' : '#ffd76a';
    ctx.fillRect(9.6, -5.6 + bob * 0.3, 1.6, 1.6);
    ctx.restore();
  } else if (pet.kind === 'drake' || pet.kind === 'dragon') {
    const drg = pet.kind === 'dragon';
    const s = drg ? 1.45 : 1;
    const fy = pet.y - (drg ? 34 : 24) + bob * 2;
    ctx.fillStyle = '#00000044';
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 6, 10 * s, 3.5 * s, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(pet.x, fy);
    ctx.scale(face * s, s);
    const flap = Math.sin(t * (drg ? 8 : 11));
    const cBody = drg ? '#a32430' : '#c86a30', cWing = drg ? '#701420' : '#8a4520', cBelly = drg ? '#e8c05a' : '#e8a05a';
    for (const sd of [-1, 1]) {   // membrane wings
      ctx.fillStyle = cWing;
      ctx.beginPath();
      ctx.moveTo(sd * 2, -1);
      ctx.quadraticCurveTo(sd * 9, -8 - flap * 6, sd * 17, -4 - flap * 9);
      ctx.lineTo(sd * 12, -1 - flap * 4);
      ctx.lineTo(sd * 15, 1 - flap * 5);
      ctx.lineTo(sd * 8, 1.5 - flap * 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = cBody; ctx.lineWidth = 3;   // tail with arrow tip
    ctx.beginPath(); ctx.moveTo(-6, 1);
    ctx.quadraticCurveTo(-12, 3 + Math.sin(t * 5) * 2, -16, 1 + Math.sin(t * 5) * 3); ctx.stroke();
    ctx.fillStyle = cBody;
    ctx.beginPath();
    ctx.moveTo(-15, 1 + Math.sin(t * 5) * 3); ctx.lineTo(-19, -1 + Math.sin(t * 5) * 3); ctx.lineTo(-18, 4 + Math.sin(t * 5) * 3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = cBody;   // body
    ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = cBelly;
    ctx.beginPath(); ctx.ellipse(1, 2, 5, 2.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = cBody;   // neck + head + snout
    ctx.beginPath(); ctx.ellipse(7.5, -4, 3.4, 2.8, 0.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(10.5, -6.5, 3.4, 0, 7); ctx.fill();
    ctx.fillRect(12, -7, 5, 2.8);
    ctx.strokeStyle = cBelly; ctx.lineWidth = 1.4;   // horns
    ctx.beginPath(); ctx.moveTo(9.5, -9.5); ctx.lineTo(8, -12.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(11.5, -9.5); ctx.lineTo(11, -13); ctx.stroke();
    ctx.fillStyle = drg ? '#ffe14d' : '#ffd76a';
    ctx.fillRect(10, -7.6, 1.7, 1.7);
    ctx.restore();
    // smoke & sparks from the dragon's snout
    if (drg && Math.random() < 0.18) {
      G.parts.push({ x: pet.x + 16 * face, y: fy - 8, vx: face * rand(8, 20), vy: rand(-14, -4), r: rand(1.5, 2.6), color: Math.random() < 0.6 ? '#ff8a3a' : '#ffd27a', life: rand(0.3, 0.55), glow: true });
    }
  } else if (pet.kind === 'hawk') {
    const fly = pet.y - 26 + bob * 2;
    ctx.fillStyle = '#00000044';
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 6, 7, 2.6, 0, 0, 7); ctx.fill();
    ctx.save();
    ctx.translate(pet.x, fly);
    ctx.scale(face, 1);
    const flap = Math.sin(t * 12);
    ctx.fillStyle = '#7a5a34';
    for (const sd of [-1, 1]) {   // wings
      ctx.beginPath();
      ctx.moveTo(sd * 2, 0);
      ctx.quadraticCurveTo(sd * 10, -4 - flap * 5, sd * 15, -1 - flap * 7);
      ctx.quadraticCurveTo(sd * 9, 2 - flap * 2, sd * 2, 2.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#8a683c';   // body
    ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 3.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -1.4, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23a';   // beak + eye
    ctx.beginPath(); ctx.moveTo(7.2, -1.8); ctx.lineTo(10, -0.8); ctx.lineTo(7.2, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(5, -2.4, 1.3, 1.3);
    ctx.fillStyle = '#6a4a2c';   // tail feathers
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-10, -1 + bob * 0.4); ctx.lineTo(-9.5, 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {   // arcane familiar
    const fy = pet.y - 18 + bob * 2;
    ctx.fillStyle = '#00000044';
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 5, 6, 2.4, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(pet.x, fy, 0, pet.x, fy, 13);
    g.addColorStop(0, 'rgba(184,164,255,0.55)'); g.addColorStop(1, 'rgba(184,164,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pet.x, fy, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#b8a4ff';
    ctx.beginPath(); ctx.arc(pet.x, fy, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#efe8ff';
    ctx.beginPath(); ctx.arc(pet.x - 1.5, fy - 1.5, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a1a4a';
    ctx.fillRect(pet.x - 2.6, fy - 1, 1.6, 1.8); ctx.fillRect(pet.x + 1, fy - 1, 1.6, 1.8);
    if (Math.random() < 0.25) G.parts.push({ x: pet.x + rand(-4, 4), y: fy + rand(-4, 4), vx: rand(-6, 6), vy: rand(4, 14), r: rand(1, 2), color: '#b8a4ff', life: 0.4, glow: true });
  }
}

const SHRINE_COLORS = { combat: '#ff5a3a', armor: '#c9b98a', speed: '#7ac8ff', healing: '#ff8a7a', gem: '#4ad46a', xp: '#b8a4e8' };
function drawShrine(s) {
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 8, 12, 4.5, 0, 0, 7); ctx.fill();
  // stone pedestal
  ctx.fillStyle = '#4a4440';
  ctx.beginPath();
  ctx.moveTo(s.x - 9, s.y + 8); ctx.lineTo(s.x - 5.5, s.y - 8); ctx.lineTo(s.x + 5.5, s.y - 8); ctx.lineTo(s.x + 9, s.y + 8);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5c5650';
  ctx.fillRect(s.x - 8, s.y - 11, 16, 4);
  // orb
  const col = s.used ? '#5a5a5a' : SHRINE_COLORS[s.kind];
  if (!s.used) {
    const g = ctx.createRadialGradient(s.x, s.y - 17, 0, s.x, s.y - 17, 12);
    g.addColorStop(0, hexA(col, 0.5)); g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s.x, s.y - 17, 12, 0, 7); ctx.fill();
  }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(s.x, s.y - 17, 4.5 + (s.used ? 0 : Math.sin(G.time * 3 + s.x) * 0.8), 0, 7); ctx.fill();
  ctx.fillStyle = '#ffffff88';
  ctx.beginPath(); ctx.arc(s.x - 1.4, s.y - 18.4, 1.4, 0, 7); ctx.fill();
}
function drawChest(ch) {
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(ch.x, ch.y + 7, 13, 4.5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = ch.opened ? '#3a2a18' : '#5a3a1e';
  ctx.fillRect(ch.x - 11, ch.y - 5, 22, 12);
  ctx.fillStyle = '#c9a45a';
  ctx.fillRect(ch.x - 11, ch.y - 1, 22, 2);
  ctx.fillRect(ch.x - 1.5, ch.y - 5, 3, 12);
  if (ch.opened) {
    ctx.fillStyle = '#140c04';
    ctx.fillRect(ch.x - 9, ch.y - 4, 18, 5);
    ctx.fillStyle = '#6a4426';
    ctx.fillRect(ch.x - 11, ch.y - 13, 22, 5);
  } else {
    ctx.fillStyle = '#6a4426';
    ctx.beginPath();
    ctx.moveTo(ch.x - 11, ch.y - 5);
    ctx.quadraticCurveTo(ch.x, ch.y - 13, ch.x + 11, ch.y - 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(ch.x - 1.5, ch.y - 4, 3, 4);
  }
}

function drawStable(st) {
  const t = G.time;
  // straw floor patch
  ctx.fillStyle = '#8a7a3c44';
  ctx.beginPath(); ctx.ellipse(st.x, st.y + 4, 42, 20, 0, 0, 7); ctx.fill();
  // fence: posts + rails on three sides
  ctx.strokeStyle = '#6a4a2c'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const posts = [[-44, -18], [-44, 14], [0, -22], [44, -18], [44, 14]];
  for (const [dx, dy] of posts) {
    ctx.beginPath(); ctx.moveTo(st.x + dx, st.y + dy); ctx.lineTo(st.x + dx, st.y + dy - 14); ctx.stroke();
  }
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(st.x - 44, st.y - 26); ctx.lineTo(st.x, st.y - 30); ctx.lineTo(st.x + 44, st.y - 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(st.x - 44, st.y + 6); ctx.lineTo(st.x - 44, st.y - 24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(st.x + 44, st.y + 6); ctx.lineTo(st.x + 44, st.y - 24); ctx.stroke();
  // idle companions wait in the pen
  const p = G.p;
  let k = 0;
  for (let i = 0; i < p.pets.length && k < 3; i++) {
    if (i === p.activePet) continue;
    const pet = p.pets[i];
    drawPet({
      isPet: true, kind: PET_SPECIES[pet.sp].id, data: pet,
      x: st.x - 24 + k * 26, y: st.y - 4 + (k % 2) * 10,
      dir: k % 2 ? Math.PI : 0, atkT: 0, swingT: 0,
    });
    k++;
  }
  ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText('🐾 Stable', st.x, st.y - 42);
}

function drawTrunk(s) {
  const t = G.time;
  ctx.fillStyle = '#00000060';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 10, 18, 6, 0, 0, 7); ctx.fill();
  // body with iron bands
  const g = ctx.createLinearGradient(s.x, s.y - 12, s.x, s.y + 10);
  g.addColorStop(0, '#7a5230'); g.addColorStop(1, '#4a2f1a');
  ctx.fillStyle = g;
  ctx.fillRect(s.x - 16, s.y - 6, 32, 16);
  ctx.fillStyle = '#5c4226';
  ctx.beginPath();
  ctx.moveTo(s.x - 16, s.y - 6);
  ctx.quadraticCurveTo(s.x, s.y - 17, s.x + 16, s.y - 6);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a909c';
  ctx.fillRect(s.x - 12, s.y - 14, 3, 24);
  ctx.fillRect(s.x + 9, s.y - 14, 3, 24);
  ctx.fillStyle = '#c9a45a';   // lock plate + keyhole
  ctx.fillRect(s.x - 3, s.y - 7, 6, 7);
  ctx.fillStyle = '#20140a';
  ctx.fillRect(s.x - 0.8, s.y - 5, 1.6, 3);
  // gentle glint so it reads as interactive
  ctx.fillStyle = 'rgba(255,231,176,' + (0.25 + Math.sin(t * 2.4) * 0.15) + ')';
  ctx.fillRect(s.x - 12, s.y - 13, 6, 2);
  ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText('🧳 Trunk', s.x, s.y - 26);
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
const rarityColor = r => ({ common: '#e8e4da', magic: '#7f95e8', rare: '#e8d45a', unique: '#d98d4a', set: '#4adf6a', exotic: '#e86ae8' }[r]);

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
  return ['charPanel', 'invPanel', 'pausePanel', 'wpPanel', 'shopPanel', 'stashPanel', 'stablePanel'].some(id => !$(id).classList.contains('hidden')) || !$('itemPopup').classList.contains('hidden');
}
function closePanels() {
  ['charPanel', 'invPanel', 'pausePanel', 'wpPanel', 'shopPanel', 'stashPanel', 'stablePanel', 'itemPopup'].forEach(id => $(id).classList.add('hidden'));
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
    if (id === 'stashPanel') renderStash();
    if (id === 'stablePanel') renderStable();
    paused = true;
  }
}

function renderStable() {
  const p = G.p;
  const modTxt = pet => Object.keys(pet.mods).map(k => { const a = AFFIXES.find(a => a.stat === k); return a ? a.txt(pet.mods[k]) : ''; }).filter(Boolean).join(' · ') || 'no blessings';
  const own = p.pets.map((pet, i) => `
    <div class="shoprow">
      <span class="sicon2">${PET_SPECIES[pet.sp].icon}</span>
      <span class="snm"><span class="rc-${pet.rarity}">${PET_SPECIES[pet.sp].name}</span>${i === p.activePet ? ' <span style="color:#7adf6a">● with you</span>' : ''}<br><small>${modTxt(pet)}</small></span>
      ${i === p.activePet ? '' : `<button class="smallbtn" data-summon="${i}">Take</button>`}
      <button class="smallbtn" data-sellpet="${i}" title="Sell">${Math.round(pet.price / 3)}g</button>
    </div>`).join('');
  const stock = (G.lvl.petStock || []).map((pet, i) => pet ? `
    <div class="shoprow">
      <span class="sicon2">${PET_SPECIES[pet.sp].icon}</span>
      <span class="snm"><span class="rc-${pet.rarity}">${PET_SPECIES[pet.sp].name}</span><br><small>${modTxt(pet)}</small></span>
      <button class="smallbtn" data-buypet="${i}" ${p.gold < pet.price || p.pets.length >= 8 ? 'disabled' : ''}>${pet.price}g</button>
    </div>` : '').join('');
  $('stablePanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🐾 Stable · 🪙 ${p.gold}</div>
    <div class="ptitle" style="font-size:14px; border:none; margin:0; padding:0">Your companions · ${p.pets.length}/8</div>
    ${own || '<div class="derived" style="text-align:center">No companions yet.</div>'}
    <div class="ptitle" style="font-size:14px; border:none; margin:8px 0 0; padding:0">For sale (fresh per visit)</div>
    ${stock || '<div class="derived" style="text-align:center">Sold out.</div>'}
    <div class="derived" style="text-align:center">Only one companion travels with you — the rest wait here.<br>Grander beasts carry grander blessings.</div>`;
  $('stablePanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('stablePanel').querySelectorAll('[data-summon]').forEach(b => b.addEventListener('click', () => {
    p.activePet = +b.dataset.summon;
    recalc();
    G.pet = spawnPet(p.pets[p.activePet]);
    banner(PET_SPECIES[p.pets[p.activePet].sp].name + ' joins you!');
    sfx.pickup(); saveDirty = true; renderStable(); updateHUD();
  }));
  $('stablePanel').querySelectorAll('[data-sellpet]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.sellpet;
    if (!confirm('Sell your ' + PET_SPECIES[p.pets[i].sp].name + ' for ' + Math.round(p.pets[i].price / 3) + ' gold?')) return;
    p.gold += Math.round(p.pets[i].price / 3);
    p.pets.splice(i, 1);
    if (p.activePet === i) { p.activePet = -1; G.pet = null; }
    else if (p.activePet > i) p.activePet--;
    recalc(); sfx.gold(); saveDirty = true; renderStable(); updateHUD();
  }));
  $('stablePanel').querySelectorAll('[data-buypet]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.buypet, pet = G.lvl.petStock[i];
    if (!pet || p.gold < pet.price || p.pets.length >= 8) return;
    p.gold -= pet.price;
    p.pets.push(pet);
    G.lvl.petStock[i] = null;
    if (p.activePet < 0) {
      p.activePet = p.pets.length - 1;
      G.pet = spawnPet(pet);
    }
    recalc();
    banner(PET_SPECIES[pet.sp].name + ' purchased!');
    sfx.level(); saveDirty = true; renderStable(); updateHUD();
  }));
}

function renderStash() {
  const p = G.p, stash = loadStash();
  const cell = (it, attr, i) => `<button class="islot ${it ? 'r-' + it.rarity : ''}" data-${attr}="${i}">${it ? it.icon + sockBadge(it) : ''}</button>`;
  let sg = ''; for (let i = 0; i < STASH_MAX; i++) sg += cell(stash[i], 'st', i);
  let bg = ''; for (let i = 0; i < p.bagSlots; i++) bg += cell(p.inv[i], 'bg', i);
  $('stashPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🧳 Trunk · ${stash.length}/${STASH_MAX}</div>
    <div class="invactions">
      <button class="smallbtn" data-all-in ${!p.inv.length || stash.length >= STASH_MAX ? 'disabled' : ''}>⬇ Stash whole bag</button>
      <button class="smallbtn" data-all-out ${!stash.length || p.inv.length >= p.bagSlots ? 'disabled' : ''}>⬆ Take everything</button>
    </div>
    <div class="invgrid">${sg}</div>
    <div class="ptitle" style="margin-top:12px">🎒 Your bag · ${p.inv.length}/${p.bagSlots}</div>
    <div class="invgrid">${bg}</div>
    <div class="derived" style="text-align:center">Tap an item to move it across.<br>The trunk is shared by all of your heroes.</div>`;
  $('stashPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('stashPanel').querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => {
    const s2 = loadStash(), it = s2[+b.dataset.st];
    if (!it || p.inv.length >= p.bagSlots) return;
    s2.splice(+b.dataset.st, 1);
    p.inv.push(it);
    saveStash(s2); saveDirty = true; sfx.pickup(); renderStash();
  }));
  $('stashPanel').querySelectorAll('[data-bg]').forEach(b => b.addEventListener('click', () => {
    const s2 = loadStash(), it = p.inv[+b.dataset.bg];
    if (!it || s2.length >= STASH_MAX) return;
    p.inv.splice(+b.dataset.bg, 1);
    s2.push(it);
    saveStash(s2); saveDirty = true; sfx.pickup(); renderStash();
  }));
  $('stashPanel').querySelector('[data-all-in]').addEventListener('click', () => {
    const s2 = loadStash();
    while (p.inv.length && s2.length < STASH_MAX) s2.push(p.inv.shift());
    saveStash(s2); saveDirty = true; sfx.gold(); renderStash();
  });
  $('stashPanel').querySelector('[data-all-out]').addEventListener('click', () => {
    const s2 = loadStash();
    while (s2.length && p.inv.length < p.bagSlots) p.inv.push(s2.shift());
    saveStash(s2); saveDirty = true; sfx.gold(); renderStash();
  });
}

function renderWp() {
  const dests = [0, ...G.waypoints.filter(w => w > 0).sort((a, b) => a - b)];
  const nameOf = d => d === 0 ? '⛺ Sanctuary Town'
    : WORLDS[worldOf(d)].name + ' · Floor ' + d;
  const ret = G.portalFloor && G.portalFloor !== G.dlvl && !dests.includes(G.portalFloor)
    ? `<button class="smallbtn" data-wp="${G.portalFloor}" style="border-color:#5ab0ff">🌀 Return to Floor ${G.portalFloor}</button>` : '';
  $('wpPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🌀 Waypoint</div>
    <div class="invactions" style="flex-direction:column">
      ${ret}
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
      <span class="snm"><span class="rc-${it.rarity}">${it.name}</span> ${sockBadge(it)}<br><small>${modLines(it).slice(0, 2).join(' · ') || it.slot}</small></span>
      <button class="smallbtn" data-buy-item="${i}" ${p.gold < sellPrice(it) * 3 || p.inv.length >= p.bagSlots ? 'disabled' : ''}>${sellPrice(it) * 3}g</button>
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
    if (!it || p.gold < sellPrice(it) * 3 || p.inv.length >= p.bagSlots) return;
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
      ${p.pets && p.pets[p.activePet]
        ? `Companion: <b class="rc-${p.pets[p.activePet].rarity}">${PET_SPECIES[p.pets[p.activePet].sp].icon} ${PET_SPECIES[p.pets[p.activePet].sp].name}</b><br>`
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

const BAG_COSTS = [500, 1500, 4000, 10000];   // 24 → 30 → 36 → 42 → 48 slots

function sockBadge(it) {
  if (!it || !it.sockets) return '';
  return `<span class="socks">${Array.from({ length: it.sockets }, (_, k) => {
    const g = it.gems && it.gems[k];
    return `<i style="color:${g ? GEMS[g.g].color : '#6a5a3e'}">${g ? '◆' : '◇'}</i>`;
  }).join('')}</span>`;
}

function renderInv() {
  const p = G.p;
  const gambleCost = 120 + G.dlvl * 45;
  const potCost = 25 + G.dlvl * 6;
  const eqSlot = s => {
    const it = p.equip[s];
    return `<button class="islot eq ${it ? 'r-' + it.rarity : ''}" data-eq="${s}">${it ? it.icon : ''}${sockBadge(it)}<span class="slotlabel">${s}</span></button>`;
  };
  let grid = '';
  for (let i = 0; i < p.bagSlots; i++) {
    const it = p.inv[i];
    grid += `<button class="islot ${it ? 'r-' + it.rarity : ''}" data-inv="${i}">${it ? it.icon : ''}${it ? sockBadge(it) : ''}</button>`;
  }
  $('invPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🎒 Inventory · 🪙 ${p.gold}</div>
    <div class="equipgrid">${SLOTS.map(eqSlot).join('')}</div>
    <div class="invactions">
      <button class="smallbtn" data-buy="hp" ${p.gold < potCost ? 'disabled' : ''}>🧪 Potion (${potCost}g)</button>
      <button class="smallbtn" data-buy="mp" ${p.gold < potCost ? 'disabled' : ''}>🔮 Potion (${potCost}g)</button>
      <button class="smallbtn" data-gamble ${p.gold < gambleCost ? 'disabled' : ''}>🎲 Gamble (${gambleCost}g)</button>
      ${p.bagSlots < 48
        ? `<button class="smallbtn" data-bag ${p.gold < BAG_COSTS[(p.bagSlots - 24) / 6] ? 'disabled' : ''}>🎒 +6 slots (${BAG_COSTS[(p.bagSlots - 24) / 6]}g)</button>`
        : ''}
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
  const bagBtn = $('invPanel').querySelector('[data-bag]');
  if (bagBtn) bagBtn.addEventListener('click', () => {
    const cost = BAG_COSTS[(p.bagSlots - 24) / 6];
    if (p.gold < cost || p.bagSlots >= 48) return;
    p.gold -= cost;
    p.bagSlots += 6;
    banner('Bag expanded — ' + p.bagSlots + ' slots!');
    sfx.level(); renderInv(); updateHUD(); saveDirty = true;
  });
  const gb = $('invPanel').querySelector('[data-gamble]');
  gb.addEventListener('click', () => {
    if (p.gold < gambleCost || p.inv.length >= p.bagSlots) return;
    p.gold -= gambleCost;
    const r2 = Math.random();
    const it = makeItem(choice(SLOTS), Math.max(1, G.dlvl),
      r2 < 0.03 ? 'exotic' : r2 < 0.1 ? 'unique' : r2 < 0.2 ? 'set' : r2 < 0.55 ? 'rare' : 'magic');
    p.inv.push(it);
    sfx.pickup(); renderInv(); updateHUD(); saveDirty = true;
    showItemPopup(it, p.inv.length - 1, false);
  });
}

function diffLines(it) {
  // compare derived stats with the candidate swapped into its slot
  const p = G.p;
  if (it.g || !SLOTS.includes(it.slot)) return '';
  const saved = p.equip[it.slot];
  p.equip[it.slot] = it;
  const alt = derived(p);
  p.equip[it.slot] = saved;
  const cur = G.d;
  const rows = [];
  const fmt = (label, a, b) => {
    const d = Math.round((b - a) * 10) / 10;
    if (Math.abs(d) < 0.05) return;
    rows.push(`<span style="color:${d > 0 ? '#7adf6a' : '#ff7a6a'}">${label} ${d > 0 ? '+' : ''}${d}</span>`);
  };
  fmt('Dmg', (cur.dmgLo + cur.dmgHi) / 2, (alt.dmgLo + alt.dmgHi) / 2);
  fmt('Armor', cur.armor, alt.armor);
  fmt('Life', cur.maxHp, alt.maxHp);
  fmt('Mana', cur.maxMp, alt.maxMp);
  fmt('Crit%', cur.crit * 100, alt.crit * 100);
  fmt('Elem', cur.fire + cur.cold + cur.light + cur.poison, alt.fire + alt.cold + alt.light + alt.poison);
  fmt('MF%', cur.mf, alt.mf);
  fmt('Steal%', cur.leech * 100, alt.leech * 100);
  return `<div class="idiff">${rows.length ? 'vs equipped: ' + rows.join(' · ') : '≈ no change vs equipped'}</div>`;
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
  const setHtml = it.set && SETS[it.set] ? (() => {
    const def = SETS[it.set];
    const worn = SLOTS.filter(s => p.equip[s] && p.equip[s].set === it.set).length;
    const lines = [];
    for (let n = 2; n < def.bonuses.length; n++) {
      const b = def.bonuses[n];
      if (!b) continue;
      const txt = Object.keys(b).map(k => { const a = AFFIXES.find(a => a.stat === k); return a ? a.txt(b[k]) : ''; }).filter(Boolean).join(', ');
      lines.push(`<span style="color:${worn >= n ? '#4adf6a' : '#5a6a5a'}">(${n} pieces) ${txt}</span>`);
    }
    return `<div class="setinfo"><b style="color:#4adf6a">◈ ${def.name}</b> · ${worn}/${Object.keys(def.pieces).length} worn<br>${lines.join('<br>')}</div>`;
  })() : '';
  pop.innerHTML = `
    <div class="iname rc-${it.rarity}" ${it.g ? `style="color:${GEMS[it.g].color}"` : ''}>${it.icon} ${it.name}</div>
    <div class="ibase">${it.base !== it.name && !it.g ? it.base + ' · ' : ''}${it.slot} · item level ${it.lvl}</div>
    ${rwHtml}
    ${setHtml}
    <div class="imods">${modLines(it).join('<br>') || '<i>no properties</i>'}${gemLines}</div>
    ${sockHtml}
    ${!equipped && !it.g ? diffLines(it) : ''}
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
      if (p.inv.length >= p.bagSlots) { ftext(p.x, p.y - 30, 'Inventory full!', '#ff8a7a', 13); }
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
      <button class="smallbtn" data-autopot>🧪 Auto-Potion: ${G.autoPot > 0 ? 'below ' + Math.round(G.autoPot * 100) + '% life' : 'OFF'}</button>
      <button class="smallbtn" data-autoskill>🤖 Auto-Skills: ${G.autoSkill ? 'ON' : 'OFF'}</button>
      <button class="smallbtn" data-autoequip>⬆ Auto-Equip upgrades: ${G.autoEquip ? 'ON' : 'OFF'}</button>
      <button class="smallbtn" data-autosell>💰 Auto-Sell: ${['OFF', 'common items', 'common + magic'][G.autoSell]}</button>
      <button class="smallbtn" data-quit>💾 Save & Main Menu</button>
      <button class="smallbtn" data-newchar style="color:#ff8a7a">☠ Abandon Hero (new character)</button>
    </div>
    <div class="derived" style="text-align:center">
      Tap to move & attack · hold to run<br>Keyboard: WASD move · 1-4 skills · Q/E potions · I/C panels
    </div>`;
  $('pausePanel').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  $('pausePanel').querySelector('[data-snd]').addEventListener('click', () => { soundOn = !soundOn; saveDirty = true; renderPause(); });
  $('pausePanel').querySelector('[data-autopot]').addEventListener('click', () => {
    const steps = [0, 0.25, 0.35, 0.5];
    G.autoPot = steps[(steps.indexOf(G.autoPot) + 1) % steps.length];
    saveDirty = true; renderPause();
  });
  $('pausePanel').querySelector('[data-autoskill]').addEventListener('click', () => {
    G.autoSkill = !G.autoSkill;
    $('btnAuto').classList.toggle('on', G.autoSkill);
    saveDirty = true; renderPause();
  });
  $('pausePanel').querySelector('[data-autoequip]').addEventListener('click', () => {
    G.autoEquip = !G.autoEquip;
    saveDirty = true; renderPause();
  });
  $('pausePanel').querySelector('[data-autosell]').addEventListener('click', () => {
    G.autoSell = (G.autoSell + 1) % 3;
    saveDirty = true; renderPause();
  });
  $('pausePanel').querySelector('[data-quit]').addEventListener('click', () => { saveGame(); toMenu(); });
  $('pausePanel').querySelector('[data-newchar]').addEventListener('click', () => {
    if (confirm('Abandon this hero forever? Your save will be deleted.')) {
      localStorage.removeItem(SLOT_KEY(G.slot || 0));
      G = null;
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
  $('victoryScreen').classList.add('hidden');
  $('menuScreen').classList.remove('hidden');
  refreshMenu();
}

function refreshMenu() {
  const wrap = $('roster');
  wrap.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const s = loadSlot(i);
    if (!s) continue;
    const row = document.createElement('div');
    row.className = 'slotrow';
    row.innerHTML = `
      <button class="slotbtn">▶ ${CLASSES[s.cls].icon} ${CLASSES[s.cls].name} Lv.${s.level}
        <small>· ${s.dlvl === 0 ? 'town' : 'floor ' + s.dlvl}${s.ng ? ' · NG+' + s.ng : ''} · 🪙${s.gold}</small></button>
      <button class="slotdel" title="Delete hero">✕</button>`;
    row.querySelector('.slotbtn').addEventListener('click', () => { audioInit(); startGame(s.cls, s, i); });
    row.querySelector('.slotdel').addEventListener('click', () => {
      if (confirm('Release this ' + CLASSES[s.cls].name + ' forever? The save will be deleted.')) {
        localStorage.removeItem(SLOT_KEY(i));
        refreshMenu();
      }
    });
    wrap.appendChild(row);
  }
  const free = firstFreeSlot();
  document.querySelectorAll('.classcard').forEach(c => c.classList.toggle('disabled', free < 0));
  $('slotsFull').classList.toggle('hidden', free >= 0);
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
  // stash trunk?
  if (G.lvl.stash && dist(w.x, w.y, G.lvl.stash.x, G.lvl.stash.y) < 44) {
    if (dist(p.x, p.y, G.lvl.stash.x, G.lvl.stash.y) < 95) togglePanel('stashPanel');
    else setMoveTarget(G.lvl.stash.x, G.lvl.stash.y + 34);
    return;
  }
  // stable?
  if (G.lvl.stable && dist(w.x, w.y, G.lvl.stable.x, G.lvl.stable.y) < 55) {
    if (dist(p.x, p.y, G.lvl.stable.x, G.lvl.stable.y) < 110) togglePanel('stablePanel');
    else setMoveTarget(G.lvl.stable.x, G.lvl.stable.y + 44);
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
  if (k === 't') $('btnPortal').click();
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
$('btnAuto').addEventListener('click', () => {
  if (!G) return;
  audioInit();
  G.autoSkill = !G.autoSkill;
  $('btnAuto').classList.toggle('on', G.autoSkill);
  banner(G.autoSkill ? 'Auto-skills ON' : 'Auto-skills OFF');
  saveDirty = true;
});
$('btnInv').addEventListener('click', () => togglePanel('invPanel'));
$('btnChar').addEventListener('click', () => togglePanel('charPanel'));
$('btnPortal').addEventListener('click', () => {
  if (!G || paused || G.p.hp <= 0) return;
  audioInit();
  if (G.dlvl === 0) { banner('You are already in town'); return; }
  G.portalFloor = G.dlvl;
  spark(G.p.x, G.p.y, '#5ab0ff', 24, 220);
  sfx.stairs();
  enterLevel(0, false);
  banner('Town portal — return via the waypoint');
});
$('btnMenu').addEventListener('click', () => togglePanel('pausePanel'));
$('btnNgPlus').addEventListener('click', () => { audioInit(); newGamePlus(); });
$('btnKeepPlaying').addEventListener('click', () => $('victoryScreen').classList.add('hidden'));
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
      const free = firstFreeSlot();
      if (free < 0) return;
      startGame(id, null, free);
    });
    wrap.appendChild(card);
  }
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
