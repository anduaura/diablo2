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
const isWpFloor = dlvl => dlvl > 0 && dlvl % 5 === 0;   // fixed portals on floors 5, 10, 15, 20, 25 (gates already cover each world's floor 1)
const AUTO_TARGET_R = 180;   // idle heroes lock onto monsters inside this radius
const SAVE_KEY = 'sanctuary_save_v1';

const BOSS_NAMES = ['Gharok the Flayed', 'Mistress Vex', 'Korlath, Tomb Warden',
  'The Hollow King', 'Balegrim the Devourer', 'Ashmaw the Eternal'];

/* cursed floors: opt-in pain for opt-in riches — roughly one floor in
   eight rolls a curse that makes monsters meaner and rewards richer */
const CURSES = [
  { id: 'wither', name: 'The Withering', desc: 'monsters +40% life · magic find +60%', hp: 1.4, mf: 60 },
  { id: 'frenzy', name: 'The Frenzy', desc: 'monsters swifter & fiercer · gold +75%', spd: 1.3, dmg: 1.3, gold: 1.75 },
  { id: 'legion', name: 'The Legion', desc: 'half again as many monsters · +50% experience', count: 1.5, xp: 1.5 },
  { id: 'unstable', name: 'The Unstable', desc: 'slain monsters detonate · +50% item drops', item: 1.5, boom: true },
];

/* the world tyrants: one dragonkind per realm, waiting on its floor 25.
   ele picks the breath element; final tyrants end an act with a victory */
const ELE_COLORS = { fire: '#ff8a3a', cold: '#7ac8ff', light: '#ffd23a', poison: '#4ad46a' };
const DRAGONS = [
  { name: 'THORNWING, THE VERDANT WYRM', body: '#3f6a2e', belly: '#d8b84a', ele: 'poison' },
  { name: 'ISAFROST, WYRM OF THE WHITE WASTE', body: '#7fb0d0', belly: '#e8f2fa', ele: 'cold' },
  { name: 'CINDERMAW, THE CALDERA DRAKE', body: '#8a2c1a', belly: '#ffb03a', ele: 'fire' },
  { name: 'OSSUARY, THE BONE DRAGON', body: '#b8ab8f', belly: '#e0dbcc', ele: 'poison' },
  { name: 'MALGOROTH, LORD OF THE ABYSS', body: '#7a0c20', belly: '#4ad4c8', ele: 'cold', final: true },
  { name: 'MYCELIOR, THE SPOREWYRM', body: '#4a6a5a', belly: '#6adfb8', ele: 'poison' },
  { name: 'SIMOOM, THE SAND WYRM', body: '#74603a', belly: '#e8c05a', ele: 'light' },
  { name: 'PRISMATRIX, THE CRYSTAL WYRM', body: '#4a3a6e', belly: '#c28aff', ele: 'light' },
  { name: 'HAEMOVORE, THE GARDEN TYRANT', body: '#5a1e2a', belly: '#ff5a6a', ele: 'fire' },
  { name: 'NULLSCALE, DEVOURER OF STARS', body: '#14141e', belly: '#8a9aff', ele: 'light', final: true },
  { name: 'ZEPHYRAX, TYRANT OF THE OPEN SKY', body: '#7a8ff0', belly: '#f6f9fd', ele: 'light' },
  { name: 'MECHAGORATH, THE OMEGA ENGINE', body: '#4a525e', belly: '#4affd4', ele: 'fire', final: true },
];

/* five themed worlds, one per 5-floor arc (cycling after floor 25).
   pal: f = floor variants, w = wall, wt = wall highlight, m = mortar,
   acc = accent · deco picks the floor decoration set · flame = torch color */
const WORLDS = [
  { name: 'Verdant Fields', deco: 'flowers', flame: '#ffb03a',
    pal: { f: ['#3d5a2e', '#446234', '#37522a'], w: '#4c5a3e', wt: '#66755a', m: '#242e1a', acc: '#d8b84a' } },
  { name: 'Frozen Tundra', deco: 'snow', flame: '#9adcff',
    pal: { f: ['#aebdca', '#b6c5d2', '#a6b5c2'], w: '#6f9cc0', wt: '#b8d8ee', m: '#2f5a78', acc: '#bfe8ff' } },
  { name: 'Molten Caldera', deco: 'lava', flame: '#ff6a2a',
    pal: { f: ['#2c2422', '#302826', '#282020'], w: '#221a18', wt: '#322624', m: '#100a08', acc: '#ff6a2a' } },
  { name: 'Plains of Undeath', deco: 'graves', flame: '#9adc8a',
    pal: { f: ['#38323e', '#3c3642', '#342e3a'], w: '#2a2430', wt: '#38323e', m: '#120e16', acc: '#9adc8a' } },
  { name: 'Drowned Abyss', deco: 'shells', flame: '#4ad4c8',
    pal: { f: ['#1f3a42', '#234048', '#1b363e'], w: '#182e34', wt: '#24404a', m: '#0a161a', acc: '#4ad4c8' } },
  { name: 'Fungal Depths', deco: 'spores', flame: '#6adfb8',
    pal: { f: ['#243430', '#283a34', '#20302c'], w: '#1a2824', wt: '#28403a', m: '#0c1512', acc: '#6adfb8' } },
  { name: 'Screaming Sands', deco: 'sand', flame: '#ffcf6a',
    pal: { f: ['#5a4c30', '#625434', '#52442c'], w: '#44381e', wt: '#5a4c2a', m: '#241c0e', acc: '#e8c05a' } },
  { name: 'Crystal Hollows', deco: 'crystal', flame: '#c28aff',
    pal: { f: ['#2e2440', '#332948', '#2a203a'], w: '#241c34', wt: '#342a48', m: '#100c1a', acc: '#c28aff' } },
  { name: 'The Blood Gardens', deco: 'veins', flame: '#ff5a6a',
    pal: { f: ['#3c1e22', '#422226', '#361a1e'], w: '#2c1418', wt: '#3e2026', m: '#160a0c', acc: '#ff5a6a' } },
  { name: 'Nullvoid', deco: 'void', flame: '#8a9aff',
    pal: { f: ['#14141e', '#181824', '#10101a'], w: '#0e0e16', wt: '#1c1c2a', m: '#060609', acc: '#8a9aff' } },
  { name: 'Skyreach Isles', deco: 'sky', flame: '#ffd76a',
    pal: { f: ['#a8c2d8', '#b0cade', '#9fbad2'], w: '#dde4ee', wt: '#f6f9fd', m: '#8a94ac', acc: '#ffd76a' } },
  { name: 'The Chrome Bastion', deco: 'tech', flame: '#4affd4',
    pal: { f: ['#232830', '#282d36', '#1e232b'], w: '#343b46', wt: '#4a525e', m: '#12151a', acc: '#4affd4' } },
];
// worlds no longer cycle: past the last arc the deepest world holds forever
const worldOf = dlvl => dlvl <= 0 ? 0 : Math.min(Math.floor((dlvl - 1) / 25), WORLDS.length - 1);
/* world sections: each realm is 25 floors deep. Mini-bosses seal the
   stairs every 5th floor; the realm's dragon tyrant waits on floor 25,
   and slaying it conquers the world and opens the next gate in town */
const WORLD_START = w => w * 25 + 1;
const worldFloor = dlvl => dlvl - 25 * worldOf(dlvl);   // 1..25 within the realm
/* monster scaling depth: within-world floors count in full, but each
   completed realm only adds 15 — keeps ten 25-floor worlds climbable */
const effDepth = dlvl => dlvl <= 0 ? 0 : worldOf(dlvl) * 15 + worldFloor(dlvl);
const gateUnlocked = w => w === 0 || (G.conquered || []).includes(w - 1);
/* re-derive conquests from depth: you must at least have reached a
   realm's 25th floor for its tyrant to be dead */
function inferConquered(deepest) {
  const c = [];
  for (let w = 0; w < WORLDS.length; w++) if (deepest > 25 * (w + 1)) c.push(w);
  return c;
}

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
  moo: () => blip(150, 0.4, 'sawtooth', 0.06, -55),
  rare: () => { blip(784, 0.12, 'triangle', 0.06, 0); setTimeout(() => blip(1046, 0.22, 'triangle', 0.06, 0), 110); },
  epic: () => { blip(659, 0.12, 'triangle', 0.065, 0); setTimeout(() => blip(880, 0.12, 'triangle', 0.065, 0), 110); setTimeout(() => blip(1318, 0.35, 'triangle', 0.07, 0), 220); },
};

/* ---------------- ambient music (tiny procedural score) ----------------
   A low drone in each world's key plus sparse minor-pentatonic bells,
   scheduled a second ahead from the frame loop. No audio assets. */
let musicOn = true;
const music = { drone: null, key: null, nextBell: 0 };
function stopDrone() {
  if (!music.drone) return;
  try {
    music.drone.g.gain.setTargetAtTime(0, AC.currentTime, 0.4);
    const oscs = music.drone.oscs;
    setTimeout(() => oscs.forEach(o => { try { o.stop(); } catch (e) { } }), 2000);
  } catch (e) { }
  music.drone = null; music.key = null;
}
function startDrone(rootHz) {
  stopDrone();
  try {
    const g = AC.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.05, AC.currentTime, 3);
    const filt = AC.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 340;
    g.connect(filt); filt.connect(AC.destination);
    const oscs = [];
    for (const [ratio, type, det] of [[1, 'sine', 0], [1.5, 'sine', 3], [2, 'triangle', -4]]) {
      const o = AC.createOscillator();
      o.type = type; o.frequency.value = rootHz * ratio; o.detune.value = det;
      o.connect(g); o.start();
      oscs.push(o);
    }
    music.drone = { oscs, g };
  } catch (e) { }
}
function bellNote(freq, t, vol) {
  try {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 3);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + 3.2);
  } catch (e) { }
}
const MUSIC_OFFS = [0, -2, -5, 3, -7, -4, 1, 6, -9, -12, 8, -1];   // key offset per world (semitones)
const PENTATONIC = [0, 3, 5, 7, 10, 12, 15];
function musicTick() {
  if (!AC || AC.state !== 'running') return;
  if (!musicOn || !G) { stopDrone(); return; }
  const key = G.dlvl === 0 ? 'town' : 'w' + (G.world || 0);
  const off = G.dlvl === 0 ? 5 : MUSIC_OFFS[G.world || 0] || 0;
  const root = 55 * Math.pow(2, off / 12);
  if (music.key !== key) {
    startDrone(root);
    music.key = key;
    music.nextBell = AC.currentTime + 2;
  }
  while (music.nextBell < AC.currentTime + 1) {
    const t = Math.max(music.nextBell, AC.currentTime + 0.05);
    const step = choice(PENTATONIC);
    const freq = root * 4 * Math.pow(2, step / 12);
    const vol = G.dlvl === 0 ? 0.022 : 0.03;
    bellNote(freq, t, vol);
    if (Math.random() < 0.3) bellNote(freq * 1.5, t + 0.3, vol * 0.5);   // faint echo a fifth up
    music.nextBell = t + rand(2.2, G.dlvl === 0 ? 7 : 5);
  }
}

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
  /* egg-born beasts (indices 6-17): one per realm, never sold in the
     stable — their eggs drop in their home world and open a lair where
     the beast must be bested to be tamed. form picks the body renderer,
     pal recolors it to the realm. */
  { id: 'faefox', name: 'Fae Fox', icon: '🦊', price: 2600, dmgMult: 0.5, kind: 'melee', form: 'wolf', world: 0, ilvl: 6, eggOnly: true, pal: { body: '#c8743a', dark: '#7a3a24', leg: '#a05a2e', eye: '#c86a8a' } },
  { id: 'frostsabre', name: 'Frost Sabre', icon: '❄️', price: 4100, dmgMult: 0.53, kind: 'melee', form: 'tiger', world: 1, ilvl: 8, eggOnly: true, pal: { body: '#b8d8ee', dark: '#4a7a9a', leg: '#8fb8d8', eye: '#9adcff' } },
  { id: 'magmahound', name: 'Magma Hound', icon: '🌋', price: 5600, dmgMult: 0.56, kind: 'melee', form: 'hound', world: 2, ilvl: 10, eggOnly: true, pal: { body: '#5a2c1a', dark: '#ff6a2a', leg: '#3a1c10', eye: '#ff8a3a' } },
  { id: 'gravewolf', name: 'Grave Wolf', icon: '🦴', price: 7100, dmgMult: 0.59, kind: 'melee', form: 'wolf', world: 3, ilvl: 12, eggOnly: true, pal: { body: '#cfc9b8', dark: '#38303c', leg: '#a8a290', eye: '#9adc8a' } },
  { id: 'tidedrake', name: 'Tide Drake', icon: '🌊', price: 8600, dmgMult: 0.62, kind: 'rangedfly', form: 'drake', world: 4, ilvl: 14, eggOnly: true, pal: { body: '#2e7a8a', dark: '#1a4a56', belly: '#7ac8bc', eye: '#bfe8ff' } },
  { id: 'sporesprite', name: 'Spore Sprite', icon: '🍄', price: 10100, dmgMult: 0.65, kind: 'rangedfly', form: 'wisp', world: 5, ilvl: 16, eggOnly: true, pal: { body: '#6adfb8' } },
  { id: 'dunefalcon', name: 'Dune Falcon', icon: '🏜️', price: 11600, dmgMult: 0.68, kind: 'fly', form: 'hawk', world: 6, ilvl: 18, eggOnly: true, pal: { body: '#d8bc7a', dark: '#a8874a' } },
  { id: 'prismpanther', name: 'Prism Panther', icon: '💎', price: 13100, dmgMult: 0.71, kind: 'melee', form: 'tiger', world: 7, ilvl: 20, eggOnly: true, pal: { body: '#7a5aa8', dark: '#c28aff', leg: '#5a4088', eye: '#c28aff' } },
  { id: 'bloodwing', name: 'Bloodwing', icon: '🩸', price: 14600, dmgMult: 0.74, kind: 'rangedfly', form: 'drake', world: 8, ilvl: 22, eggOnly: true, pal: { body: '#8a2432', dark: '#3c1418', belly: '#ff8a9a', eye: '#ff5a6a' } },
  { id: 'voidwisp', name: 'Void Wisp', icon: '🌌', price: 16100, dmgMult: 0.77, kind: 'rangedfly', form: 'wisp', world: 9, ilvl: 24, eggOnly: true, pal: { body: '#8a9aff' } },
  { id: 'zephyrfalcon', name: 'Zephyr Falcon', icon: '🌬️', price: 17600, dmgMult: 0.8, kind: 'fly', form: 'hawk', world: 10, ilvl: 26, eggOnly: true, pal: { body: '#e8ecf4', dark: '#aab4c8' } },
  { id: 'wardenorb', name: 'Warden Orb', icon: '🤖', price: 19100, dmgMult: 0.83, kind: 'rangedfly', form: 'wisp', world: 11, ilvl: 28, eggOnly: true, pal: { body: '#4affd4' } },
];
/* tyrant whelps (indices 18-29): the realms' final bosses in miniature —
   the mightiest companions, from the rarest eggs of their own tyrants */
const WHELP_NAMES = ['Thornwing Whelp', 'Isafrost Whelp', 'Cindermaw Whelp', 'Ossuary Whelp',
  'Malgoroth Whelp', 'Mycelior Whelp', 'Simoom Whelp', 'Prismatrix Whelp',
  'Haemovore Whelp', 'Nullscale Whelp', 'Zephyrax Whelp', 'Mechagorath Core-Spawn'];
for (let i = 0; i < DRAGONS.length; i++) {
  PET_SPECIES.push({
    id: 'whelp' + i, name: WHELP_NAMES[i], icon: '🐲', price: 40000 + i * 6000,
    dmgMult: 1.05 + i * 0.03, kind: 'dragon', form: 'dragon', world: i,
    ilvl: 24 + i * 2, eggOnly: true, whelp: true,
    pal: { body: DRAGONS[i].body, dark: DRAGONS[i].body, belly: DRAGONS[i].belly, eye: DRAGONS[i].belly },
  });
}
const PET_RARITIES = ['common', 'magic', 'rare', 'unique', 'exotic'];
/* wild beasts prowl their home realms — subdue one and it joins your
   stable, mods and all. Dragons roost only in the two highest realms. */
const WILD_HOMES = [
  [0],         // Verdant Fields: hound
  [1],         // Frozen Tundra: dire wolf
  [4],         // Molten Caldera: ember drake
  [0, 1],      // Plains of Undeath: grave hounds & wolves
  [1],         // Drowned Abyss: sea wolf
  [3],         // Fungal Depths: tiger
  [2],         // Screaming Sands: hawk
  [2, 3],      // Crystal Hollows: hawk & tiger
  [3],         // Blood Gardens: tiger
  [4],         // Nullvoid: void drake
  [2, 4, 5],   // Skyreach Isles: hawk, drake & dragon
  [4, 5],      // Chrome Bastion: drake & DRAGON
];
const STARTER_PET = { warrior: 0, sorceress: 1, huntress: 2, necromancer: -1 };
function rollPetRarity() {
  const r = Math.random();
  return r < 0.05 ? 'exotic' : r < 0.15 ? 'unique' : r < 0.4 ? 'rare' : r < 0.75 ? 'magic' : 'common';
}

/* ---------------- pet eggs ----------------
   Eggs drop in each beast's home realm — rarer eggs from rarer foes.
   An egg incubates in real time (rarer = longer), then becomes a living
   key: crack it to open the beast's lair and best it to tame it. */
const EGG_HATCH_MS = [3 * 60000, 12 * 60000, 45 * 60000, 3 * 3600000, 8 * 3600000];
function makeEgg(spIdx, rarity, dlvl) {
  const rIdx = PET_RARITIES.indexOf(rarity);
  return {
    slot: 'egg', base: 'egg', icon: '🥚', rarity, lvl: Math.max(1, dlvl),
    name: PET_SPECIES[spIdx].name + ' Egg', mods: {},
    egg: { sp: spIdx, hatchAt: Date.now() + EGG_HATCH_MS[rIdx] },
  };
}
const eggReady = it => it.egg && Date.now() >= it.egg.hatchAt;
function fmtDur(ms) {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
}
function makePetData(spIdx, rarity) {
  const sp = PET_SPECIES[spIdx];
  const rIdx = PET_RARITIES.indexOf(rarity);
  const nMods = [1, ri(1, 2), ri(2, 3), 3, 4][rIdx];
  const mult = [0.7, 1, 1.3, 1.7, 2.2][rIdx];
  const ilvl = sp.ilvl || (2 + spIdx * 4);   // exotic species roll bigger buffs
  const mods = {}, used = new Set();
  for (let i = 0; i < nMods; i++) {
    const a = choice(AFFIXES);
    if (used.has(a.stat)) continue;
    used.add(a.stat);
    mods[a.stat] = (mods[a.stat] || 0) + Math.max(1, Math.round(a.roll(ilvl) * mult));
  }
  return { sp: spIdx, rarity, mods, price: Math.round(sp.price * (1 + rIdx * 0.6)) };
}

/* class passives: two per class, up to 5 ranks each, bought with skill points */
const SKILL_MAX = 10, PASSIVE_MAX = 5;
const PASSIVES = {
  warrior: [
    { id: 'mastery', name: 'Weapon Mastery', icon: '⚔️', desc: '+4% damage per rank' },
    { id: 'juggernaut', name: 'Juggernaut', icon: '🛡️', desc: '+5% life per rank' }],
  sorceress: [
    { id: 'attune', name: 'Elemental Attunement', icon: '🌀', desc: '+8% elemental damage per rank' },
    { id: 'focus', name: 'Arcane Focus', icon: '🔮', desc: '+6% mana & regen per rank' }],
  huntress: [
    { id: 'precision', name: 'Precision', icon: '🎯', desc: '+2% crit chance per rank' },
    { id: 'fleet', name: 'Fleetfoot', icon: '🌬️', desc: '+3% move & attack speed per rank' }],
  necromancer: [
    { id: 'gravemight', name: 'Grave Might', icon: '💀', desc: '+8% minion damage & life per rank' },
    { id: 'occult', name: 'Occult Focus', icon: '🕯️', desc: '+6% mana & regen per rank' }],
};
const skillRank = (p, i) => (p.skillLvls && p.skillLvls[i]) || 1;
const skillMult = (p, i) => 1 + 0.15 * (skillRank(p, i) - 1);
const passiveRank = (p, id) => {
  const defs = PASSIVES[p.cls];
  const i = defs.findIndex(d => d.id === id);
  return i >= 0 && p.passives ? (p.passives[i] || 0) : 0;
};

/* ---------------- monster data ---------------- */
const MTYPES = [
  { id: 'fallen', name: 'Fallen Imp', hp: 15, dmg: [2, 4], spd: 118, r: 11, xp: 8, gold: [2, 6], atkCd: 1.0, range: 26, minL: 1, w: 3, color: '#c0392b' },
  { id: 'zombie', name: 'Zombie', hp: 34, dmg: [3, 7], spd: 44, r: 14, xp: 13, gold: [3, 8], atkCd: 1.4, range: 30, minL: 1, w: 3, color: '#6a8a4a' },
  { id: 'skel', name: 'Skeleton', hp: 24, dmg: [4, 8], spd: 92, r: 13, xp: 14, gold: [3, 9], atkCd: 1.0, range: 30, minL: 2, w: 3, color: '#cfc9b8' },
  { id: 'archer', name: 'Bone Archer', hp: 18, dmg: [4, 9], spd: 80, r: 12, xp: 17, gold: [4, 10], atkCd: 1.7, range: 250, ranged: true, minL: 3, w: 2, color: '#b8ab8f' },
  { id: 'ghoul', name: 'Ghoul', hp: 46, dmg: [7, 12], spd: 108, r: 14, xp: 24, gold: [5, 13], atkCd: 0.9, range: 32, minL: 5, w: 2, color: '#7a5a8a' },
  { id: 'brute', name: 'Hell Brute', hp: 100, dmg: [11, 18], spd: 66, r: 20, xp: 45, gold: [10, 24], atkCd: 1.5, range: 42, minL: 7, w: 1, color: '#8a2c1a' },
  /* wOnly monsters haunt a single world and nowhere else */
  { id: 'harpy', name: 'Storm Harpy', hp: 60, dmg: [10, 16], spd: 132, r: 13, xp: 55, gold: [12, 26], atkCd: 0.9, range: 30, minL: 1, wOnly: 10, w: 8, color: '#bfe0ff' },
  { id: 'djinn', name: 'Cloud Djinn', hp: 85, dmg: [12, 19], spd: 88, r: 15, xp: 70, gold: [15, 32], atkCd: 1.6, range: 240, ranged: true, minL: 1, wOnly: 10, w: 5, color: '#9adcff' },
  { id: 'roc', name: 'Thunder Roc', hp: 145, dmg: [15, 24], spd: 74, r: 20, xp: 95, gold: [20, 40], atkCd: 1.4, range: 44, minL: 1, wOnly: 10, w: 3, color: '#7a8ff0' },
  { id: 'scrapbot', name: 'Scrap Skitterer', hp: 55, dmg: [10, 17], spd: 142, r: 11, xp: 60, gold: [14, 30], atkCd: 0.8, range: 26, minL: 1, wOnly: 11, w: 8, color: '#8a94a4' },
  { id: 'sentinel', name: 'Laser Sentinel', hp: 80, dmg: [13, 20], spd: 70, r: 13, xp: 75, gold: [18, 36], atkCd: 1.5, range: 260, ranged: true, minL: 1, wOnly: 11, w: 5, color: '#4affd4' },
  { id: 'warbot', name: 'Siege Automaton', hp: 175, dmg: [17, 26], spd: 58, r: 20, xp: 110, gold: [24, 48], atkCd: 1.6, range: 46, minL: 1, wOnly: 11, w: 3, color: '#5a6472' },
];
/* the gilded imp never fights — it flees dripping coins and escapes if not slain */
const TIMP_TYPE = { id: 'timp', name: 'Gilded Imp', hp: 60, dmg: [0, 0], spd: 148, r: 11, xp: 45, gold: [30, 60], atkCd: 9, range: 0, minL: 1, w: 0, flee: true, color: '#ffd23a' };
/* hell bovines only graze in the secret pasture — never in the dungeon pool */
const COW_TYPE = { id: 'cow', name: 'Hell Bovine', hp: 42, dmg: [6, 11], spd: 108, r: 14, xp: 22, gold: [8, 18], atkCd: 1.0, range: 34, minL: 1, w: 0, color: '#e8e4da' };
const COW_KING = { id: 'cowking', name: 'THE COW KING', hp: 320, dmg: [14, 22], spd: 84, r: 24, xp: 260, gold: [150, 280], atkCd: 1.1, range: 52, minL: 1, w: 0, color: '#e8e4da' };

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
function gemItem(k, q, ilvl, forceRarity) {
  const rarity = forceRarity || (() => {
    const r = Math.random();
    return r < 0.03 ? 'exotic' : r < 0.1 ? 'unique' : r < 0.25 ? 'rare' : r < 0.55 ? 'magic' : 'common';
  })();
  const rIdx = ['common', 'magic', 'rare', 'unique', 'exotic'].indexOf(rarity);
  const base = (k === 'skull' ? 2 : 3) + q * (k === 'skull' ? 2 : 4) + ri(0, 2);
  let v = Math.max(1, Math.round(base * [1, 1.4, 1.9, 2.6, 3.5][rIdx]));
  if (k === 'skull') v = Math.min(v, 15);   // life steal stays sane
  return {
    slot: 'gem', g: k, q, v, icon: GEMS[k].icon, rarity, mods: {},
    name: ['Chipped ', '', 'Flawless '][q] + ['', '', 'Radiant ', 'Pristine ', 'Celestial '][rIdx] + GEMS[k].name,
    base: 'gem', lvl: ilvl,
  };
}
function makeGem(ilvl, forceRarity) {
  return gemItem(choice(Object.keys(GEMS)), ilvl < 5 ? 0 : ilvl < 10 ? 1 : 2, ilvl, forceRarity);
}
/* quality tier of a gem; older saves lack .q so fall back to the name */
function gemQ(it) {
  if (it.q !== undefined) return it.q;
  return it.name.startsWith('Chipped') ? 0 : it.name.startsWith('Flawless') ? 2 : 1;
}
/* the fusion ladder: three of a kind climb quality first, then grade.
   Below Flawless, 3 same-kind same-quality gems (any grades) fuse into
   the next quality, keeping the best grade. Flawless gems keep going:
   3 of the same grade fuse into the next rarity grade, all the way to
   Celestial. Chipped commons to one Celestial Flawless: 3^6 gems. */
const GEM_GRADES = ['common', 'magic', 'rare', 'unique', 'exotic'];
const gemGradeIdx = it => Math.max(0, GEM_GRADES.indexOf(it.rarity));
function fusableGroups(inv) {
  const groups = {};
  for (let i = 0; i < inv.length; i++) {
    const it = inv[i];
    let key = null;
    if (it.g) {
      const q = gemQ(it);
      // quality fuses accept mixed grades; grade fuses need matching grade
      key = q < 2 ? 'q:' + it.g + ':' + q
        : gemGradeIdx(it) < GEM_GRADES.length - 1 ? 'g:' + it.g + ':' + gemGradeIdx(it) : null;
    } else if (it.slot === 'charm' && charmT(it) < 2) {
      key = 'c:' + charmT(it);
    } else if (it.slot === 'sigil' && !it.golden) {
      key = 's:0';
    }
    if (!key) continue;
    (groups[key] = groups[key] || []).push(i);
  }
  const out = [];
  for (const key in groups) {
    if (groups[key].length < 3) continue;
    const idx = groups[key].slice(0, 3);
    const src = inv[idx[0]];
    const lvl = Math.max(...idx.map(i => inv[i].lvl || 1));
    let result, from = src.name;
    if (key[0] === 'q') {
      const bestGrade = GEM_GRADES[Math.max(...idx.map(i => gemGradeIdx(inv[i])))];
      result = gemItem(src.g, gemQ(src) + 1, lvl, bestGrade);
    } else if (key[0] === 'g') {
      result = gemItem(src.g, 2, lvl, GEM_GRADES[gemGradeIdx(src) + 1]);
    } else if (key[0] === 'c') {
      result = makeCharm(lvl, charmT(src) + 1);
      from = CHARM_TIERS[charmT(src)].name.trim();
    } else {
      result = makeSigil(lvl, true);
      from = 'Bovine Sigil';
    }
    out.push({ idx, from, result });
  }
  return out;
}
/* fusion feedback color: a gem's stone, otherwise the result's rarity */
const fuseColor = it => it.g ? GEMS[it.g].color : rarityColor(it.rarity);
/* kept for quick "is anything fusable" checks */
function fusableGems(inv) {
  const gs = fusableGroups(inv);
  return gs.length ? gs[0].idx : null;
}
/* auto-merge: apply fusions until none remain, cascading up the ladder
   (three fresh Rubies made by quality-fuses will themselves fuse on) */
function fuseAll(p) {
  let count = 0, finest = null;
  const order = ['common', 'magic', 'rare', 'unique', 'exotic'];
  for (let guard = 0; guard < 400; guard++) {
    const gs = fusableGroups(p.inv);
    if (!gs.length) break;
    const g = gs[0];
    for (let k = g.idx.length - 1; k >= 0; k--) p.inv.splice(g.idx[k], 1);
    p.inv.push(g.result);
    count++;
    if (!finest ||
      order.indexOf(g.result.rarity) > order.indexOf(finest.rarity) ||
      (g.result.rarity === finest.rarity && gemQ(g.result) > gemQ(finest)))
      finest = g.result;
  }
  return { count, finest };
}
/* charms: power that lives in your bag — the slot it occupies is the cost */
const CHARM_SUFFIX = {
  str: 'of the Bear', dex: 'of the Fox', vit: 'of the Oak', ene: 'of the Mind',
  hp: 'of Life', mp: 'of Spirit', dmgPct: 'of Wrath', armor: 'of Warding',
  leech: 'of the Leech', mf: 'of Fortune', fireDmg: 'of Embers',
  coldDmg: 'of Frost', lightDmg: 'of Storms', poisonDmg: 'of Venom',
};
/* charm tiers: Small (1 affix) → Grand (2) → Exalted (3, fusion-only) */
const CHARM_TIERS = [
  { name: 'Small Charm ', icon: '🔶', rarity: 'magic', aff: 1, mult: 0.5 },
  { name: 'Grand Charm ', icon: '🧿', rarity: 'rare', aff: 2, mult: 0.75 },
  { name: 'Exalted Charm ', icon: '🪬', rarity: 'unique', aff: 3, mult: 1.05 },
];
function makeCharm(ilvl, tier) {
  const t = tier !== undefined ? tier : (Math.random() < 0.3 ? 1 : 0);
  const def = CHARM_TIERS[t];
  const it = {
    slot: 'charm', base: 'charm', ct: t, icon: def.icon,
    rarity: def.rarity, lvl: ilvl, mods: {},
  };
  // draw affixes without replacement so the tier's count is guaranteed
  const pool = [...AFFIXES];
  for (let i = 0; i < def.aff && pool.length; i++) {
    const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    it.mods[a.stat] = Math.max(1, Math.round(a.roll(ilvl) * def.mult));
  }
  const first = Object.keys(it.mods)[0];
  it.name = def.name + (CHARM_SUFFIX[first] || 'of Power');
  return it;
}
/* charm tier of an item; pre-tier saves lack .ct so read the name */
function charmT(it) {
  if (it.ct !== undefined) return it.ct;
  return it.name.startsWith('Exalted') ? 2 : it.name.startsWith('Grand') ? 1 : 0;
}

/* the key to the secret pasture — floor bosses sometimes carry one */
function makeSigil(ilvl, golden) {
  return {
    slot: 'sigil', base: 'sigil', golden: !!golden,
    name: golden ? 'Golden Bovine Sigil' : 'Bovine Sigil', icon: '🐮',
    rarity: golden ? 'exotic' : 'unique', lvl: ilvl || 1, mods: {},
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
let hardcoreNext = false;  // menu toggle: forge the next hero as hardcore

/* challenge runs: a modifier chosen at hero creation, active for that
   hero's whole life — beating Malgoroth under one earns a trophy */
const CHALLENGES = [
  { id: 'gauntlet', name: "Champion's Gauntlet", icon: '👑', desc: 'half of all monsters are champions' },
  { id: 'ascetic', name: 'Ascetic', icon: '🚱', desc: 'potions never drop and cannot be bought' },
  { id: 'glass', name: 'Glass Cannon', icon: '💥', desc: '+50% damage, half life' },
  { id: 'swift', name: 'Swift Death', icon: '⚡', desc: 'monsters are faster and hit harder' },
];
let challengeNext = null;   // menu toggle: modifier for the next forged hero
const BADGE_KEY = 'sanctuary_badges';
function loadBadges() { try { return JSON.parse(localStorage.getItem(BADGE_KEY)) || []; } catch (e) { return []; } }
function addBadge(b) {
  const badges = loadBadges();
  if (badges.some(x => x.challenge === b.challenge)) return;   // one trophy per challenge
  badges.push(b);
  try { localStorage.setItem(BADGE_KEY, JSON.stringify(badges)); } catch (e) { }
}
const challengeOf = id => CHALLENGES.find(c => c.id === id) || null;

/* graveyard: hall of fame for fallen hardcore heroes */
const GRAVE_KEY = 'sanctuary_graveyard';
function loadGraves() { try { return JSON.parse(localStorage.getItem(GRAVE_KEY)) || []; } catch (e) { return []; } }
function addGrave(g) {
  const graves = loadGraves();
  graves.unshift(g);
  try { localStorage.setItem(GRAVE_KEY, JSON.stringify(graves.slice(0, 20))); } catch (e) { }
}

function newPlayer(clsId) {
  const c = CLASSES[clsId];
  const starter = STARTER_PET[clsId] >= 0 ? [makePetData(STARTER_PET[clsId], 'common')] : [];
  return {
    pets: starter, activePet: starter.length ? 0 : -1,
    cls: clsId, x: 0, y: 0, r: 14, dir: 0,
    level: 1, xp: 0, statPts: 0, gold: 0,
    skillPts: 0, skillLvls: [1, 1, 1, 1], passives: [0, 0],
    hardcore: false, challenge: null,
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
  // charms grant their mods straight from the bag
  for (const it of p.inv) {
    if (it.slot !== 'charm') continue;
    for (const k in it.mods) m[k] = (m[k] || 0) + it.mods[k];
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
  // class passives
  m.dmgPct += 4 * passiveRank(p, 'mastery');
  if (p.challenge === 'glass') m.dmgPct += 50;   // Glass Cannon challenge
  const hpMult = (1 + 0.05 * passiveRank(p, 'juggernaut')) * (p.challenge === 'glass' ? 0.5 : 1);
  const mpMult = 1 + 0.06 * (passiveRank(p, 'focus') + passiveRank(p, 'occult'));
  const eleMult = 1 + 0.08 * passiveRank(p, 'attune');
  const fleet = passiveRank(p, 'fleet');
  const mult = (1 + prim * 0.012) * (1 + m.dmgPct / 100);
  return {
    str, dex, vit, ene,
    maxHp: Math.round((40 + vit * 3.5 + p.level * 8 + m.hp) * hpMult),
    maxMp: Math.round((20 + ene * 2.5 + p.level * 3 + m.mp) * mpMult),
    dmgLo: Math.max(1, Math.round(wdmg[0] * mult)),
    dmgHi: Math.max(2, Math.round(wdmg[1] * mult)),
    armor: Math.round(warmor + m.armor + dex * 0.25),
    crit: Math.min(0.6, 0.05 + dex * 0.002 + 0.02 * passiveRank(p, 'precision')),
    leech: m.leech / 100, mf: m.mf,
    fire: Math.round(m.fireDmg * eleMult), cold: Math.round(m.coldDmg * eleMult),
    light: Math.round(m.lightDmg * eleMult), poison: Math.round(m.poisonDmg * eleMult),
    hpRegen: 1 + vit * 0.03,
    mpRegen: (1.6 + ene * 0.06) * mpMult,
    spdMult: 1 + 0.03 * fleet, atkSpd: 1 + 0.03 * fleet,
    minionMult: 1 + 0.08 * passiveRank(p, 'gravemight'),
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
function genLevel(dlvl, riftMode) {
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
  if (isWpFloor(dlvl) && !riftMode) {
    const wpRoom = rooms.find(r => r !== r0 && r !== exit) || r0;
    const wx = wpRoom.cx + 1 < wpRoom.x + wpRoom.w ? wpRoom.cx + 1 : wpRoom.cx - 1;
    if (map[wpRoom.cy][wx] === T_FLOOR) {
      map[wpRoom.cy][wx] = T_WP;
      wp = { x: wx * TILE + TILE / 2, y: wpRoom.cy * TILE + TILE / 2 };
    }
  }

  // scenery props: trees and their kin, themed to the world. Each prop
  // claims its tile as wall (blocks movement, pathing and arrows) but is
  // drawn as a y-sorted entity on a floor base. Only tiles whose eight
  // neighbours are all open floor qualify, so a prop can never choke a
  // corridor or wall in the stairs.
  const props = [];
  const wIdx = worldOf(dlvl);
  for (const room of rooms) {
    if (room === r0) continue;   // keep the arrival room clear
    const n = Math.random() < 0.7 ? ri(1, 2) : 0;
    for (let k = 0; k < n && props.length < 9; k++) {
      const px2 = ri(room.x + 1, room.x + room.w - 2), py2 = ri(room.y + 1, room.y + room.h - 2);
      if (map[py2][px2] !== T_FLOOR) continue;
      let open = true;
      for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++)
        if (map[py2 + dy][px2 + dx] !== T_FLOOR) { open = false; break; }
      if (!open) continue;
      map[py2][px2] = T_WALL;
      props.push({ tx: px2, ty: py2, x: px2 * TILE + TILE / 2, y: py2 * TILE + TILE * 0.75, w: wIdx, v: Math.random() < 0.6 ? 0 : 1 });
    }
  }
  const propSet = new Set(props.map(pr => pr.ty * MAP_W + pr.tx));

  // a stranded wanderer with a favour to ask, on each world's first floor
  let questNpc = null, satchel = null;
  if (!riftMode && G) {
    const q = QUESTS[wIdx], st = questState(wIdx);
    if (q && dlvl === WORLD_START(wIdx) && (!st || st.s !== 'claimed')) {
      const room = rooms.find(r => r !== r0 && r !== exit) || rooms[rooms.length - 1];
      if (map[room.y + 1][room.cx] === T_FLOOR)
        questNpc = { w: wIdx, x: room.cx * TILE + TILE / 2, y: (room.y + 1) * TILE + TILE / 2 };
    }
    // the lost satchel waits on a deeper floor of its world
    if (q && q.type === 'satchel' && st && st.s === 'active' && dlvl === WORLD_START(wIdx) + q.floorOff) {
      const room = rooms.find(r => r !== r0 && r !== exit) || rooms[rooms.length - 1];
      if (map[room.cy][room.cx] === T_FLOOR)
        satchel = { x: room.cx * TILE + TILE / 2, y: room.cy * TILE + TILE / 2, got: false };
    }
  }

  // torches on walls adjacent to floor
  const torches = [];
  for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
    if (map[y][x] === T_WALL && map[y + 1][x] >= T_FLOOR && !propSet.has(y * MAP_W + x) && thash(x, y) < 0.09)
      torches.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE * 0.9 });
  }

  // monsters
  const monsters = [];
  const wf = worldFloor(dlvl);
  const isDragonFloor = wf === 25 && !riftMode;             // the realm's tyrant
  const isBossFloor = (wf % 5 === 0 && !riftMode) || isDragonFloor;   // mini-bosses every 5th
  const pool = MTYPES.filter(t => t.minL <= dlvl && (t.wOnly === undefined || t.wOnly === wIdx));
  const curse = (!riftMode && G && wf !== 25 && Math.random() < 0.13) ? choice(CURSES) : null;
  const ngm = 1 + (G && G.ng || 0) * 0.8;   // New Game+ multiplier
  const eff = effDepth(dlvl);
  const scaleHp = (1 + 0.4 * (eff - 1) + 0.05 * (eff - 1) * (eff - 1)) * ngm * (curse && curse.hp || 1);
  const scaleDmg = (1 + 0.22 * (eff - 1)) * ngm * (curse && curse.dmg || 1);
  const scaleXp = (1 + 0.3 * (eff - 1)) * ngm * (curse && curse.xp || 1);
  const wpick = () => {
    let tot = 0; for (const t of pool) tot += t.w;
    let r = Math.random() * tot;
    for (const t of pool) { r -= t.w; if (r <= 0) return t; }
    return pool[0];
  };
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    if (isBossFloor && room === exit) continue;         // boss room kept clear for the boss
    let n = Math.min(riftMode ? 9 : 7, ri(2, 3) + Math.floor(dlvl / 3) + (riftMode ? 2 : 0));
    if (curse && curse.count) n = Math.min(10, Math.round(n * curse.count));
    for (let k = 0; k < n; k++) {
      const t = wpick();
      const champ = Math.random() < (G && G.p.challenge === 'gauntlet' ? 0.5 : 0.08);
      let mx, my, tries = 0;
      do {
        mx = room.x + rand(0.8, room.w - 0.8);
        my = room.y + rand(0.8, room.h - 0.8);
      } while (map[Math.floor(my)][Math.floor(mx)] !== T_FLOOR && ++tries < 10);
      if (map[Math.floor(my)][Math.floor(mx)] !== T_FLOOR) continue;
      monsters.push(makeMonster(t, mx * TILE, my * TILE, scaleHp, scaleDmg, scaleXp, champ, false, dlvl));
    }
  }
  // a gilded imp sometimes scurries in the dark, stuffed with treasure
  if (!riftMode && G && Math.random() < 0.1) {
    const room = rooms[ri(1, rooms.length - 1)];
    if (!(isBossFloor && room === exit))
      monsters.push(makeMonster(TIMP_TYPE, room.cx * TILE, room.cy * TILE, scaleHp, scaleDmg, scaleXp, false, false, dlvl));
  }
  // a wild beast prowls some floors of its home realm — subdue it to tame it
  if (!riftMode && G && !isBossFloor && Math.random() < 0.08) {
    const sp = choice(WILD_HOMES[wIdx] || [0]);
    const spd2 = PET_SPECIES[sp];
    const wt = {
      id: 'wildpet', name: 'Wild ' + spd2.name, hp: Math.round(95 * (1 + sp * 0.22)),
      dmg: [Math.round(9 * (0.7 + spd2.dmgMult)), Math.round(15 * (0.7 + spd2.dmgMult))],
      spd: spd2.kind === 'fly' ? 135 : 115, r: sp >= 4 ? 18 : 14, xp: 70 + sp * 25, gold: [0, 0],
      atkCd: 1.0, range: sp >= 4 ? 230 : 34, ranged: sp >= 4, minL: 1, w: 0, color: '#e8c14d',
    };
    const room = rooms[ri(1, rooms.length - 1)];
    const wm = makeMonster(wt, room.cx * TILE + 20, room.cy * TILE, scaleHp, scaleDmg, scaleXp, false, false, dlvl);
    wm.wild = { data: makePetData(sp, rollPetRarity()) };
    monsters.push(wm);
  }
  let boss = null;
  if (isBossFloor) {
    let bt;
    if (isDragonFloor) {
      // the realm's dragon tyrant
      const dr = DRAGONS[wIdx];
      bt = {
        id: 'dragon', name: dr.name, hp: 620, dmg: [16, 26], spd: 90, r: 30,
        xp: 520, gold: [220, 420], atkCd: 1.1, range: 72, w: 0, minL: 1,
        color: dr.body,
      };
    } else {
      bt = { id: 'boss', name: choice(BOSS_NAMES), hp: 240, dmg: [12, 20], spd: 78, r: 26, xp: 160, gold: [60, 120], atkCd: 1.1, range: 52, w: 0, minL: 1, color: '#a01818' };
    }
    boss = makeMonster(bt, exit.cx * TILE + TILE / 2, exit.cy * TILE - TILE, scaleHp, scaleDmg, scaleXp, false, true, dlvl);
    if (isDragonFloor) {
      boss.dragon = wIdx;
      boss.breathT = 3;
      if (DRAGONS[wIdx].final) { boss.final = true; boss.summonT = 6; boss.novaT = 2; }
    }
    monsters.push(boss);
  }

  // dungeon events: shrines, treasure chests, gold piles
  const shrines = [], chests = [], goldPiles = [];
  const SHRINE_KINDS = ['combat', 'armor', 'speed', 'healing', 'gem', 'xp', 'bandit'];
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

  // world wonders: each realm's signature interactable (see WONDER_INFO)
  const wonders = [];
  if (!riftMode) {
    const wrooms = rooms.filter(r => r !== r0 && r !== exit);
    if (wIdx === 9) {   // Nullvoid: a linked pair of void tears
      if (wrooms.length >= 2 && Math.random() < 0.8) {
        const ra = wrooms[0], rb = wrooms[wrooms.length - 1];
        wonders.push({ x: ra.cx * TILE + TILE / 2, y: ra.cy * TILE + TILE / 2, w: 9, used: false, t: 0, twin: 1 });
        wonders.push({ x: rb.cx * TILE + TILE / 2, y: rb.cy * TILE + TILE / 2, w: 9, used: false, t: 0, twin: 0 });
      }
    } else {
      const maxW = wIdx === 5 ? 3 : 2;   // spore pods come in chains
      for (const room of wrooms) {
        if (wonders.length >= maxW) break;
        if (Math.random() < (wIdx === 5 ? 0.3 : 0.22)) {
          const wx = ri(room.x + 1, room.x + room.w - 2), wy = ri(room.y + 1, room.y + room.h - 2);
          if (map[wy][wx] === T_FLOOR)
            wonders.push({ x: wx * TILE + TILE / 2, y: wy * TILE + TILE / 2, w: wIdx, used: false, t: 0 });
        }
      }
    }
  }

  if (curse && curse.spd) for (const mm of monsters) mm.spd *= curse.spd;

  // a secret vault sometimes hides behind a cracked wall: a 3x3 chamber
  // carved into solid rock, sealed by one crumbling tile
  let crack = null;
  if (!riftMode) {
    outer:
    for (let tries = 0; tries < (Math.random() < 0.28 ? 30 : 0); tries++) {
      const room = rooms[ri(1, rooms.length - 1)];
      const dir = choice([[-1, 0], [1, 0], [0, -1], [0, 1]]);
      const cx2 = dir[0] === 0 ? room.cx : (dir[0] < 0 ? room.x - 1 : room.x + room.w);
      const cy2 = dir[1] === 0 ? room.cy : (dir[1] < 0 ? room.y - 1 : room.y + room.h);
      const vx = cx2 + dir[0] * 2, vy = cy2 + dir[1] * 2;
      if (vx < 3 || vx > MAP_W - 4 || vy < 3 || vy > MAP_H - 4) continue;
      if (map[cy2][cx2] !== T_WALL) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const tx2 = vx + dx, ty2 = vy + dy;
        if (tx2 === cx2 && ty2 === cy2) continue;
        if (map[ty2][tx2] !== T_WALL || propSet.has(ty2 * MAP_W + tx2)) continue outer;
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) map[vy + dy][vx + dx] = T_FLOOR;
      chests.push({ x: vx * TILE + TILE / 2, y: vy * TILE + TILE / 2, opened: false, vault: true });
      goldPiles.push({ x: (vx - dir[0]) * TILE + TILE / 2, y: (vy - dir[1]) * TILE + TILE / 2 });
      crack = { tx: cx2, ty: cy2, open: false, t: 0 };
      break;
    }
  }

  return {
    map, rooms, torches, monsters, boss, wp, shrines, chests, goldPiles, wonders, curse, crack,
    props, propSet, questNpc, satchel,
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: isBossFloor || !!riftMode,
    entrance: { x: r0.cx * TILE + TILE / 2, y: r0.cy * TILE + TILE / 2 + TILE * 0.7 },
    exitTile: { x: exit.cx, y: exit.cy },
  };
}

/* -------- rifts: timed one-floor challenges opened from the town obelisk -- */
const RIFT_TIME = 150;   // seconds on the clock
const RIFT_GUARDIAN = { id: 'riftguardian', name: 'RIFT GUARDIAN', hp: 280, dmg: [13, 21], spd: 82, r: 26, xp: 220, gold: [120, 220], atkCd: 1.0, range: 56, minL: 1, w: 0, color: '#b86adf' };
const riftDepth = tier => 3 + tier * 6;
function enterRift(tier) {
  G.cowLevel = false; G.goldenPasture = false;
  G.petLair = null;
  const depth = riftDepth(tier);
  G.dlvl = depth;                        // drives monster & loot scaling
  G.rift = { tier, t: RIFT_TIME, elapsed: 0, kills: 0, need: 0, guardian: false, done: false };
  G.lvl = genLevel(depth, true);
  G.rift.need = Math.min(30, Math.max(10, Math.floor(G.lvl.monsters.length * 0.75)));
  G.projs = []; G.parts = []; G.texts = []; G.drops = []; G.rings = [];
  G.beams = []; G.meteors = []; G.clouds = []; G.onWp = false;
  G.minions = [];
  if (G.merc && G.merc.alive) G.minions.push(makeMercEntity());
  const actPet2 = G.p.pets && G.p.pets[G.p.activePet];
  G.pet = actPet2 ? spawnPet(actPet2) : null;
  const p = G.p;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null; p.strafeN = 0;
  G.world = worldOf(depth);
  $('floorLabel').textContent = '🌀 Rift · Tier ' + tier + (p.hardcore ? ' ☠' : '');
  banner('RIFT TIER ' + tier + ' — slay ' + G.rift.need + ' to summon the Guardian!');
  sfx.boss();
}
function spawnRiftGuardian() {
  const ex = G.lvl.exitTile;
  const guard = makeMonster(RIFT_GUARDIAN,
    ex.x * TILE + TILE / 2, ex.y * TILE - TILE,
    (1 + 0.4 * (effDepth(G.dlvl) - 1) + 0.05 * (effDepth(G.dlvl) - 1) * (effDepth(G.dlvl) - 1)),
    (1 + 0.22 * (effDepth(G.dlvl) - 1)),
    (1 + 0.3 * (effDepth(G.dlvl) - 1)),
    false, true, G.dlvl);
  guard.aggro = true;
  G.lvl.monsters.push(guard);
  G.lvl.boss = guard;
  G.rift.guardian = true;
  banner('⚔ THE RIFT GUARDIAN EMERGES ⚔');
  shake(0.3); sfx.boss();
}
function riftComplete(m) {
  const r = G.rift;
  r.done = true;
  const took = Math.max(1, Math.round(r.elapsed));
  G.riftBest = G.riftBest || {};
  if (!G.riftBest[r.tier] || took < G.riftBest[r.tier]) G.riftBest[r.tier] = took;
  let msg = 'Rift conquered in ' + fmtTime(took) + '!';
  if (r.tier >= (G.maxRiftTier || 1)) { G.maxRiftTier = r.tier + 1; msg += '  Tier ' + (r.tier + 1) + ' unlocked!'; }
  banner(msg);
  // loot shower on top of the guardian's own drops
  const ilvl = Math.max(1, G.dlvl + (G.ng || 0) * 8);
  for (let i = 0; i < 2; i++) {
    const rr = Math.random();
    G.drops.push({
      kind: 'item',
      item: makeItem(choice(SLOTS), ilvl, rr < 0.12 ? 'exotic' : rr < 0.3 ? 'unique' : rr < 0.5 ? 'set' : 'rare'),
      x: m.x + rand(-30, 30), y: m.y + rand(-20, 30),
    });
  }
  G.drops.push({ kind: 'item', item: makeGem(ilvl), x: m.x + rand(-24, 24), y: m.y + 30 });
  G.drops.push({ kind: 'gold', amt: Math.round(120 * (1 + G.dlvl * 0.3)), x: m.x, y: m.y + 40 });
  sfx.level(); saveDirty = true;
}
const fmtTime = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');

/* -------- the secret cow level: one huge pasture, many angry bovines ----- */
function genCowLevel(depth, golden) {
  const map = []; for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(T_WALL));
  const R = { x: 6, y: 6, w: 40, h: 40, cx: 26, cy: 26 };
  for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) map[y][x] = T_FLOOR;
  // scattered rocks & fence posts for cover
  for (let i = 0; i < 46; i++) {
    const x = ri(R.x + 2, R.x + R.w - 3), y = ri(R.y + 2, R.y + R.h - 3);
    if (Math.abs(x - R.cx) + Math.abs(y - (R.y + R.h - 4)) > 6) map[y][x] = T_WALL;
  }
  const ex = R.cx, ey = R.y + R.h - 3;   // entrance at the south edge
  map[ey][ex] = T_FLOOR; map[ey][ex - 2] = T_DOWN;   // portal home right beside it
  // shade trees for the herd
  const props = [];
  for (let i = 0; i < 7; i++) {
    const px2 = ri(R.x + 2, R.x + R.w - 3), py2 = ri(R.y + 2, R.y + R.h - 3);
    if (map[py2][px2] !== T_FLOOR || dist(px2, py2, ex, ey) < 6) continue;
    let open = true;
    for (let dy = -1; dy <= 1 && open; dy++) for (let dx = -1; dx <= 1; dx++)
      if (map[py2 + dy][px2 + dx] !== T_FLOOR) { open = false; break; }
    if (!open) continue;
    map[py2][px2] = T_WALL;
    props.push({ tx: px2, ty: py2, x: px2 * TILE + TILE / 2, y: py2 * TILE + TILE * 0.75, w: 0, v: i % 3 === 2 ? 1 : 0 });
  }
  const propSet = new Set(props.map(pr => pr.ty * MAP_W + pr.tx));
  const torches = [];
  for (let i = 0; i < 14; i++) torches.push({ x: ri(R.x + 1, R.x + R.w - 2) * TILE + TILE / 2, y: ri(R.y + 1, R.y + R.h - 2) * TILE + TILE * 0.9 });
  // the herd
  const ngm = 1 + (G && G.ng || 0) * 0.8;
  const eff = effDepth(depth);
  const scaleHp = (1 + 0.4 * (eff - 1) + 0.05 * (eff - 1) * (eff - 1)) * ngm;
  const scaleDmg = (1 + 0.22 * (eff - 1)) * ngm;
  const scaleXp = (1 + 0.3 * (eff - 1)) * ngm;
  const monsters = [];
  for (let i = 0; i < 52; i++) {
    let mx, my, tries = 0;
    do {
      mx = ri(R.x + 1, R.x + R.w - 2); my = ri(R.y + 1, R.y + R.h - 2);
    } while ((map[my][mx] !== T_FLOOR || dist(mx, my, ex, ey) < 6) && ++tries < 20);
    if (map[my][mx] !== T_FLOOR) continue;
    monsters.push(makeMonster(COW_TYPE, mx * TILE + TILE / 2, my * TILE + TILE / 2, scaleHp * (golden ? 1.3 : 1), scaleDmg, scaleXp * (golden ? 1.6 : 1), Math.random() < (golden ? 1 : 0.06), false, depth));
  }
  const boss = makeMonster(COW_KING, R.cx * TILE + TILE / 2, (R.y + 4) * TILE, scaleHp * (golden ? 1.8 : 1), scaleDmg * (golden ? 1.2 : 1), scaleXp * (golden ? 2 : 1), false, true, depth);
  monsters.push(boss);
  const shrines = [{ x: (R.cx + 4) * TILE + TILE / 2, y: R.cy * TILE + TILE / 2, kind: 'gem', used: false }];
  const chests = [{ x: (R.cx - 5) * TILE + TILE / 2, y: (R.cy - 3) * TILE + TILE / 2, opened: false }];
  return {
    map, rooms: [R], torches, monsters, boss, wp: null, shrines, chests, goldPiles: [],
    props, propSet,
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: false,
    entrance: { x: ex * TILE + TILE / 2, y: ey * TILE + TILE / 2 },
    exitTile: { x: ex - 2, y: ey },
  };
}
function enterCowLevel(golden) {
  const depth = Math.max(5, G.deepest || 5);
  G.dlvl = depth;                       // drives loot & damage scaling
  G.cowLevel = true;
  G.goldenPasture = !!golden;
  G.petLair = null;
  G.lvl = genCowLevel(depth, golden);
  G.projs = []; G.parts = []; G.texts = []; G.drops = []; G.rings = [];
  G.beams = []; G.meteors = []; G.clouds = []; G.onWp = false;
  G.minions = [];
  if (G.merc && G.merc.alive) G.minions.push(makeMercEntity());
  const actPet2 = G.p.pets && G.p.pets[G.p.activePet];
  G.pet = actPet2 ? spawnPet(actPet2) : null;
  const p = G.p;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null; p.strafeN = 0;
  G.world = 0;   // sunny Verdant Fields palette
  $('floorLabel').textContent = (G.goldenPasture ? 'The Gilded Pasture 🐮' : 'The Secret Pasture 🐄') + (G.p.hardcore ? ' ☠' : '');
  banner(G.goldenPasture ? 'MOO! The gilded herd glitters with menace…' : 'MOO?! The herd senses an intruder…');
  sfx.boss();
}

/* -------- beast lairs: an egg cracks open a one-beast arena -------- */
function genPetLair(spIdx, rarity, depth) {
  const map = []; for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(T_WALL));
  const R = { x: 15, y: 15, w: 22, h: 22, cx: 26, cy: 26 };
  for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) map[y][x] = T_FLOOR;
  // scattered boulders for cover
  for (let i = 0; i < 14; i++) {
    const x = ri(R.x + 2, R.x + R.w - 3), y = ri(R.y + 2, R.y + R.h - 3);
    if (Math.abs(x - R.cx) > 3 || Math.abs(y - R.cy) > 3) map[y][x] = T_WALL;
  }
  const ex = R.cx, ey = R.y + R.h - 2;   // entrance south, portal home beside it
  map[ey][ex] = T_FLOOR; map[ey][ex - 2] = T_DOWN;
  const torches = [];
  for (let i = 0; i < 10; i++) torches.push({ x: ri(R.x + 1, R.x + R.w - 2) * TILE + TILE / 2, y: ri(R.y + 1, R.y + R.h - 2) * TILE + TILE * 0.9 });
  // the beast: harder with rarity grade and species tier
  const spd = PET_SPECIES[spIdx];
  const rIdx = PET_RARITIES.indexOf(rarity);
  const ngm = 1 + (G && G.ng || 0) * 0.8;
  const eff = effDepth(depth);
  const scaleHp = (1 + 0.4 * (eff - 1) + 0.05 * (eff - 1) * (eff - 1)) * ngm;
  const scaleDmg = (1 + 0.22 * (eff - 1)) * ngm;
  const scaleXp = (1 + 0.3 * (eff - 1)) * ngm;
  const tier = 1 + (spd.world || 0) * 0.06 + (spd.whelp ? 0.7 : 0);
  const ranged = spd.form === 'drake' || spd.form === 'dragon' || spd.form === 'wisp';
  const wt = {
    id: 'wildpet', name: (spd.whelp ? '' : 'Wild ') + spd.name,
    hp: Math.round(150 * tier * [1, 1.5, 2.2, 3.2, 4.4][rIdx]),
    dmg: [Math.round(10 * tier * [1, 1.15, 1.35, 1.6, 1.9][rIdx]), Math.round(17 * tier * [1, 1.15, 1.35, 1.6, 1.9][rIdx])],
    spd: 118, r: spd.whelp ? 22 : 15, xp: Math.round(120 * tier), gold: [0, 0],
    atkCd: 1.0, range: ranged ? 240 : 38, ranged, minL: 1, w: 0, color: '#e8c14d',
  };
  const wm = makeMonster(wt, R.cx * TILE + TILE / 2, (R.y + 4) * TILE, scaleHp, scaleDmg, scaleXp, false, false, depth);
  wm.wild = { data: makePetData(spIdx, rarity) };
  wm.novaT = 0;
  return {
    map, rooms: [R], torches, monsters: [wm], boss: null, wp: null, shrines: [], chests: [], goldPiles: [],
    props: [], propSet: new Set(),
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: false,
    entrance: { x: ex * TILE + TILE / 2, y: ey * TILE + TILE / 2 },
    exitTile: { x: ex - 2, y: ey },
  };
}
function enterPetLair(item) {
  const eg = item.egg;
  const spd = PET_SPECIES[eg.sp];
  G.cowLevel = false; G.goldenPasture = false; G.rift = null;
  G.petLair = true;
  G.dlvl = Math.max(1, item.lvl);   // drives the beast's level scaling
  G.lvl = genPetLair(eg.sp, item.rarity, G.dlvl);
  G.projs = []; G.parts = []; G.texts = []; G.drops = []; G.rings = [];
  G.beams = []; G.meteors = []; G.clouds = []; G.onWp = false;
  G.minions = [];
  if (G.merc && G.merc.alive) G.minions.push(makeMercEntity());
  const actPet2 = G.p.pets && G.p.pets[G.p.activePet];
  G.pet = actPet2 ? spawnPet(actPet2) : null;
  const p = G.p;
  p.x = G.lvl.entrance.x; p.y = G.lvl.entrance.y;
  p.target = null; p.path = null; p.moveTo = null; p.strafeN = 0;
  G.world = Math.min(spd.world || 0, WORLDS.length - 1);   // the beast's home palette
  $('floorLabel').textContent = '🥚 Beast Lair · ' + spd.name + (G.p.hardcore ? ' ☠' : '');
  banner('🐣 The egg cracks — the ' + spd.name + '\'s lair opens! Subdue it to tame it.');
  sfx.boss();
}

/* -------- town: safe hub with merchant, waypoint and stairs down -------- */
function genTown() {
  const map = []; for (let y = 0; y < MAP_H; y++) map.push(new Array(MAP_W).fill(T_WALL));
  // a larger village green: gates north, services west & east, obelisk south
  const R = { x: 17, y: 17, w: 19, h: 15, cx: 26, cy: 24 };
  for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) map[y][x] = T_FLOOR;
  // a few old oaks shade the village green
  const props = [];
  for (const [ox, oy, v] of [[7, 6, 0], [12, 6, 1], [6, 12, 0], [12, 12, 0]]) {
    const tx2 = R.x + ox, ty2 = R.y + oy;
    map[ty2][tx2] = T_WALL;
    props.push({ tx: tx2, ty: ty2, x: tx2 * TILE + TILE / 2, y: ty2 * TILE + TILE * 0.75, w: 0, v });
  }
  const propSet = new Set(props.map(pr => pr.ty * MAP_W + pr.tx));
  map[R.cy][R.x + R.w - 2] = T_DOWN;
  map[R.cy][R.x + 2] = T_WP;
  map[R.y + R.h - 2][R.x + 1] = T_WALL;   // corner pillars (south only — gates line the north)
  map[R.y + R.h - 2][R.x + R.w - 2] = T_WALL;
  const torches = [];
  for (let y = R.y + 3; y < R.y + R.h - 1; y += 4) {   // side walls carry the torches
    torches.push({ x: (R.x - 1) * TILE + TILE / 2, y: y * TILE + TILE * 0.9 });
    torches.push({ x: (R.x + R.w) * TILE + TILE / 2, y: y * TILE + TILE * 0.9 });
  }
  const ilvl = Math.max(1, ((G && G.deepest) || 1) + (G && G.ng || 0) * 8);
  const shopStock = [];
  for (let i = 0; i < 4; i++) shopStock.push(makeItem(choice(SLOTS), ilvl, Math.random() < 0.15 ? 'rare' : 'magic'));
  return {
    map, rooms: [R], torches, monsters: [], boss: null, shrines: [], chests: [], goldPiles: [],
    props, propSet,
    wp: { x: (R.x + 2) * TILE + TILE / 2, y: R.cy * TILE + TILE / 2 },
    seen: new Uint8Array(MAP_W * MAP_H),
    locked: false,
    entrance: { x: R.cx * TILE + TILE / 2, y: (R.cy + 3) * TILE + TILE / 2 },
    exitTile: { x: R.x + R.w - 2, y: R.cy },
    vendor: { x: (R.x + 4) * TILE + TILE / 2, y: (R.y + 3) * TILE + TILE / 2 },
    stash: { x: (R.x + 9) * TILE + TILE / 2, y: (R.y + 3) * TILE + TILE / 2 },
    stable: { x: (R.x + 14) * TILE + TILE / 2, y: (R.y + 3) * TILE + TILE / 2 },
    obelisk: { x: (R.x + 4) * TILE + TILE / 2, y: (R.y + 10) * TILE + TILE / 2 },
    // world gates: first six realms along the north wall, the six
    // realms beyond along the south wall
    gates: Array.from({ length: WORLDS.length }, (_, i) => ({
      w: i,
      x: (R.x + 1.8 + (i % 6) * 3.1) * TILE,
      y: (i < 6 ? R.y : R.y + R.h) * TILE + TILE * 0.9,
    })),
    petStock: Array.from({ length: 3 }, () => makePetData(ri(0, 5), rollPetRarity())),
    npcs: [
      { id: 'elder', x: (R.x + 14) * TILE + TILE / 2, y: (R.y + 10) * TILE + TILE / 2 },
      { id: 'healer', x: (R.x + 2) * TILE + TILE / 2, y: (R.y + 4) * TILE + TILE / 2 },
    ],
    shopStock,
  };
}

/* ---------------- side quests ----------------
   Each world hides a stranded wanderer on its first floor with one
   themed favour to ask. Three archetypes: cull (slay monsters in this
   world), gems (hand over gems from your bag) and satchel (recover a
   lost pack from a deeper floor of the world). Quest state lives in
   G.quests[w] = { s: 'active'|'done'|'claimed', n: progress }. */
const QUESTS = [
  { npc: 'Farmer Odd', type: 'cull', count: 8, match: ['fallen'],
    ask: 'Imps trample my seedlings by night. Cull 8 of the little fiends and I\'ll dig up my savings.',
    thanks: 'The fields can breathe again. Take this — buried it under the turnips.' },
  { npc: 'Trapper Yll', type: 'gems', count: 2,
    ask: 'My hearth froze solid weeks ago. Two gems — any kind — would kindle it like nothing else.',
    thanks: 'Warmth at last! Everything I own that doesn\'t smell of pelts is yours.' },
  { npc: 'Smith Bora', type: 'satchel', floorOff: 2,
    ask: 'I fled the fire-brutes and dropped my tool satchel two floors down. Bring it back, please!',
    thanks: 'My hammers! You\'ve saved my trade. Here — I struck this while I waited.' },
  { npc: 'Gravedigger Pim', type: 'cull', count: 10, match: ['skel', 'archer', 'zombie', 'ghoul'],
    ask: 'The dead won\'t stay put — 10 of them back in the ground, and I\'ll pay you a digger\'s bonus.',
    thanks: 'Quietest the plains have been in years. This came out of a very fancy grave.' },
  { npc: 'Pearl-diver Nerin', type: 'gems', count: 3,
    ask: 'The current stole my catch. Three gems would square my debts with the guild — I\'d trade richly.',
    thanks: 'The guild is paid! Take my finest find — the sea gives back to those who give.' },
  { npc: 'Spore-witch Fen', type: 'satchel', floorOff: 2,
    ask: 'My reagent satchel sprouted legs — the mushrooms take things, you know. It\'s two floors below.',
    thanks: 'Ooh, still fizzing. A trade, then: one wonder for another.' },
  { npc: 'Caravan-master Sul', type: 'cull', count: 12, match: null,
    ask: 'Nothing crosses these sands while that pack hunts. Thin them by a dozen and name your price.',
    thanks: 'The caravans roll again. Sul pays his debts — every coin, every time.' },
  { npc: 'Gem-cutter Vex', type: 'gems', count: 2, quality: 2,
    ask: 'I only work Flawless stones. Bring me two and I\'ll part with a masterpiece.',
    thanks: 'Magnificent facets… Yes, yes — the masterpiece is yours. We\'re both richer for it.' },
  { npc: 'Herbalist Mave', type: 'satchel', floorOff: 3,
    ask: 'My herb satchel is somewhere below, half-swallowed by the gardens. They bite, so do hurry.',
    thanks: 'Unchewed! Mostly. You\'ve earned the rarest cutting I ever pressed.' },
  { npc: 'The Lost Cartographer', type: 'cull', count: 15, match: null,
    ask: 'I map the void and the void objects. Silence 15 of its residents so I can finish my survey.',
    thanks: 'The chart is complete… and it says you deserve this. Maps never lie.' },
  { npc: 'Skyship Captain Lorra', type: 'satchel', floorOff: 2,
    ask: 'A harpy gale tore my chart satchel off the deck — it landed on an isle two floors below. My whole trade route is in there!',
    thanks: 'The charts, dry and whole! Take this — salvage from a wreck no other soul will ever reach.' },
  { npc: 'Tinker Juno', type: 'cull', count: 12, match: ['scrapbot', 'sentinel', 'warbot'],
    ask: 'The machines turned on their makers an age ago. Scrap a dozen of them and I\'ll open my private vault to you.',
    thanks: 'Twelve heaps of quiet scrap — music to a tinker\'s ears. The vault is yours.' },
];
function questState(w) { return (G.quests || {})[w] || null; }
function questReward(w) {
  const p = G.p, ilvl = 5 * (w + 1);
  const gold = 150 * (w + 1) + ri(0, 100);
  p.gold += gold;
  const r = Math.random();
  const it = makeItem(choice(SLOTS), ilvl, r < 0.15 ? 'exotic' : r < 0.4 ? 'unique' : r < 0.7 ? 'set' : 'rare');
  const items = [it];
  if (w >= 3) items.push(makeCharm(ilvl));
  for (const item of items) {
    if (p.inv.length < p.bagSlots) p.inv.push(item);
    else G.drops.push({ kind: 'item', item, x: p.x + rand(-20, 20), y: p.y + 30 });
  }
  recalc();
  banner('🎁 +' + gold + 'g · ' + it.name + (items[1] ? ' · ' + items[1].name : ''));
  sfx.epic();
}
/* gems in the bag that satisfy a quest's requirement */
function questGems(q) {
  return G.p.inv.filter(i => i.g && (q.quality === undefined || gemQ(i) >= q.quality));
}

/* ---------------- town folk ---------------- */
const ELDER_LINES = [
  'The gates to the north answer only to conquest. Fell a realm\'s tyrant, and the next realm opens.',
  'Two matching gems seated in full sockets may whisper a runeword. The old smiths knew dozens.',
  'Charms work their magic from inside your bag — but they hoard the space you\'d keep loot in.',
  'Fuse three lesser gems and they become one, finer. The merchant taught me that trick, for a fee.',
  'The tyrants below sometimes carry a bovine sigil. Use it here in town. Don\'t ask what I saw.',
  'The violet obelisk tears open rifts. Beat the sand-clock and the next tier will open to you.',
  'Feed your mercenary good steel and mail. He fights harder than he haggles.',
  'Champions burn, freeze, storm and drink blood. Read their glow before you charge in.',
  'Ranks make a skill mighty; passives make the hero. Spend your points, child.',
  'Sister Amara mends wounds for nothing. Her blessings, though, cost coin — the light runs a ledger.',
  'I once knew a hero who hoarded every potion. The graveyard lists them alphabetically.',
  'They say the deepest gate leads back to the beginning, only crueler. NG+, the scholars call it.',
  'Stranded wanderers camp on the first floor of every realm. Help them — they pay better than the merchant.',
  'Past the void the world turns strange: isles adrift in open sky, and above them a bastion of chrome where the machines still march.',
  'Every realm hides its own wonder — fae rings, singing crystals, graves best left alone. Touch what glitters, but keep a potion ready.',
  'If you spy a little golden thief, drop everything and give chase. Its sack holds a season\'s plunder — and it knows the way out.',
  'Wild beasts still roam the realms that birthed them. Best the creature without killing its spirit, and it may follow you home.',
];

/* ---------------- shared town stash ---------------- */
/* ---------------- bestiary ----------------
   A shared, permanent record of every species ever tamed (any hero,
   any slot) and the best rarity grade it was caught at. */
const BESTIARY_KEY = 'sanctuary_bestiary';
function loadBestiary() { try { return JSON.parse(localStorage.getItem(BESTIARY_KEY)) || {}; } catch (e) { return {}; } }
/* completion rewards: 15 tamed awakens the Beastmaster's Bond, all 30
   crowns you Lord of Beasts. Shared by every hero, like the record. */
const bestiaryTierOf = n => n >= PET_SPECIES.length ? 2 : n >= 15 ? 1 : 0;
let bestiaryTier = bestiaryTierOf(Object.keys(loadBestiary()).length);
const bestiaryMult = () => bestiaryTier >= 2 ? 1.3 : bestiaryTier >= 1 ? 1.15 : 1;
const stablePrice = pet => Math.round(pet.price * (bestiaryTier >= 1 ? 0.75 : 1));
function recordBestiary(pd) {
  try {
    const b = loadBestiary();
    const rIdx = PET_RARITIES.indexOf(pd.rarity);
    if (b[pd.sp] === undefined || b[pd.sp] < rIdx) {
      b[pd.sp] = rIdx;
      localStorage.setItem(BESTIARY_KEY, JSON.stringify(b));
      const tier = bestiaryTierOf(Object.keys(b).length);
      if (tier > bestiaryTier) {
        bestiaryTier = tier;
        setTimeout(() => {
          banner(tier >= 2
            ? '👑 All ' + PET_SPECIES.length + ' beasts tamed — LORD OF BEASTS! Your companions strike +30% harder and wear the crown.'
            : '🏅 15 beasts tamed — Beastmaster\'s Bond! Pets & minions +15% damage · stable prices −25%.');
          sfx.epic();
        }, 2200);
      }
    }
  } catch (e) { }
}

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
  const swift = G && G.p.challenge === 'swift' ? 1.25 : 1;   // Swift Death challenge
  return {
    affix, stormT: rand(1, 3),
    type: t, x, y, r: t.r * (champ ? 1.25 : 1),
    hp, maxHp: hp,
    dmg: [Math.round(t.dmg[0] * sd * swift * (champ ? 1.5 : 1)), Math.round(t.dmg[1] * sd * swift * (champ ? 1.5 : 1))],
    spd: t.spd * swift * rand(0.9, 1.1), xp: Math.round(t.xp * sx * (champ ? 2.5 : 1)),
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
    const mf = 1 + ((G.d ? G.d.mf : 0) + (G.lvl && G.lvl.curse && G.lvl.curse.mf || 0)) / 100;
    const r = Math.random();
    rarity = r < 0.006 * mf ? 'exotic' : r < 0.02 * mf ? 'unique' : r < 0.035 * mf ? 'set'
      : r < 0.13 * mf ? 'rare' : r < 0.43 * mf ? 'magic' : 'common';
  }
  if (rarity === 'set') {
    const pool = Object.keys(SETS).filter(k => SETS[k].pieces[slot]);
    const sid = choice(pool);
    const def = SETS[sid];
    // set pieces roll a grade of their own: higher grades multiply the
    // piece's stats while set membership & bonuses stay identical
    const gr = Math.random();
    const gIdx = gr < 0.04 ? 4 : gr < 0.12 ? 3 : gr < 0.3 ? 2 : gr < 0.6 ? 1 : 0;
    const grade = ['common', 'magic', 'rare', 'unique', 'exotic'][gIdx];
    const mult = [1, 1.25, 1.55, 1.95, 2.5][gIdx];
    const mods = {};
    for (const k in def.pieceMods) mods[k] = Math.max(1, Math.round(def.pieceMods[k] * mult));
    const it = {
      slot, set: sid, grade,
      base: def.pieces[slot],
      name: ['', 'Fine ', 'Exalted ', 'Mythic ', 'Celestial '][gIdx] + def.pieces[slot],
      icon: slot === 'weapon' ? choice(WEAPON_ICONS[clsId]) : SLOT_ICONS[slot],
      rarity: 'set', lvl: ilvl, mods,
    };
    if (slot === 'weapon') it.dmg = [Math.round((2 + ilvl * 2) * mult), Math.round((5 + ilvl * 3) * mult)];
    else if (slot !== 'ring' && slot !== 'amulet') it.armor = Math.round((3 + ilvl * 2.5) * mult);
    if ((slot === 'weapon' || slot === 'helm' || slot === 'armor') && Math.random() < 0.25) { it.sockets = 1; it.gems = []; }
    return it;
  }
  if (rarity === 'unique') {
    const pool = UNIQUES.filter(u => u.slot === slot);
    if (pool.length) {
      const u = choice(pool);
      const it = { slot, base: u.name, name: u.name, icon: slot === 'weapon' ? choice(WEAPON_ICONS[clsId]) : SLOT_ICONS[slot], rarity: 'unique', lvl: ilvl, mods: { ...u.mods } };
      if (slot === 'weapon') { it.dmg = [3 + ilvl * 2, 6 + ilvl * 3]; it.sockets = 1; it.gems = []; }
      else if (slot !== 'ring' && slot !== 'amulet') {
        it.armor = 4 + ilvl * 3;
        if (Math.random() < 0.2) { it.sockets = 1; it.gems = []; }
      }
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
/* ---------------- realm relics ----------------
   Each world hoards exactly one signature unique that drops only
   there — a reason to return to every realm. mods: stat → [base, per-ilvl] */
const RELICS = [
  { name: 'Thornwing, the Verdant Edge', slot: 'weapon', mods: { poisonDmg: [5, 1.4], dmgPct: [10, 2.2], hp: [12, 2.5] } },
  { name: 'Isafrost Diadem', slot: 'helm', mods: { coldDmg: [4, 1.3], armor: [8, 2], mp: [10, 2.2] } },
  { name: 'Cindermaw Signet', slot: 'ring', mods: { fireDmg: [5, 1.4], dmgPct: [10, 2.2], str: [3, 0.6] } },
  { name: 'Ossuary Plate', slot: 'armor', mods: { armor: [10, 2.4], hp: [14, 2.8], leech: [3, 0.15] } },
  { name: 'Tide Pearl of the Abyss', slot: 'amulet', mods: { coldDmg: [4, 1.3], mp: [12, 2.4], mf: [12, 1.8] } },
  { name: 'Myceliar Treads', slot: 'boots', mods: { poisonDmg: [4, 1.3], dex: [3, 0.7], hp: [10, 2.2] } },
  { name: 'Simoom Windband', slot: 'ring', mods: { lightDmg: [5, 1.4], dex: [3, 0.7], mf: [10, 1.6] } },
  { name: 'Prismatrix Shard', slot: 'amulet', mods: { lightDmg: [5, 1.4], ene: [3, 0.7], mf: [12, 1.8] } },
  { name: 'Haemovore Carapace', slot: 'armor', mods: { leech: [4, 0.18], hp: [16, 3], str: [3, 0.7] } },
  { name: 'Nullscale Crown', slot: 'helm', mods: { lightDmg: [4, 1.3], ene: [4, 0.8], mf: [14, 2] } },
  { name: 'Zephyrax Talon', slot: 'weapon', mods: { lightDmg: [5, 1.5], dex: [4, 0.8], dmgPct: [12, 2.4] } },
  { name: 'Omega Core', slot: 'ring', mods: { fireDmg: [5, 1.4], armor: [10, 2.2], dmgPct: [10, 2.2] } },
];
function makeRelic(w, ilvl) {
  const rl = RELICS[w];
  const it = {
    slot: rl.slot, base: rl.name, name: rl.name,
    icon: rl.slot === 'weapon' ? choice(WEAPON_ICONS[G.p.cls]) : SLOT_ICONS[rl.slot],
    rarity: 'unique', lvl: ilvl, mods: {}, relic: w,
  };
  for (const k in rl.mods) {
    let v = Math.max(1, Math.round(rl.mods[k][0] + rl.mods[k][1] * ilvl));
    if (k === 'leech') v = Math.min(15, v);
    it.mods[k] = v;
  }
  if (rl.slot === 'weapon') { it.dmg = [4 + ilvl * 2, 8 + ilvl * 3]; it.sockets = 1; it.gems = []; }
  else if (rl.slot !== 'ring' && rl.slot !== 'amulet') { it.armor = 6 + ilvl * 3; it.sockets = 1; it.gems = []; }
  return it;
}

const sellPrice = it => ({ common: 8, magic: 25, rare: 70, unique: 200, set: 120, exotic: 320 }[it.rarity] + it.lvl * 6
  + (it.grade ? ['common', 'magic', 'rare', 'unique', 'exotic'].indexOf(it.grade) * 40 : 0));
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
  if (it.slot === 'charm') lines.push('Works from your bag');
  if (it.slot === 'sigil') {
    lines.push(it.golden ? 'It gleams — the herd beyond is champion-blooded' : 'It smells faintly of hay…');
    lines.push('Use in town to open a strange portal');
  }
  if (it.egg) {
    const sp = PET_SPECIES[it.egg.sp];
    lines.push('Holds a ' + (sp.whelp ? '⭐ ' : '') + sp.name + ' — ' + it.rarity + ' grade');
    lines.push(eggReady(it)
      ? '🐣 Ready to crack: opens the beast\'s lair'
      : '🕒 Incubating — hatches into a lair key in ' + fmtDur(it.egg.hatchAt - Date.now()));
    lines.push('Rarer eggs brood longer and hide fiercer beasts');
  }
  if (it.relic !== undefined) lines.push('★ Relic of ' + WORLDS[it.relic].name + ' — found only there');
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
function shadeMix(hex, f) {   // darken a #rrggbb by factor f (0..1)
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round((n >> 16 & 255) * f), g = Math.round((n >> 8 & 255) * f), b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
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
    p.skillPts = (p.skillPts || 0) + 1;
    recalc(); p.hp = G.d.maxHp; p.mp = G.d.maxMp;
    banner('LEVEL ' + p.level + '!  +5 stats · +1 skill point');
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
    case 'bandit': {   // a burst of gilded imps, scattering with the loot
      const eff = effDepth(G.dlvl), ngm = 1 + (G.ng || 0) * 0.8;
      const sh = (1 + 0.4 * (eff - 1) + 0.05 * (eff - 1) * (eff - 1)) * ngm;
      const sxp = (1 + 0.3 * (eff - 1)) * ngm;
      for (let k = 0; k < 4; k++) {
        const imp = makeMonster(TIMP_TYPE, s.x + rand(-46, 46), s.y + rand(-34, 34), sh, 1, sxp, false, false, G.dlvl);
        imp.aggro = true;
        imp.fleeT = 9 + k * 1.6;   // staggered escapes keep the panic going
        G.lvl.monsters.push(imp);
        spark(imp.x, imp.y - 8, '#ffd23a', 8, 190);
      }
      banner('💰 Bandit shrine — gilded imps scatter! Catch them!');
      sfx.epic();
      break;
    }
  }
  updateHUD(); saveDirty = true;
}

function openChest(ch) {
  const ilvl = Math.max(1, G.dlvl + (G.ng || 0) * 8);
  G.drops.push({ kind: 'gold', amt: Math.round(ri(20, 60) * (1 + G.dlvl * 0.3) * (1 + (G.ng || 0) * 0.6) * (ch.vault ? 1.8 : 1)), x: ch.x + rand(-18, 18), y: ch.y + 26 });
  const n = ri(1, 2) + (ch.vault ? 1 : 0);   // vault chests hold a little more
  for (let i = 0; i < n; i++) {
    G.drops.push({ kind: 'item', item: makeItem(choice(SLOTS), ilvl, Math.random() < (ch.vault ? 0.55 : 0.25) ? 'rare' : null), x: ch.x + rand(-24, 24), y: ch.y + rand(16, 32) });
  }
  if (Math.random() < (ch.vault ? 0.6 : 0.3)) G.drops.push({ kind: 'item', item: makeGem(ilvl), x: ch.x, y: ch.y + 36 });
  burst(ch.x, ch.y - 6, '#e8c14d', 14, 140);
  spark(ch.x, ch.y - 6, '#ffe9b0', 8, 160);
  sfx.gold();
  banner(ch.vault ? '💎 Vault treasure!' : 'Treasure!');
}

/* ---------------- world wonders ----------------
   Each realm hides its signature interactable — a touch of risk, reward
   or tactics so no two worlds farm the same:
   0 fae ring · 1 frozen adventurer · 2 lava geyser · 3 restless grave ·
   4 giant clam · 5 spore pod · 6 buried cache · 7 resonant crystal ·
   8 garden heart · 9 void tear pair · 10 zephyr shrine · 11 dormant turret */
const WONDER_NAMES = ['Fae Ring', 'Frozen Adventurer', 'Lava Geyser', 'Restless Grave',
  'Giant Clam', 'Spore Pod', 'Buried Cache', 'Resonant Crystal',
  'Heart of the Garden', 'Void Tear', 'Zephyr Shrine', 'Dormant Turret'];

function wonderAmbush(x, y, n) {
  const dlvl = G.dlvl, eff = effDepth(dlvl), ngm = 1 + (G.ng || 0) * 0.8;
  const sh = (1 + 0.4 * (eff - 1) + 0.05 * (eff - 1) * (eff - 1)) * ngm;
  const sd = (1 + 0.22 * (eff - 1)) * ngm, sx = (1 + 0.3 * (eff - 1)) * ngm;
  const pool = MTYPES.filter(t => t.minL <= dlvl && !t.flee && (t.wOnly === undefined || t.wOnly === worldOf(dlvl)));
  for (let k = 0; k < n; k++) {
    const mm = makeMonster(choice(pool), x + rand(-52, 52), y + rand(-40, 40), sh, sd, sx, false, false, dlvl);
    mm.aggro = true;
    G.lvl.monsters.push(mm);
    burst(mm.x, mm.y, '#3a3a3a', 8, 120);
  }
  shake(0.12); sfx.boss();
}

function wonderTreasure(x, y, items, gems) {
  const ilvl = Math.max(1, G.dlvl + (G.ng || 0) * 8), ngb = G.ng || 0;
  G.drops.push({ kind: 'gold', amt: Math.round(ri(25, 60) * (1 + G.dlvl * 0.3) * (1 + ngb * 0.6)), x: x + rand(-16, 16), y: y + 24 });
  for (let k = 0; k < items; k++)
    G.drops.push({ kind: 'item', item: makeItem(choice(SLOTS), ilvl, Math.random() < 0.3 ? 'rare' : null), x: x + rand(-26, 26), y: y + rand(14, 34) });
  if (Math.random() < gems) G.drops.push({ kind: 'item', item: makeGem(ilvl), x, y: y + 38 });
  burst(x, y - 6, '#e8c14d', 14, 150);
  spark(x, y - 6, '#ffe9b0', 10, 180);
  sfx.gold();
}

function triggerWonder(wo) {
  const p = G.p;
  wo.used = true;
  switch (wo.w) {
    case 0:   // fae ring: a blessing — unless the fae feel playful
      if (Math.random() < 0.25) {
        banner('Fae mischief! The ring was a trap!');
        wonderAmbush(wo.x, wo.y, 3);
      } else {
        G.buffSpd = 25;
        p.hp = Math.min(G.d.maxHp, p.hp + Math.round(G.d.maxHp * 0.2));
        banner('🧚 The fae bless your stride — +25% speed!');
        spark(wo.x, wo.y - 8, '#c86a8a', 18, 200); sfx.level();
      }
      break;
    case 1:   // frozen adventurer: thaw a past hero… or what took them
      burst(wo.x, wo.y - 10, '#cfe8f8', 18, 170);
      if (Math.random() < 0.35) {
        banner('The ice held more than a corpse!');
        wonderAmbush(wo.x, wo.y, 2);
      } else {
        banner('⛏ A fallen hero\'s pack, freed from the ice.');
        wonderTreasure(wo.x, wo.y, ri(1, 2), 0.4);
      }
      break;
    case 3:   // restless grave: grave goods or grave mistake
      burst(wo.x, wo.y, '#38303c', 14, 130);
      if (Math.random() < 0.45) {
        banner('The grave was not empty!');
        wonderAmbush(wo.x, wo.y, 3);
      } else {
        banner('⚰ Grave goods, unclaimed for centuries.');
        wonderTreasure(wo.x, wo.y, ri(1, 2), 0.5);
      }
      break;
    case 4:   // giant clam: a pearl of great price
      banner('🦪 The great clam yawns open…');
      if (Math.random() < 0.15) wonderAmbush(wo.x, wo.y, 2);
      else wonderTreasure(wo.x, wo.y, 1, 0.8);
      break;
    case 5: {   // spore pod: a poison chain reaction
      const dmg = m2 => Math.max(8, Math.round(m2.maxHp * (m2.boss ? 0.06 : 0.3)));
      for (const m2 of G.lvl.monsters)
        if (m2.hp > 0 && dist(wo.x, wo.y, m2.x, m2.y) < 130 + m2.r)
          hitMonster(m2, dmg(m2), { noCrit: true, noLeech: true, slow: 1 });
      burst(wo.x, wo.y - 6, '#6adfb8', 22, 180);
      G.rings.push({ x: wo.x, y: wo.y - 4, r: 10, max: 130, color: '#6adfb8', life: 0.35 });
      sfx.fire();
      // detonation leaps to nearby pods
      for (const other of G.lvl.wonders)
        if (other !== wo && !other.used && other.w === 5 && dist(wo.x, wo.y, other.x, other.y) < 190)
          triggerWonder(other);
      break;
    }
    case 7: {   // resonant crystal: a lightning discharge
      let struck = 0;
      for (const m2 of G.lvl.monsters)
        if (m2.hp > 0 && dist(wo.x, wo.y, m2.x, m2.y) < 180 + m2.r) {
          hitMonster(m2, Math.max(10, Math.round(m2.maxHp * (m2.boss ? 0.07 : 0.35))), { noCrit: true, noLeech: true, stun: 0.8 });
          spark(m2.x, m2.y - m2.r, '#ffd23a', 6, 200);
          struck++;
        }
      banner(struck ? '💎 The crystal sings — lightning arcs out!' : '💎 The crystal sings into the silence…');
      spark(wo.x, wo.y - 14, '#c28aff', 24, 260);
      G.rings.push({ x: wo.x, y: wo.y - 8, r: 12, max: 180, color: '#ffd23a', life: 0.3 });
      shake(0.15); sfx.fire();
      break;
    }
    case 8:   // heart of the garden: stolen life, returned
      p.hp = Math.min(G.d.maxHp, p.hp + Math.round(G.d.maxHp * 0.4));
      p.mp = Math.min(G.d.maxMp, p.mp + Math.round(G.d.maxMp * 0.4));
      banner('🫀 The garden\'s heart bursts — stolen life returns to you!');
      burst(wo.x, wo.y - 8, '#ff5a6a', 22, 190);
      burst(p.x, p.y - 10, '#ff8a7a', 12, 120);
      sfx.potion();
      break;
    case 9: {   // void tear: step through to its twin
      const twin = G.lvl.wonders[wo.twin];
      if (twin) {
        twin.used = true;
        spark(wo.x, wo.y - 10, '#8a9aff', 16, 220);
        p.x = twin.x; p.y = twin.y + 30;
        p.target = null; p.path = null; p.moveTo = null;
        spark(twin.x, twin.y - 10, '#8a9aff', 20, 240);
        G.rings.push({ x: twin.x, y: twin.y - 8, r: 6, max: 46, color: '#8a9aff', life: 0.35 });
        banner('🌀 The void folds — you step across the floor.');
        sfx.stairs();
      }
      break;
    }
    case 10: {   // zephyr shrine: the wind fights beside you
      G.buffSpd = 25;
      for (const m2 of G.lvl.monsters)
        if (m2.hp > 0 && dist(wo.x, wo.y, m2.x, m2.y) < 210 + m2.r)
          hitMonster(m2, Math.max(6, Math.round(m2.maxHp * (m2.boss ? 0.03 : 0.12))), { noCrit: true, noLeech: true, kb: 70, slow: 1.2 });
      banner('🌬 The zephyr answers — foes scatter, your steps quicken!');
      G.rings.push({ x: wo.x, y: wo.y - 8, r: 14, max: 210, color: '#bfe8ff', life: 0.4 });
      spark(wo.x, wo.y - 12, '#f6f9fd', 20, 260);
      sfx.level();
      break;
    }
    case 11:   // dormant turret: hack it to your side
      wo.on = 25; wo.zapT = 0;
      banner('🤖 Turret hacked — it fights for you!');
      spark(wo.x, wo.y - 16, '#4affd4', 16, 200);
      sfx.level();
      break;
  }
  updateHUD(); saveDirty = true;
}

function updateWonders(dt) {
  const p = G.p, ws = G.lvl.wonders || [];
  for (const wo of ws) {
    if (wo.w === 2) {   // lava geyser: an eternal, telegraphed cycle
      wo.t += dt;
      const ph = wo.t % 6;
      if (ph < 4.6) wo.blew = false;
      else if (!wo.blew) {
        wo.blew = true;
        spark(wo.x, wo.y - 10, '#ff8a3a', 22, 280);
        G.rings.push({ x: wo.x, y: wo.y - 4, r: 10, max: 78, color: '#ff8a3a', life: 0.3 });
        shake(0.1); sfx.fire();
        for (const m2 of G.lvl.monsters)
          if (m2.hp > 0 && dist(wo.x, wo.y, m2.x, m2.y) < 74 + m2.r)
            hitMonster(m2, Math.max(10, Math.round(m2.maxHp * (m2.boss ? 0.07 : 0.35))), { noCrit: true, noLeech: true });
        if (p.hp > 0 && dist(wo.x, wo.y, p.x, p.y) < 74)
          hurtPlayer(Math.round(G.d.maxHp * 0.22), G.dlvl);
      }
      continue;
    }
    if (wo.w === 11 && wo.on > 0) {   // hacked turret zaps the nearest foe
      wo.on -= dt;
      wo.zapT -= dt;
      if (wo.zapT <= 0) {
        const tgt = nearestMonster(wo.x, wo.y, 270);
        if (tgt && los(wo.x, wo.y, tgt.x, tgt.y)) {
          wo.zapT = 0.7;
          wo.zap = { x: tgt.x, y: tgt.y - tgt.r * 0.5, t: 0.12 };
          hitMonster(tgt, Math.max(6, Math.round(tgt.maxHp * (tgt.boss ? 0.02 : 0.12))), { noCrit: true, noLeech: true });
          spark(tgt.x, tgt.y - tgt.r, '#4affd4', 4, 160);
        } else wo.zapT = 0.25;
      }
      if (wo.zap) { wo.zap.t -= dt; if (wo.zap.t <= 0) wo.zap = null; }
      if (wo.on <= 0) { wo.on = 0; wo.zap = null; }
      continue;
    }
    if (wo.used) continue;
    const d2 = dist(p.x, p.y, wo.x, wo.y);
    if (wo.w === 6) {   // buried cache: hold your ground and dig
      if (d2 < 48) {
        wo.t += dt;
        if (Math.random() < dt * 9) burst(wo.x + rand(-12, 12), wo.y + rand(-4, 8), '#74603a', 1, 70);
        if (wo.t >= 2.2) {
          wo.used = true;
          banner('⛏ A buried cache of the old caravans!');
          wonderTreasure(wo.x, wo.y, 2, 0.5);
        }
      } else wo.t = Math.max(0, wo.t - dt * 2);
      continue;
    }
    if (d2 < 40 && p.hp > 0) triggerWonder(wo);
  }
}

function killMonster(m) {
  if (m.wild) {   // subdued, not slain: the wild beast yields and is tamed
    const p2 = G.p, data = m.wild.data;
    p2.pets = p2.pets || [];
    p2.pets.push(data);
    recordBestiary(data);
    p2.xp += Math.round(m.xp * 0.6);
    ftext(m.x, m.y - 26, '+' + Math.round(m.xp * 0.6) + ' xp', '#b8a4e8', 12);
    grantLevelUps();
    spark(m.x, m.y - 10, '#7adf6a', 26, 250);
    G.rings.push({ x: m.x, y: m.y - 8, r: 8, max: 58, color: '#7adf6a', life: 0.4 });
    banner('🐾 The ' + PET_SPECIES[data.sp].name + ' yields — tamed! (' + data.rarity + ') It waits at the town stable.');
    sfx.level();
    updateHUD(); saveDirty = true;
    return;
  }
  burst(m.x, m.y, m.type.color, 16, 160);
  burst(m.x, m.y, '#3a3a3a', 8, 80);
  spark(m.x, m.y, m.type.color, m.boss ? 30 : 7, m.boss ? 300 : 180);
  if (m.boss) shake(0.4);
  // xp
  const p = G.p;
  p.xp += m.xp;
  ftext(m.x, m.y - 26, '+' + m.xp + ' xp', '#b8a4e8', 12);
  grantLevelUps();
  if (m.type.flee) {   // the gilded imp's hoard bursts open
    const ilvl = Math.max(1, G.dlvl + (G.ng || 0) * 8), ngb = G.ng || 0;
    for (let k = 0; k < 5; k++)
      G.drops.push({ kind: 'gold', amt: Math.round(ri(15, 35) * (1 + G.dlvl * 0.3) * (1 + ngb * 0.6)), x: m.x + rand(-42, 42), y: m.y + rand(-30, 30) });
    for (let k = 0; k < 3; k++) {
      const r3 = Math.random();
      G.drops.push({
        kind: 'item',
        item: makeItem(choice(SLOTS), ilvl, r3 < 0.08 ? 'exotic' : r3 < 0.3 ? 'unique' : r3 < 0.55 ? 'set' : 'rare'),
        x: m.x + rand(-40, 40), y: m.y + rand(-20, 36),
      });
    }
    if (Math.random() < 0.5) G.drops.push({ kind: 'item', item: makeGem(ilvl), x: m.x, y: m.y + 30 });
    spark(m.x, m.y, '#ffd23a', 28, 300);
    G.rings.push({ x: m.x, y: m.y, r: 8, max: 60, color: '#ffd23a', life: 0.35 });
    banner('💰 The Gilded Imp bursts into treasure!');
    sfx.epic();
  } else dropLoot(m);
  if (m.affix === 'fire') {   // fire-enchanted champions explode on death
    for (let k = 0; k < 8; k++) shoot(m.x, m.y, k / 8 * Math.PI * 2, 260, Math.round(m.dmg[1] * 0.9), 'm', { kind: 'fireball', r: 5 });
    G.rings.push({ x: m.x, y: m.y, r: 6, max: 62, color: '#ff8a3a', life: 0.25 });
    sfx.fire();
  } else if (G.lvl.curse && G.lvl.curse.boom && !m.boss && !m.type.flee) {
    // the Unstable curse: every corpse detonates
    for (let k = 0; k < 6; k++) shoot(m.x, m.y, k / 6 * Math.PI * 2 + Math.random() * 0.5, 220, Math.max(1, Math.round(m.dmg[1] * 0.6)), 'm', { kind: 'fireball', r: 4 });
    G.rings.push({ x: m.x, y: m.y, r: 5, max: 46, color: '#b86adf', life: 0.2 });
  }
  if (m.type.id === 'cow' || m.type.id === 'cowking') sfx.moo();
  // side quest: cull progress counts only on the quest's own world floors
  if (!G.rift && !G.cowLevel && !G.petLair && G.quests) {
    const w = worldOf(G.dlvl), q = QUESTS[w], st = G.quests[w];
    if (q && q.type === 'cull' && st && st.s === 'active' && (!q.match || q.match.includes(m.type.id))) {
      st.n = (st.n || 0) + 1;
      if (st.n >= q.count) { st.s = 'done'; banner('✔ Quest complete — return to ' + q.npc + '!'); sfx.level(); }
      else ftext(m.x, m.y - 40, st.n + ' / ' + q.count, '#e8d45a', 12);
      saveDirty = true;
    }
  }
  if (G.rift && !G.rift.done) {
    if (m.type.id === 'riftguardian') {
      riftComplete(m);
    } else {
      G.rift.kills++;
      if (!G.rift.guardian && G.rift.kills >= G.rift.need) spawnRiftGuardian();
    }
  }
  if (m.boss) {
    G.lvl.locked = false;
    banner(m.type.id === 'cowking' ? 'The Cow King is slain! The herd falls silent…' : m.name + ' has fallen! The stairs open…');
    sfx.boss();
    // conquering a world's boss opens the next world's gate in town
    if (m.type.id === 'dragon' && !G.rift && !G.cowLevel && worldFloor(G.dlvl) === 25) {
      const w = worldOf(G.dlvl);
      G.conquered = G.conquered || [];
      if (!G.conquered.includes(w)) {
        G.conquered.push(w);
        if (w < WORLDS.length - 1) {
          setTimeout(() => { if (G) { banner('🏳 ' + WORLDS[w].name + ' conquered — the ' + WORLDS[w + 1].name + ' gate opens!'); sfx.level(); } }, 2600);
        }
      }
    }
    if (m.final) showVictory(m.name);
  }
  saveDirty = true;
}

function showVictory(bossName) {
  const p = G.p;
  let extra = '';
  const ch = challengeOf(p.challenge);
  if (ch) {
    const isNew = !loadBadges().some(b => b.challenge === ch.id);
    addBadge({ challenge: ch.id, cls: p.cls, level: p.level, hardcore: !!p.hardcore, t: Date.now() });
    extra = isNew ? ' 🏆 The ' + ch.name + ' trophy is yours forever!' : '';
  }
  const slain = (bossName || 'Malgoroth').split(',')[0];
  $('victoryInfo').textContent =
    slain.charAt(0) + slain.slice(1).toLowerCase() + ' is no more. ' + CLASSES[p.cls].name + ' of level ' + p.level +
    (G.ng ? ', conqueror of NG+' + G.ng : '') + ' — Sanctuary is saved… for now.' + extra;
  $('victoryScreen').classList.remove('hidden');
  saveGame();
}
function newGamePlus() {
  G.ng = (G.ng || 0) + 1;
  G.waypoints = [];
  G.deepest = 1;
  G.conquered = [];   // the gates seal again — reconquer the worlds
  G.quests = {};      // and the wanderers need help all over again
  const p = G.p;
  recalc(); p.hp = G.d.maxHp; p.mp = G.d.maxMp;
  $('victoryScreen').classList.add('hidden');
  enterLevel(0, true);
  banner('NEW GAME+' + G.ng + ' — the abyss deepens…');
  sfx.boss();
}

function dropLoot(m) {
  const x = m.x, y = m.y, dlvl = G.dlvl;
  const cr = (G.lvl && G.lvl.curse) || {};   // cursed floors pay better
  const scatter = () => ({ x: x + rand(-22, 22), y: y + rand(-22, 22) });
  const rGold = m.boss ? 1 : 0.62, rItem = (m.boss ? 1 : (m.champ ? 0.55 : 0.17)) * (cr.item || 1);
  const rPot = G.p.challenge === 'ascetic' ? 0 : m.boss ? 1 : 0.16;   // Ascetic: no potions, ever
  const ngb = (G.ng || 0);
  if (Math.random() < rGold) {
    const amt = Math.round(ri(m.gold[0], m.gold[1]) * (1 + dlvl * 0.25) * (1 + ngb * 0.6) * (cr.gold || 1));
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
  const isCow = m.type.id === 'cow';
  if (Math.random() < (m.boss ? 0.8 : isCow ? (G.goldenPasture ? 0.4 : 0.18) : 0.06)) G.drops.push({ kind: 'item', item: makeGem(Math.max(1, dlvl + ngb * 8)), ...scatter() });
  if (Math.random() < (m.boss ? 0.35 : 0.04)) G.drops.push({ kind: 'item', item: makeCharm(Math.max(1, dlvl + ngb * 8)), ...scatter() });
  if (m.boss && m.type.id !== 'cowking' && Math.random() < 0.2)
    G.drops.push({ kind: 'item', item: makeSigil(dlvl), ...scatter() });
  // realm relics: rare, and only from the world that hoards them
  if (!G.rift && !G.cowLevel && !G.petLair && dlvl > 0 && !m.type.flee) {
    const rRelic = m.boss ? 0.08 : m.champ ? 0.012 : 0.0018;
    if (Math.random() < rRelic)
      G.drops.push({ kind: 'item', item: makeRelic(worldOf(dlvl), Math.max(1, dlvl + ngb * 8)), ...scatter() });
  }
  // pet eggs: living keys to the beast lairs of this realm. Tyrants lay
  // whelp eggs of themselves; mini-bosses sometimes do; rarer foes lay
  // rarer (and slower, meaner) eggs
  if (!G.rift && !G.cowLevel && !G.petLair && dlvl > 0 && !m.type.flee && !m.wild) {
    const isTyrant = m.type.id === 'dragon';
    const rEgg = isTyrant ? 0.75 : m.boss ? 0.14 : m.champ ? 0.02 : 0.002;
    if (Math.random() < rEgg) {
      const w = worldOf(dlvl);
      const whelp = isTyrant ? Math.random() < 0.55 : m.boss ? Math.random() < 0.12 : false;
      const spIdx = whelp ? 18 + w : 6 + w;
      const r3 = Math.random();
      const rarity = isTyrant ? (r3 < 0.25 ? 'exotic' : r3 < 0.65 ? 'unique' : 'rare')
        : m.boss ? (r3 < 0.05 ? 'exotic' : r3 < 0.2 ? 'unique' : r3 < 0.55 ? 'rare' : 'magic')
          : rollPetRarity();
      G.drops.push({ kind: 'item', item: makeEgg(spIdx, rarity, dlvl), ...scatter() });
    }
  }
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
    if (p.hardcore) {
      // death is final: the hero joins the graveyard and the save is erased
      G.hardcoreDead = true;
      addGrave({ cls: p.cls, level: p.level, dlvl: G.dlvl, ng: G.ng || 0, t: Date.now() });
      localStorage.removeItem(SLOT_KEY(G.slot || 0));
      $('deathInfo').textContent = 'Death is final for hardcore heroes. ' +
        CLASSES[p.cls].name + ' of level ' + p.level + ' fell on floor ' + G.dlvl +
        (G.ng ? ' in NG+' + G.ng : '') + ', never to rise again.';
      $('btnRespawn').textContent = '⚰ Rest in the Graveyard';
    } else {
      const lost = Math.floor(p.gold * 0.1);
      p.gold -= lost;
      $('deathInfo').textContent = (lost > 0 ? 'The darkness claims ' + lost + ' gold. ' : '') + 'Your body lies on floor ' + G.dlvl + '.';
      $('btnRespawn').textContent = 'Rise Again';
      saveDirty = true; saveGame();
    }
    $('deathScreen').classList.remove('hidden');
    sfx.die();
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
  const atk = Math.round(playerAtk() * skillMult(p, i));
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
function autoSocketSwap(it) {
  // a picked-up gem replaces the weakest embedded gem of the SAME type,
  // so runewords stay intact while their gems improve
  if (!G.autoEquip || !it.g) return null;
  const p = G.p;
  let host = null, gi = -1, low = it.v;
  for (const s of SLOTS) {
    const eq2 = p.equip[s];
    if (!eq2 || !eq2.gems) continue;
    for (let k2 = 0; k2 < eq2.gems.length; k2++) {
      if (eq2.gems[k2].g === it.g && eq2.gems[k2].v < low) { low = eq2.gems[k2].v; host = eq2; gi = k2; }
    }
  }
  if (!host) return null;
  const old = host.gems[gi];
  host.gems[gi] = { g: it.g, v: it.v };
  recalc();
  return old;
}

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
      const swappedGem = it.g ? autoSocketSwap(it) : null;
      if (swappedGem) {
        // weaker gem comes back out into the bag (or onto the floor)
        const oldItem = { slot: 'gem', g: swappedGem.g, v: swappedGem.v, icon: GEMS[swappedGem.g].icon, rarity: 'common', mods: {}, name: GEMS[swappedGem.g].name, base: 'gem', lvl: it.lvl };
        if (p.inv.length < p.bagSlots) p.inv.push(oldItem);
        else G.drops.push({ kind: 'item', item: oldItem, x: dr.x + rand(-10, 10), y: dr.y + rand(-10, 10) });
        ftext(dr.x, dr.y - 12, '⬆ ' + it.name + ' socketed!', GEMS[it.g].color, 13);
        spark(p.x, p.y - 10, GEMS[it.g].color, 8, 140);
        G.drops.splice(i, 1); sfx.pickup(); saveDirty = true; updateHUD();
      } else if (G.autoEquip && !it.g && SLOTS.includes(it.slot) && itemScore(it) > itemScore(p.equip[it.slot])) {
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
      } else if (G.autoSell > 0 && !it.g && it.slot !== 'charm' && !(it.sockets >= 2) &&
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
        if (it.slot === 'charm') recalc();
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
function findFetchTarget(x, y, needLos) {
  // nearest drop or unopened chest, leashed to the hero's surroundings;
  // ground-bound helpers only chase what they can actually walk at
  const p = G.p;
  let best = null, bd = 1e9;
  for (const dr of G.drops) {
    if (dr.kind === 'item' && p.inv.length >= p.bagSlots) continue;   // don't hover over unpickable items
    if (dist(p.x, p.y, dr.x, dr.y) > 280) continue;
    const d = dist(x, y, dr.x, dr.y);
    if (d < bd && (!needLos || los(x, y, dr.x, dr.y))) { bd = d; best = dr; }
  }
  for (const ch of G.lvl.chests || []) {
    if (ch.opened) continue;
    if (dist(p.x, p.y, ch.x, ch.y) > 280) continue;
    const d = dist(x, y, ch.x, ch.y);
    if (d < bd && (!needLos || los(x, y, ch.x, ch.y))) { bd = d; best = ch; }
  }
  return best;
}
function blinkToMaster(e, flying, force) {
  // helpers that fall out of sight (or get wedged on walls) teleport back
  const p = G.p;
  if (!force && dist(e.x, e.y, p.x, p.y) < 460) return false;
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
  const mult = (1 + G.d.ene * 0.008) * (G.d.minionMult || 1);
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
/* ---------------- mercenary: a hireling with weapon & armor slots ------- */
const MERC_HIRE_COST = 500;
const mercReviveCost = () => 50 + G.p.level * 10;
function mercStats() {
  const lvl = G.p.level, w = G.merc.weapon, a = G.merc.armor;
  const base = w && w.dmg ? w.dmg : [2 + lvl, 5 + Math.round(lvl * 1.8)];
  const mult = 1 + lvl * 0.04;
  return {
    hp: Math.round(70 + lvl * 16 + (a && a.armor ? a.armor * 2.5 : 0)),
    dmg: [Math.round(base[0] * mult), Math.round(base[1] * mult)],
  };
}
function makeMercEntity() {
  const p = G.p, st = mercStats();
  return {
    isMinion: true, kind: 'merc',
    x: p.x + rand(-30, 30), y: p.y + rand(-24, 24),
    hp: st.hp, maxHp: st.hp, dmg: st.dmg,
    spd: 160, r: 13, range: 32, atkCd: 0.8,
    atkT: rand(0, 0.4), dir: 0, swingT: 0, hurtT: 0,
    off: { x: rand(-32, 32), y: rand(-24, 24) },
  };
}
/* refresh the live merc entity after gear or level changes */
function refreshMercEntity() {
  const mi = G.minions.find(m => m.kind === 'merc');
  if (!mi || !G.merc) return;
  const st = mercStats();
  const ratio = mi.hp / mi.maxHp;
  mi.maxHp = st.hp; mi.hp = Math.max(1, Math.round(st.hp * ratio));
  mi.dmg = st.dmg;
}

function spawnPet(data) {
  const p = G.p;
  const sp = PET_SPECIES[data.sp];
  return { isPet: true, kind: sp.form || sp.id, data, x: p.x + rand(-30, 30), y: p.y + 20, dir: 0, atkT: 0, swingT: 0 };
}
function hurtMinion(mi, dmg) {
  mi.hp -= dmg; mi.hurtT = 0.15;
  ftext(mi.x, mi.y - mi.r - 6, '-' + Math.round(dmg), '#9aa8b8', 11);
}
function minionDmg(mi) {
  let d = ri(mi.dmg[0], mi.dmg[1]) * bestiaryMult();
  return Math.round(d);
}

function updateMinions(dt) {
  const p = G.p;
  for (let i = G.minions.length - 1; i >= 0; i--) {
    const mi = G.minions[i];
    if (mi.hp <= 0) {
      burst(mi.x, mi.y, '#cfc9b8', 12, 130);
      if (mi.kind === 'merc') {
        if (G.merc) G.merc.alive = false;
        banner('Your mercenary has fallen! Revive them at the merchant.');
        sfx.die(); saveDirty = true;
      } else {
        ftext(mi.x, mi.y - 14, mi.kind === 'golem' ? 'Golem crumbles' : 'Skeleton falls', '#9aa8b8', 11);
      }
      G.minions.splice(i, 1);
      continue;
    }
    if (mi.kind === 'merc') mi.hp = Math.min(mi.maxHp, mi.hp + (2 + G.p.level * 0.2) * dt);
    mi.atkT -= dt;
    mi.swingT = Math.max(0, mi.swingT - dt);
    mi.hurtT = Math.max(0, mi.hurtT - dt);
    // wedged against a wall for too long → blink to the master
    if ((mi.stuckT || 0) > 0.8) {
      mi.stuckT = 0;
      blinkToMaster(mi, false, true);
      continue;
    }
    // tracked movement: pushing into a wall accumulates stuck-time
    const track = a => {
      const ox = mi.x, oy = mi.y;
      moveCircle(mi, Math.cos(a) * mi.spd * dt, Math.sin(a) * mi.spd * dt);
      mi.stuckT = dist(ox, oy, mi.x, mi.y) < mi.spd * dt * 0.25 ? (mi.stuckT || 0) + dt : 0;
    };
    // find a monster near the master — only ones this minion can see
    let best = null, bd = 1e9;
    for (const m of G.lvl.monsters) {
      if (m.hp <= 0) continue;
      if (dist(p.x, p.y, m.x, m.y) > 340) continue;   // leash to the master
      const dd = dist(mi.x, mi.y, m.x, m.y);
      if (dd < bd && los(mi.x, mi.y, m.x, m.y)) { bd = dd; best = m; }
    }
    if (best) {
      mi.dir = Math.atan2(best.y - mi.y, best.x - mi.x);
      if (bd < best.r + mi.range) {
        mi.stuckT = 0;
        if (mi.atkT <= 0) {
          mi.atkT = mi.atkCd; mi.swingT = 0.2;
          hitMonster(best, minionDmg(mi), { noCrit: true, noLeech: true });
        }
      } else track(mi.dir);
    } else {
      if (blinkToMaster(mi, false)) continue;
      // idle skeletons haul loot and pry open chests
      const fetch = findFetchTarget(mi.x, mi.y, true);
      if (fetch) {
        const a = Math.atan2(fetch.y - mi.y, fetch.x - mi.x);
        mi.dir = a;
        track(a);
        collectDropsAt(mi.x, mi.y);
        tryOpenChests(mi.x, mi.y, 32);
        continue;
      }
      const fx = p.x - Math.cos(p.dir) * 40 + mi.off.x, fy = p.y - Math.sin(p.dir) * 24 + mi.off.y;
      if (dist(mi.x, mi.y, fx, fy) > 30) {
        const a = Math.atan2(fy - mi.y, fx - mi.x);
        mi.dir = a;
        track(a);
      } else mi.stuckT = 0;
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

/* town pets amble around the green: pick a spot, wander over, ponder */
function updateTownPets(dt) {
  const R = G.lvl.rooms && G.lvl.rooms[0];
  if (!R) return;
  for (const tp of G.townPets || []) {
    tp.wt -= dt;
    if (tp.wt <= 0) {
      tp.wt = rand(2.5, 7);
      tp.tx = (R.x + 1.5 + Math.random() * (R.w - 3)) * TILE;
      tp.ty = (R.y + 1.5 + Math.random() * (R.h - 3)) * TILE;
    }
    if (tp.tx) {
      const d2 = dist(tp.x, tp.y, tp.tx, tp.ty);
      if (d2 > 8) {
        const a = Math.atan2(tp.ty - tp.y, tp.tx - tp.x);
        tp.dir = a;
        moveCircle(tp, Math.cos(a) * 65 * dt, Math.sin(a) * 65 * dt);
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
  // wedged ground pets blink back to the hero
  if (!flying && (pet.stuckT || 0) > 0.8) {
    pet.stuckT = 0;
    blinkToMaster(pet, false, true);
    return;
  }
  const groundMove = (a, mv) => {
    const ox = pet.x, oy = pet.y;
    moveCircle(pet, Math.cos(a) * mv, Math.sin(a) * mv);
    pet.stuckT = dist(ox, oy, pet.x, pet.y) < mv * 0.25 ? (pet.stuckT || 0) + dt : 0;
  };
  // nearest monster near the hero (ground pets only chase what they can see)
  let best = null, bd = isRanged ? 240 : 150;
  for (const m of G.lvl.monsters) {
    if (m.hp <= 0 || !m.aggro) continue;
    if (dist(p.x, p.y, m.x, m.y) > 300) continue;
    const dd = dist(pet.x, pet.y, m.x, m.y);
    if (dd < bd && (flying || los(pet.x, pet.y, m.x, m.y))) { bd = dd; best = m; }
  }
  if (best) {
    pet.dir = Math.atan2(best.y - pet.y, best.x - pet.x);
    const atkRange = isRanged ? 190 : best.r + 22;
    if (bd < atkRange) {
      if (pet.atkT <= 0) {
        pet.atkT = 1.15; pet.swingT = 0.2;
        const dmg = Math.max(1, Math.round(playerAtk() * def.dmgMult * (1 + 0.15 * rIdx) * bestiaryMult()));
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
      else groundMove(pet.dir, mv);
    } else pet.stuckT = 0;
  } else {
    if (blinkToMaster(pet, flying)) return;
    // no enemies: fetch loot and crack open chests for the master
    const fetch = findFetchTarget(pet.x, pet.y, !flying);
    if (fetch) {
      const a = Math.atan2(fetch.y - pet.y, fetch.x - pet.x);
      pet.dir = a;
      const dd2 = dist(pet.x, pet.y, fetch.x, fetch.y);
      const mv = Math.min(spd * dt, dd2);
      if (flying) { pet.x += Math.cos(a) * mv; pet.y += Math.sin(a) * mv; }
      else groundMove(a, mv);
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
      else groundMove(a, mv);
    } else pet.stuckT = 0;
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
  if (p.challenge === 'ascetic') { ftext(p.x, p.y - 30, 'The Ascetic drinks nothing', '#c9b98a', 12); return; }
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
  G.cowLevel = false; G.goldenPasture = false;
  G.rift = null;
  G.petLair = null;
  if (dlvl !== 0) G.anchor = null;   // entering a floor by stairs/waypoint burns the portal anchor
  G.dlvl = dlvl;
  G.deepest = Math.max(G.deepest || 1, dlvl);
  G.lvl = dlvl === 0 ? genTown() : genLevel(dlvl);
  G.projs = []; G.parts = []; G.texts = []; G.drops = []; G.rings = [];
  G.beams = []; G.meteors = []; G.clouds = []; G.onWp = false;
  G.minions = [];
  if (G.merc && G.merc.alive) G.minions.push(makeMercEntity());
  const actPet = G.p.pets && G.p.pets[G.p.activePet];
  G.pet = actPet ? spawnPet(actPet) : null;
  // in town the rest of the menagerie roams the green instead of
  // standing frozen at the stable
  G.townPets = [];
  if (dlvl === 0 && G.p.pets) {
    G.townPets = G.p.pets
      .filter((_, i) => i !== G.p.activePet)
      .slice(0, 8)
      .map(d => {
        const sp = PET_SPECIES[d.sp];
        return {
          isPet: true, townPet: true, kind: sp.form || sp.id, data: d, r: 10,
          x: G.lvl.stable.x + rand(-70, 70), y: G.lvl.stable.y + rand(20, 80),
          dir: rand(0, 6.28), atkT: 0, swingT: 0, wt: rand(0.5, 2), tx: 0, ty: 0,
        };
      });
  }
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
    const wf = worldFloor(dlvl);
    $('floorLabel').textContent = tierName + ' · ' + wf + '/25' + (G.ng ? ' · NG+' + G.ng : '');
    banner(wf === 25 ? tierName + '  ⚠ THE TYRANT OF THIS REALM AWAITS ⚠'
      : wf % 5 === 0 ? tierName + ' — ' + wf + '/25  ⚠ a great evil stirs…'
        : tierName + ' — Floor ' + wf + '/25');
    if (wf % 5 === 0) sfx.boss(); else sfx.stairs();
    if (G.lvl.curse) {   // announce the curse once the floor banner clears
      $('floorLabel').textContent += ' · ☠' + G.lvl.curse.name;
      const cur = G.lvl;
      setTimeout(() => {
        if (G && G.lvl === cur) { banner('☠ Cursed floor — ' + cur.curse.name + ': ' + cur.curse.desc); sfx.boss(); }
      }, 2400);
    }
    if (G.blessPending) {   // Amara's blessing kicks in past the gate
      G.buffDmg = G.buffArmor = G.blessPending;
      G.blessPending = 0;
      spark(p.x, p.y - 10, '#ffd76a', 20, 200);
      ftext(p.x, p.y - 34, '✨ blessed', '#ffd76a', 13);
    }
  }
  if (G.p.hardcore) $('floorLabel').textContent += ' ☠';
  const ch = challengeOf(G.p.challenge);
  if (ch) $('floorLabel').textContent += ' ' + ch.icon;
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
  if (!G || G.hardcoreDead) return;   // a dead hardcore hero must stay dead
  try {
    const p = G.p;
    localStorage.setItem(SLOT_KEY(G.slot || 0), JSON.stringify({
      v: 1, cls: p.cls, level: p.level, xp: p.xp, statPts: p.statPts, gold: p.gold,
      skillPts: p.skillPts || 0, skillLvls: p.skillLvls, passives: p.passives,
      hardcore: p.hardcore || false, challenge: p.challenge || null,
      stats: p.stats, equip: p.equip, inv: p.inv, potions: p.potions,
      hp: p.hp, mp: p.mp, dlvl: G.dlvl, deaths: p.deaths, soundOn, musicOn,
      waypoints: G.waypoints, deepest: G.deepest,
      autoPot: G.autoPot, autoSkill: G.autoSkill, ng: G.ng || 0,
      autoEquip: G.autoEquip, autoSell: G.autoSell, portalFloor: G.portalFloor || 0,
      bagSlots: p.bagSlots || 24, merc: G.merc || null,
      maxRiftTier: G.maxRiftTier || 1, riftBest: G.riftBest || {},
      conquered: G.conquered || [], blessPending: G.blessPending || 0,
      quests: G.quests || {},
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
      // pre-skill-point saves get one point per level already earned
      skillPts: save.skillPts !== undefined ? save.skillPts : Math.max(0, save.level - 1),
      skillLvls: save.skillLvls || [1, 1, 1, 1],
      passives: save.passives || [0, 0],
      hardcore: !!save.hardcore,
      challenge: save.challenge || null,
      pets: save.pets || (STARTER_PET[clsId] >= 0 ? [makePetData(STARTER_PET[clsId], 'common')] : []),
      activePet: save.pets ? (save.activePet !== undefined ? save.activePet : -1)
        : (STARTER_PET[clsId] >= 0 ? 0 : -1),
    });
    soundOn = save.soundOn !== false;
    musicOn = save.musicOn !== false;
  } else {
    p.hardcore = hardcoreNext;
    p.challenge = challengeNext;
    if (p.challenge === 'ascetic') p.potions = { hp: 0, mp: 0 };
  }
  for (const pd of p.pets || []) recordBestiary(pd);   // back-fill the bestiary
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
    merc: (save && save.merc) || null,
    maxRiftTier: (save && save.maxRiftTier) || 1,
    riftBest: (save && save.riftBest) || {},
    // worlds grew from 5 to 25 floors: keep only conquests the hero's
    // depth can still justify, and re-infer the rest
    conquered: save ? Array.from(new Set([
      ...(save.conquered || []).filter(w => (save.deepest || 1) >= 25 * (w + 1)),
      ...inferConquered(save.deepest || 1),
    ])) : [],
    blessPending: (save && save.blessPending) || 0,
    quests: (save && save.quests) || {},
    anchor: null, offPortal: true,
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

  // rift clock
  if (G.rift && !G.rift.done) {
    G.rift.t -= dt; G.rift.elapsed += dt;
    if (G.rift.t <= 0) {
      enterLevel(0, false);
      banner('The rift collapses — too slow!');
      sfx.die();
      return;
    }
  }

  // shrines & treasure chests
  for (const s of G.lvl.shrines || []) {
    if (!s.used && dist(p.x, p.y, s.x, s.y) < 36) { s.used = true; activateShrine(s); }
  }
  tryOpenChests(p.x, p.y, 40);
  updateWonders(dt);

  // a cracked wall crumbles if you linger beside it
  const ck = G.lvl.crack;
  if (ck && !ck.open) {
    const wx = ck.tx * TILE + TILE / 2, wy = ck.ty * TILE + TILE / 2;
    if (dist(p.x, p.y, wx, wy) < 70) {
      ck.t += dt;
      if (Math.random() < dt * 7) burst(wx + rand(-14, 14), wy + rand(-8, 16), '#8a8078', 1, 60);
      if (ck.t >= 0.8) {
        ck.open = true;
        G.lvl.map[ck.ty][ck.tx] = T_FLOOR;
        burst(wx, wy, '#8a8078', 24, 180);
        burst(wx, wy, '#3a3230', 12, 90);
        shake(0.2);
        banner('🕳 A hidden vault crumbles open!');
        sfx.boss();
        saveDirty = true;
      }
    } else ck.t = 0;
  }

  // the lost quest satchel is picked up by walking over it
  const sq = G.lvl.satchel;
  if (sq && !sq.got && dist(p.x, p.y, sq.x, sq.y) < 36) {
    sq.got = true;
    const w = worldOf(G.dlvl), st = questState(w);
    if (st && st.s === 'active') {
      st.s = 'done';
      banner('🎒 Satchel recovered — return to ' + QUESTS[w].npc + '!');
      spark(sq.x, sq.y - 8, '#e8d45a', 16, 180);
      sfx.level(); saveDirty = true;
    }
  }

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
        shoot(p.x, p.y, a + rand(-0.03, 0.03), 520, Math.round(playerAtk() * 0.8 * skillMult(p, 3)), 'p', { kind: 'arrow', r: 4, ele: true, color: domEle(d) });
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
  const spd = 175 * (d.spdMult || 1) * (p.rageT > 0 ? 1.25 : 1) * (G.buffSpd > 0 ? 1.25 : 1) * (p.chillT > 0 ? 0.65 : 1);
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
            p.atkT = c.atkCd / (d.atkSpd || 1); p.swingT = 0.2;
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

  /* --- portals --- */
  if (G.dlvl === 0 && G.lvl.portal && G.anchor) {
    if (dist(p.x, p.y, G.lvl.portal.x, G.lvl.portal.y) < 26) { returnThroughPortal(); return; }
  }
  if (G.anchor && G.dlvl === G.anchor.dlvl && G.lvl === G.anchor.lvl) {
    const dp = dist(p.x, p.y, G.anchor.x, G.anchor.y);
    if (dp > 44) G.offPortal = true;
    else if (dp < 24 && G.offPortal) {
      // step back into your own portal → to town (same anchor kept)
      G.offPortal = false;
      spark(p.x, p.y, '#5ab0ff', 18, 200);
      sfx.stairs();
      const keep = G.anchor;
      enterLevel(0, false);
      G.anchor = keep;
      G.lvl.portal = { x: p.x + 54, y: p.y };
      return;
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
  const onUpStairs = tileAt(ptx, pty) === T_UP && G.dlvl > 0 && !G.rift && !G.cowLevel && !G.petLair;
  if (tileAt(ptx, pty) === T_DOWN) {
    if (G.lvl.locked) {
      if (!G.lockMsgT || G.time - G.lockMsgT > 3) { banner('The stairs are sealed — slay ' + (G.lvl.boss ? G.lvl.boss.name : 'the guardian') + '!'); G.lockMsgT = G.time; }
      p.moveTo = null; p.path = null;
      moveCircle(p, (p.x - (ptx * TILE + TILE / 2)) > 0 ? 3 : -3, 3);
    } else if (G.stairsHold) {
      // chose to stay: ease the hero off the stairs
      moveCircle(p, (p.x - (ptx * TILE + TILE / 2)) > 0 ? 3 : -3, 3);
    } else if (G.drops.length > 0) {
      G.stairsDir = 'down';
      togglePanel('stairsPanel');
    } else {
      enterLevel(G.cowLevel || G.rift || G.petLair ? 0 : G.dlvl + 1, false);
      return;
    }
  } else if (onUpStairs) {
    // stairs go both ways: climb back toward the surface
    if (G.stairsHold) {
      moveCircle(p, (p.x - (ptx * TILE + TILE / 2)) > 0 ? 3 : -3, 3);
    } else if (G.drops.length > 0) {
      G.stairsDir = 'up';
      togglePanel('stairsPanel');
    } else {
      enterLevel(G.dlvl - 1, false);
      return;
    }
  } else G.stairsHold = false;

  /* --- drop ceremony: fanfare when high-rarity loot hits the ground --- */
  for (const dr of G.drops) {
    if (dr.ann || dr.kind !== 'item') continue;
    dr.ann = true;
    const rr2 = dr.item.rarity;
    if (dr.item.g || rr2 === 'common' || rr2 === 'magic') continue;
    const col = rarityColor(rr2);
    G.rings.push({ x: dr.x, y: dr.y, r: 4, max: 46, color: col, life: 0.45 });
    spark(dr.x, dr.y - 6, col, rr2 === 'rare' ? 8 : 16, 200);
    if (rr2 === 'rare') sfx.rare(); else sfx.epic();
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
    // the gilded imp never fights: it bolts, dripping coins, and escapes
    if (m.type.flee) {
      if (!m.aggro) {
        if (dd < 320 && los(m.x, m.y, p.x, p.y)) {
          m.aggro = true; m.fleeT = 11;
          banner('💰 A Gilded Imp — catch it before it escapes!');
          sfx.gold();
        }
        continue;
      }
      m.fleeT -= dt;
      m.dripT = (m.dripT || 0) - dt;
      if (m.dripT <= 0) {   // a trail of dropped coins marks the chase
        m.dripT = 1.5;
        G.drops.push({ kind: 'gold', amt: Math.round(ri(4, 9) * (1 + G.dlvl * 0.25) * (1 + (G.ng || 0) * 0.6)), x: m.x + rand(-8, 8), y: m.y + rand(-8, 8) });
        spark(m.x, m.y - 8, '#ffd23a', 3, 130);
      }
      const away = Math.atan2(m.y - p.y, m.x - p.x) + Math.sin(G.time * 2.6 + m.x * 0.013) * 0.7;
      m.dir = away;
      moveCircle(m, Math.cos(away) * m.spd * dt, Math.sin(away) * m.spd * dt);
      if (m.fleeT <= 0) {   // gone through a pocket portal
        m.hp = 0;
        spark(m.x, m.y - 10, '#b86adf', 20, 240);
        G.rings.push({ x: m.x, y: m.y - 8, r: 6, max: 42, color: '#b86adf', life: 0.3 });
        banner('The Gilded Imp escapes through a portal…');
      }
      continue;
    }
    if (!m.aggro) {
      if (tdd < 265 && los(m.x, m.y, T.x, T.y)) {
        m.aggro = true;
        if (m.boss) { banner('⚔ ' + m.name + ' ⚔'); sfx.boss(); }
        else if (m.wild) { banner('🐾 A ' + m.name + ' (' + m.wild.data.rarity + ') — subdue it to tame it!'); sfx.boss(); }
      }
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
    // dragon breath: a fan of elemental bolts aimed at the hero
    if (m.dragon !== undefined && m.hp > 0) {
      m.breathT -= dt;
      if (m.breathT <= 0 && dd < 380 && los(m.x, m.y, p.x, p.y)) {
        m.breathT = 4.2;
        const eleC = ELE_COLORS[DRAGONS[m.dragon].ele];
        const aim = Math.atan2(p.y - m.y, p.x - m.x);
        for (let k = -3; k <= 3; k++)
          shoot(m.x, m.y - m.r * 0.4, aim + k * 0.13, 300, Math.round(m.dmg[0] * 0.75), 'm', { kind: 'fire', r: 5, color: eleC });
        spark(m.x + Math.cos(aim) * m.r, m.y - m.r * 0.4 + Math.sin(aim) * m.r, eleC, 12, 240);
        shake(0.12);
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
  if (G.dlvl === 0) updateTownPets(dt);
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

/* ---------------- per-world wall & floor painters ----------------
   Every world gets its own construction, not just a palette swap:
   fieldstone & ivy, ice blocks & icicles, basalt columns & lava seams,
   stacked bones & skulls, coral crust & kelp. All variation is driven
   by the deterministic tile hash so tiles never flicker. */
function drawWallTile(deco, px, py, tx, ty, h, pal) {
  const h2 = thash(tx * 7 + 3, ty * 11 + 5), h3 = thash(tx * 13 + 9, ty * 5 + 1);
  const floorBelow = tileAt(tx, ty + 1) >= T_FLOOR;
  if (deco === 'snow') {
    /* ---- ice blocks: glassy slabs, frost mortar, icicles ---- */
    const g = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
    g.addColorStop(0, '#8fb8d8'); g.addColorStop(0.5, '#6f9cc0'); g.addColorStop(1, '#54809f');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#2f5a78'; ctx.lineWidth = 2;
    for (let row = 0; row < 2; row++) {
      const ry = py + 2 + row * 21;
      ctx.beginPath(); ctx.moveTo(px, ry + 19); ctx.lineTo(px + TILE, ry + 19); ctx.stroke();
      const off = ((tx + ty * 3 + row) % 2) * 14 + 8;
      ctx.beginPath(); ctx.moveTo(px + off, ry); ctx.lineTo(px + off, ry + 19); ctx.stroke();
    }
    // diagonal glassy glints
    ctx.strokeStyle = '#dff2ffaa'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(px + 6 + h * 10, py + 30); ctx.lineTo(px + 20 + h * 10, py + 8); ctx.stroke();
    if (h2 > 0.5) { ctx.beginPath(); ctx.moveTo(px + 24 + h2 * 8, py + 36); ctx.lineTo(px + 36 + h2 * 6, py + 18); ctx.stroke(); }
    // snow cap
    ctx.fillStyle = '#e8f2fa';
    ctx.fillRect(px, py, TILE, 4.5);
    ctx.beginPath(); ctx.ellipse(px + TILE * h2, py + 4.5, 8, 2.5, 0, 0, 7); ctx.fill();
    // icicles hanging over the passage below
    if (floorBelow) {
      ctx.fillStyle = '#cfe8f8';
      for (let k = 0; k < 3; k++) {
        const ix = px + 6 + k * 14 + h3 * 6, len = 5 + thash(tx * 3 + k, ty) * 9;
        ctx.beginPath();
        ctx.moveTo(ix - 2.4, py + TILE - 1); ctx.lineTo(ix, py + TILE + len); ctx.lineTo(ix + 2.4, py + TILE - 1);
        ctx.closePath(); ctx.fill();
      }
    }
  } else if (deco === 'flowers') {
    /* ---- mossy fieldstone: rounded boulders and creeping ivy ---- */
    ctx.fillStyle = '#3a4430';
    ctx.fillRect(px, py, TILE, TILE);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const hh = thash(tx * 9 + col, ty * 9 + row);
      const sx = px + 7 + col * 15 + (row % 2) * 6, sy = py + 7 + row * 15;
      ctx.fillStyle = ['#5c6a4a', '#66755a', '#525f42'][Math.floor(hh * 3) % 3];
      ctx.beginPath(); ctx.ellipse(sx, sy, 8.5, 6.5, hh * 3, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffff14';
      ctx.beginPath(); ctx.ellipse(sx - 2, sy - 2, 4, 2.6, hh * 3, 0, 7); ctx.fill();
    }
    // moss patches
    if (h > 0.35) {
      ctx.fillStyle = '#4a7a3466';
      ctx.beginPath(); ctx.ellipse(px + TILE * h, py + TILE * h2, 9, 6, h * 4, 0, 7); ctx.fill();
    }
    // ivy trailing down the face
    if (h2 > 0.55) {
      ctx.strokeStyle = '#4a7a34'; ctx.lineWidth = 1.4;
      for (let k = 0; k < 2; k++) {
        const ix = px + 10 + k * 20 + h * 8;
        ctx.beginPath();
        ctx.moveTo(ix, py);
        ctx.quadraticCurveTo(ix + 4, py + 14, ix - 2, py + 24 + h3 * 14);
        ctx.stroke();
        ctx.fillStyle = '#5c8a44';
        ctx.beginPath(); ctx.ellipse(ix - 1, py + 12 + k * 8, 2.6, 1.8, 0.6, 0, 7); ctx.fill();
      }
    }
  } else if (deco === 'lava') {
    /* ---- basalt columns with glowing lava seams ---- */
    ctx.fillStyle = '#181210';
    ctx.fillRect(px, py, TILE, TILE);
    for (let col = 0; col < 4; col++) {
      const hh = thash(tx * 5 + col, ty * 7);
      const cxp = px + col * 11;
      const g = ctx.createLinearGradient(cxp, 0, cxp + 11, 0);
      g.addColorStop(0, '#120c0a'); g.addColorStop(0.5, ['#2c2220', '#342826', '#241c1a'][Math.floor(hh * 3) % 3]); g.addColorStop(1, '#0e0806');
      ctx.fillStyle = g;
      ctx.fillRect(cxp + 0.5, py, 10, TILE);
      // column cap line at varying height
      ctx.fillStyle = '#3c2e2a';
      ctx.fillRect(cxp + 1, py + 4 + hh * 10, 9, 2);
    }
    // molten seam glowing between columns
    if (h > 0.55) {
      const sx = px + 11 * (1 + Math.floor(h2 * 3));
      const g2 = ctx.createLinearGradient(sx - 3, 0, sx + 3, 0);
      g2.addColorStop(0, '#ff6a2a00'); g2.addColorStop(0.5, h > 0.85 ? '#ffb03add' : '#ff6a2a88'); g2.addColorStop(1, '#ff6a2a00');
      ctx.fillStyle = g2;
      ctx.fillRect(sx - 3, py + TILE * 0.2, 6, TILE * 0.8);
    }
    ctx.fillStyle = '#00000066';
    ctx.fillRect(px, py + TILE - 4, TILE, 4);
  } else if (deco === 'graves') {
    /* ---- catacomb walls: stacked bones with the odd staring skull ---- */
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.lineCap = 'round';
    for (let row = 0; row < 4; row++) {
      const hh = thash(tx * 11 + row, ty * 13);
      const ry = py + 6 + row * 11;
      ctx.strokeStyle = ['#a89e88', '#b8ab8f', '#968b76'][Math.floor(hh * 3) % 3];
      ctx.lineWidth = 5.5;
      const off = (row % 2) * 8 - 4 + hh * 4;
      ctx.beginPath(); ctx.moveTo(px + 5 + off, ry); ctx.lineTo(px + 18 + off, ry); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px + 25 + off, ry); ctx.lineTo(px + 38 + off, ry); ctx.stroke();
      // bone knobs
      ctx.fillStyle = '#c8bda4';
      ctx.beginPath(); ctx.arc(px + 5 + off, ry, 3.2, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(px + 18 + off, ry, 3.2, 0, 7); ctx.fill();
    }
    if (h > 0.82) {   // an embedded skull watches you
      const sx = px + 10 + h2 * 22, sy = py + 10 + h3 * 22;
      ctx.fillStyle = '#d8cdb4';
      ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 7); ctx.fill();
      ctx.fillRect(sx - 3.4, sy + 3.6, 6.8, 3);
      ctx.fillStyle = '#181018';
      ctx.fillRect(sx - 3.6, sy - 2, 2.6, 2.8); ctx.fillRect(sx + 1, sy - 2, 2.6, 2.8);
    }
    ctx.fillStyle = '#00000055';
    ctx.fillRect(px, py + TILE - 4, TILE, 4);
  } else if (deco === 'shells') {
    /* ---- drowned masonry crusted in coral, barnacles and kelp ---- */
    ctx.fillStyle = '#16333a';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#0a161a'; ctx.lineWidth = 1.6;
    for (let row = 0; row < 2; row++) {
      const ry = py + 1 + row * 21;
      ctx.beginPath(); ctx.moveTo(px, ry + 20); ctx.lineTo(px + TILE, ry + 20); ctx.stroke();
      const off = ((tx + ty + row) % 2) * 12 + 10;
      ctx.beginPath(); ctx.moveTo(px + off, ry); ctx.lineTo(px + off, ry + 20); ctx.stroke();
    }
    // coral clumps
    if (h > 0.3) {
      const cxp = px + 8 + h2 * 28, cyp = py + 8 + h3 * 28;
      ctx.fillStyle = h > 0.75 ? '#e87a6a' : '#3f7a70';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.arc(cxp + k * 5 - 5, cyp + (k % 2) * 4, 3.4 - k * 0.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#ffffff22';
      ctx.beginPath(); ctx.arc(cxp - 6, cyp - 1, 1.2, 0, 7); ctx.fill();
    }
    // barnacle dots
    ctx.fillStyle = '#7ac8bc55';
    ctx.beginPath(); ctx.arc(px + 6 + h * 30, py + 34 - h2 * 24, 2, 0, 7); ctx.fill();
    // kelp swaying down the face
    if (h2 > 0.6 && floorBelow) {
      ctx.strokeStyle = '#2e6a4a'; ctx.lineWidth = 2;
      const kx = px + 8 + h * 26;
      ctx.beginPath();
      ctx.moveTo(kx, py + 8);
      ctx.quadraticCurveTo(kx + 5, py + 24, kx - 2 + Math.sin(G.time * 1.6 + tx) * 2.5, py + TILE + 8);
      ctx.stroke();
    }
  } else if (deco === 'spores') {
    /* ---- damp stone shelved with fungus, dusted in glowing spores ---- */
    ctx.fillStyle = '#1a2824';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#0c1512'; ctx.lineWidth = 1.6;
    for (let row = 0; row < 2; row++) {
      const ry = py + 1 + row * 21;
      ctx.beginPath(); ctx.moveTo(px, ry + 20); ctx.lineTo(px + TILE, ry + 20); ctx.stroke();
      const off = ((tx + ty + row) % 2) * 13 + 9;
      ctx.beginPath(); ctx.moveTo(px + off, ry); ctx.lineTo(px + off, ry + 20); ctx.stroke();
    }
    // shelf fungi jutting from the face
    for (let k = 0; k < 2; k++) {
      const hh = thash(tx * 7 + k * 3, ty * 9 + k);
      if (hh < 0.4) continue;
      const fx = px + 6 + hh * 30, fy = py + 8 + thash(tx + k, ty * 3) * 28;
      ctx.fillStyle = ['#6a5a44', '#7a6a50'][k % 2];
      ctx.beginPath(); ctx.ellipse(fx, fy, 7, 3, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#4a3e30';
      ctx.fillRect(fx - 7, fy - 0.5, 14, 1.6);
    }
    // drifting spore glow
    if (h > 0.55) {
      ctx.fillStyle = hexA('#6adfb8', 0.35 + Math.sin(G.time * 1.8 + tx * 2 + ty) * 0.2);
      ctx.beginPath(); ctx.arc(px + 8 + h2 * 28, py + 8 + h3 * 28, 1.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(px + 30 - h3 * 20, py + 30 - h2 * 20, 1.3, 0, 7); ctx.fill();
    }
  } else if (deco === 'sand') {
    /* ---- layered sandstone strata, wind-carved ---- */
    const bands = ['#5c4c2c', '#6a5834', '#52442a', '#74603a'];
    for (let b = 0; b < 5; b++) {
      ctx.fillStyle = bands[(b + tx + ty) % 4];
      const by = py + b * 9;
      ctx.beginPath();
      ctx.moveTo(px, by + Math.sin(tx * 2 + b) * 2);
      ctx.quadraticCurveTo(px + TILE / 2, by + 3 + Math.sin(ty + b) * 2, px + TILE, by + Math.sin(tx * 2 + b + 1) * 2);
      ctx.lineTo(px + TILE, by + 12); ctx.lineTo(px, by + 12);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#00000033';
    ctx.fillRect(px, py + TILE - 5, TILE, 5);
    ctx.fillStyle = '#ffe9b022';
    ctx.fillRect(px, py, TILE, 4);
    if (h > 0.9) {   // wind-carved hollow
      ctx.fillStyle = '#3a2e18';
      ctx.beginPath(); ctx.ellipse(px + TILE * h2, py + TILE * 0.5, 6, 9, 0, 0, 7); ctx.fill();
    }
  } else if (deco === 'crystal') {
    /* ---- amethyst rock studded with glowing shards ---- */
    ctx.fillStyle = '#241c34';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#100c1a'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(px, py + TILE * h2); ctx.lineTo(px + TILE, py + TILE * h3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + TILE * h3, py); ctx.lineTo(px + TILE * h2, py + TILE); ctx.stroke();
    // protruding crystals catch the light
    const glow = 0.5 + Math.sin(G.time * 2 + tx * 3 + ty * 2) * 0.25;
    for (let k = 0; k < 2; k++) {
      const hh = thash(tx * 5 + k * 11, ty * 7 + k);
      if (hh < 0.35) continue;
      const cxp = px + 8 + hh * 28, cyp = py + 10 + thash(tx + k * 3, ty) * 24;
      ctx.fillStyle = hexA('#c28aff', k ? glow * 0.7 : glow);
      ctx.beginPath();
      ctx.moveTo(cxp, cyp - 9); ctx.lineTo(cxp + 4, cyp + 2); ctx.lineTo(cxp, cyp + 5); ctx.lineTo(cxp - 4, cyp + 2);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0e2ff';
      ctx.fillRect(cxp - 0.8, cyp - 6, 1.6, 6);
    }
  } else if (deco === 'veins') {
    /* ---- fleshy overgrowth crawling with dark veins ---- */
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, '#3e2026'); g.addColorStop(1, '#2c1418');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#1a0a0e'; ctx.lineWidth = 2.4;
    for (let k = 0; k < 3; k++) {
      const hh = thash(tx * 3 + k * 5, ty * 7 + k);
      ctx.beginPath();
      ctx.moveTo(px + hh * TILE, py);
      ctx.bezierCurveTo(px + hh * 30, py + 14, px + (1 - hh) * 30, py + 28, px + (1 - hh) * TILE, py + TILE);
      ctx.stroke();
    }
    // a throbbing vein highlight
    const pulse = 0.3 + Math.max(0, Math.sin(G.time * 2.6 + tx + ty * 2)) * 0.35;
    ctx.strokeStyle = hexA('#ff5a6a', pulse); ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(px + h2 * TILE, py);
    ctx.quadraticCurveTo(px + TILE / 2, py + TILE / 2, px + h3 * TILE, py + TILE);
    ctx.stroke();
    if (h > 0.88) {   // a blinking growth
      ctx.fillStyle = hexA('#ff8a9a', pulse + 0.2);
      ctx.beginPath(); ctx.arc(px + 10 + h2 * 24, py + 10 + h3 * 24, 3.4, 0, 7); ctx.fill();
    }
  } else if (deco === 'void') {
    /* ---- null slabs: black monoliths etched with drifting runes ---- */
    ctx.fillStyle = '#0e0e16';
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = hexA('#8a9aff', 0.28);
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 3.5, py + 3.5, TILE - 7, TILE - 7);
    // faint starfield inside the slab
    for (let k = 0; k < 3; k++) {
      const hh = thash(tx * 7 + k * 13, ty * 11 + k);
      ctx.fillStyle = hexA('#c8d2ff', 0.2 + hh * 0.5);
      ctx.fillRect(px + 5 + hh * 34, py + 5 + thash(tx + k, ty * 5) * 34, 1.4, 1.4);
    }
    // a slow rune glyph fading in and out
    if (h > 0.72) {
      const a = 0.25 + Math.max(0, Math.sin(G.time * 1.2 + h * 20)) * 0.45;
      ctx.strokeStyle = hexA('#8a9aff', a); ctx.lineWidth = 1.4;
      const rx = px + TILE / 2, ry = py + TILE / 2;
      ctx.beginPath();
      ctx.moveTo(rx - 5, ry + 6); ctx.lineTo(rx, ry - 7); ctx.lineTo(rx + 5, ry + 6);
      ctx.moveTo(rx - 3, ry + 1); ctx.lineTo(rx + 3, ry + 1);
      ctx.stroke();
    }
  } else if (deco === 'sky') {
    /* ---- sun-washed marble crowned with clinging cloud ---- */
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, '#f6f9fd'); g.addColorStop(1, '#c8d2e2');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#9aa4bc'; ctx.lineWidth = 1.4;
    for (let row = 0; row < 2; row++) {
      const ry = py + 1 + row * 21;
      ctx.beginPath(); ctx.moveTo(px, ry + 20); ctx.lineTo(px + TILE, ry + 20); ctx.stroke();
      const off = ((tx + ty + row) % 2) * 14 + 8;
      ctx.beginPath(); ctx.moveTo(px + off, ry); ctx.lineTo(px + off, ry + 20); ctx.stroke();
    }
    // gilded cap
    ctx.fillStyle = '#ffd76a';
    ctx.fillRect(px, py, TILE, 3.5);
    ctx.fillStyle = '#b8922e';
    ctx.fillRect(px, py + 3.5, TILE, 1.2);
    // sun glints in the polish
    if (h2 > 0.55) {
      ctx.strokeStyle = '#ffffffbb'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(px + 8 + h * 12, py + 30); ctx.lineTo(px + 20 + h * 12, py + 10); ctx.stroke();
    }
    // cloud wisps clinging to the foot of the wall
    if (floorBelow && h > 0.4) {
      ctx.fillStyle = '#ffffffcc';
      const dx2 = Math.sin(G.time * 0.7 + tx) * 3;
      ctx.beginPath(); ctx.ellipse(px + 12 + h2 * 18 + dx2, py + TILE - 2, 10, 4, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px + 26 + h3 * 10 + dx2, py + TILE + 1, 8, 3.4, 0, 0, 7); ctx.fill();
    }
  } else if (deco === 'tech') {
    /* ---- riveted alloy bulkheads threaded with neon conduit ---- */
    const g = ctx.createLinearGradient(px, py, px, py + TILE);
    g.addColorStop(0, '#454d5a'); g.addColorStop(0.5, '#343b46'); g.addColorStop(1, '#262c34');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#12151a'; ctx.lineWidth = 1.8;
    for (let row = 0; row < 2; row++) {
      const ry = py + 1 + row * 21;
      ctx.beginPath(); ctx.moveTo(px, ry + 20); ctx.lineTo(px + TILE, ry + 20); ctx.stroke();
      const off = ((tx + ty + row) % 2) * 16 + 6;
      ctx.beginPath(); ctx.moveTo(px + off, ry); ctx.lineTo(px + off, ry + 20); ctx.stroke();
    }
    // rivets at panel corners
    ctx.fillStyle = '#5a6472';
    for (const [rx, ry2] of [[5, 6], [TILE - 5, 6], [5, TILE - 6], [TILE - 5, TILE - 6]]) {
      ctx.beginPath(); ctx.arc(px + rx, py + ry2, 1.6, 0, 7); ctx.fill();
    }
    // a neon conduit runs down some panels
    if (h > 0.6) {
      const cxp = px + 8 + h2 * 28;
      const glow = 0.5 + Math.sin(G.time * 2.4 + tx * 2 + ty) * 0.3;
      ctx.strokeStyle = hexA('#4affd4', glow); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cxp, py + 2); ctx.lineTo(cxp, py + TILE - 2); ctx.stroke();
      ctx.strokeStyle = '#12151a'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cxp, py + 14); ctx.lineTo(cxp, py + 18); ctx.stroke();
    }
    // blinking status diode
    if (h2 > 0.8) {
      const on = Math.sin(G.time * 3 + tx * 5 + ty * 3) > 0;
      ctx.fillStyle = on ? '#ff5a3a' : '#4a1a12';
      ctx.beginPath(); ctx.arc(px + 8 + h3 * 26, py + 8 + h * 8, 1.8, 0, 7); ctx.fill();
    }
    // hazard chevrons along the base above walkways
    if (floorBelow) {
      ctx.fillStyle = '#e8c05a';
      ctx.fillRect(px, py + TILE - 5, TILE, 5);
      ctx.fillStyle = '#1a1408';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.moveTo(px + k * 12, py + TILE); ctx.lineTo(px + k * 12 + 5, py + TILE - 5);
        ctx.lineTo(px + k * 12 + 9, py + TILE - 5); ctx.lineTo(px + k * 12 + 4, py + TILE);
        ctx.closePath(); ctx.fill();
      }
    }
  } else {
    /* ---- classic brick (fallback) ---- */
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
  }
}

function drawFloorTile(deco, px, py, tx, ty, h, pal) {
  const h2 = thash(tx * 5 + 1, ty * 3 + 2), h3 = thash(tx * 17 + 5, ty * 7 + 11);
  if (deco === 'snow') {
    /* ---- packed snow with frozen-over patches ---- */
    ctx.fillStyle = ['#aebdca', '#b6c5d2', '#a6b5c2'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    // wind-blown drift shading
    ctx.fillStyle = '#8fa2b422';
    ctx.beginPath(); ctx.ellipse(px + TILE * h2, py + TILE * 0.6, 16, 6, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8f2fa66';
    ctx.beginPath(); ctx.ellipse(px + TILE * (1 - h2), py + TILE * h3, 10, 4, -0.2, 0, 7); ctx.fill();
    if (h > 0.62 && h < 0.8) {   // frozen pond patch with cracks
      ctx.fillStyle = '#7fb0d0';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 15, 11, h * 2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#dff2ff'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 12, py + 18 + h * 8);
      ctx.lineTo(px + 22, py + 22); ctx.lineTo(px + 33, py + 16 + h2 * 10);
      ctx.stroke();
    }
    // sparkle
    if (h3 > 0.9) { ctx.fillStyle = '#ffffffcc'; ctx.fillRect(px + h * 40, py + h2 * 40, 1.8, 1.8); }
    // footstep-sized shadow speckles
    ctx.fillStyle = '#8fa2b433';
    ctx.beginPath(); ctx.arc(px + 8 + h3 * 28, py + 8 + h * 28, 2.2, 0, 7); ctx.fill();
  } else if (deco === 'flowers') {
    /* ---- meadow grass ---- */
    ctx.fillStyle = ['#3d5a2e', '#446234', '#37522a'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    // mottled light/dark grass patches (no stone grid)
    ctx.fillStyle = '#2c421f55';
    ctx.beginPath(); ctx.ellipse(px + TILE * h2, py + TILE * h3, 13, 7, h * 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a7a4233';
    ctx.beginPath(); ctx.ellipse(px + TILE * (1 - h3), py + TILE * h2, 9, 5, h, 0, 7); ctx.fill();
    // grass blades
    ctx.strokeStyle = '#55743d'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const hh = thash(tx * 3 + k * 7, ty * 5 + k);
      const gx = px + 4 + hh * 36, gy = py + 6 + thash(tx + k, ty * 9 + k) * 32;
      ctx.beginPath(); ctx.moveTo(gx, gy + 4); ctx.quadraticCurveTo(gx + 1.5, gy, gx + (hh - 0.5) * 5, gy - 4); ctx.stroke();
    }
    // worn dirt path spots
    if (h < 0.08) {
      ctx.fillStyle = '#5a4a30';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 13, 8, h * 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a3c26';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2 + 3, py + TILE / 2 + 2, 7, 4, h * 20, 0, 7); ctx.fill();
    }
  } else if (deco === 'lava') {
    /* ---- charred basalt plates over living lava ---- */
    ctx.fillStyle = ['#2c2422', '#302826', '#282020'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    // irregular plate borders
    ctx.strokeStyle = '#100a08'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py + TILE * h2);
    ctx.lineTo(px + TILE * 0.4, py + TILE * h2 + (h - 0.5) * 8);
    ctx.lineTo(px + TILE, py + TILE * h3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + TILE * h3, py);
    ctx.lineTo(px + TILE * h3 + (h2 - 0.5) * 8, py + TILE * 0.5);
    ctx.lineTo(px + TILE * h2, py + TILE);
    ctx.stroke();
    // glowing lava seams in the cracks
    if (h > 0.7) {
      const glow = 0.55 + Math.sin(G.time * 2 + tx * 2 + ty) * 0.25;
      ctx.strokeStyle = hexA('#ff6a2a', glow); ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(px + 6 + h * 20, py + 8);
      ctx.lineTo(px + 14 + h2 * 16, py + 18 + h * 10);
      ctx.lineTo(px + 8 + h * 24, py + 32 + h2 * 8);
      ctx.stroke();
      if (h > 0.93) {   // open lava pool
        ctx.fillStyle = hexA('#ff8a3a', glow);
        ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 9, 6, h, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath(); ctx.ellipse(px + TILE / 2 - 2, py + TILE / 2 - 1, 3, 2, h, 0, 7); ctx.fill();
      }
    }
    ctx.fillStyle = '#00000030';
    ctx.beginPath(); ctx.ellipse(px + TILE * h3, py + TILE * h2, 8, 5, h * 3, 0, 7); ctx.fill();
  } else if (deco === 'graves') {
    /* ---- grave earth: turned soil, roots and remains ---- */
    ctx.fillStyle = ['#38303c', '#3e3542', '#332b38'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    // mounded soil ridges
    ctx.strokeStyle = '#241e2a'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 8 + h * 10);
    ctx.quadraticCurveTo(px + TILE / 2, py + 2 + h2 * 14, px + TILE - 2, py + 10 + h3 * 10);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px + 2, py + 26 + h2 * 8);
    ctx.quadraticCurveTo(px + TILE / 2, py + 22 + h3 * 12, px + TILE - 2, py + 28 + h * 8);
    ctx.stroke();
    ctx.fillStyle = '#4a4052';
    ctx.beginPath(); ctx.ellipse(px + TILE * h2, py + TILE * h3, 7, 4, h * 3, 0, 7); ctx.fill();
    // pale roots / clawed furrows
    if (h > 0.55 && h < 0.7) {
      ctx.strokeStyle = '#5a5264'; ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(px + 8 + k * 6, py + 12 + h * 12);
        ctx.lineTo(px + 12 + k * 6, py + 30 + h2 * 6);
        ctx.stroke();
      }
    }
    if (h < 0.04) {   // a half-buried ribcage
      ctx.strokeStyle = '#8a8070'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2 + k * 4 - 4, 8 - k, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      }
    }
  } else if (deco === 'shells') {
    /* ---- rippled wet sand with glinting puddles ---- */
    ctx.fillStyle = ['#25444c', '#294a52', '#214048'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    // sand ripples
    ctx.strokeStyle = '#1a333a'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      const ry = py + 8 + k * 13 + h * 5;
      ctx.beginPath();
      ctx.moveTo(px, ry);
      ctx.quadraticCurveTo(px + TILE * 0.3, ry - 4, px + TILE * 0.55, ry);
      ctx.quadraticCurveTo(px + TILE * 0.8, ry + 4, px + TILE, ry - 1);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3f6a7233'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py + 14 + h2 * 8);
    ctx.quadraticCurveTo(px + TILE / 2, py + 10 + h3 * 8, px + TILE, py + 15 + h * 6);
    ctx.stroke();
    if (h > 0.68 && h < 0.82) {   // still puddle catching the light
      ctx.fillStyle = '#3f7a8a88';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 13, 8, h, 0, 7); ctx.fill();
      ctx.fillStyle = hexA('#bfe8ff', 0.4 + Math.sin(G.time * 1.8 + tx * 3) * 0.2);
      ctx.beginPath(); ctx.ellipse(px + TILE / 2 - 4, py + TILE / 2 - 2, 4, 2, h, 0, 7); ctx.fill();
    }
    // drifting bubbles
    if (h3 > 0.93) {
      ctx.strokeStyle = '#bfe8ff66'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(px + h * 40, py + ((G.time * 6 + h2 * 44) % 44), 2, 0, 7); ctx.stroke();
    }
  } else if (deco === 'spores') {
    /* ---- mycelium beds threaded with glowing filaments ---- */
    ctx.fillStyle = ['#243430', '#283a34', '#20302c'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    // pale mycelium threads
    ctx.strokeStyle = '#8aa89a44'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px + h2 * TILE, py);
    ctx.quadraticCurveTo(px + TILE / 2, py + TILE * h3, px + h3 * TILE, py + TILE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px, py + h3 * TILE);
    ctx.quadraticCurveTo(px + TILE * h2, py + TILE / 2, px + TILE, py + h2 * TILE);
    ctx.stroke();
    if (h > 0.78) {   // glowing mushroom cluster
      const glow = 0.5 + Math.sin(G.time * 2.2 + tx + ty) * 0.2;
      for (let k = 0; k < 3; k++) {
        const mx = px + 14 + k * 7, my = py + 24 + (k % 2) * 5;
        ctx.strokeStyle = '#3a5248'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx, my - 6 - k); ctx.stroke();
        ctx.fillStyle = hexA('#6adfb8', glow);
        ctx.beginPath(); ctx.ellipse(mx, my - 7 - k, 3.5 - k * 0.5, 2.4, 0, Math.PI, 0); ctx.fill();
      }
    }
    ctx.fillStyle = '#00000028';
    ctx.beginPath(); ctx.ellipse(px + TILE * h3, py + TILE * h2, 9, 5, h, 0, 7); ctx.fill();
  } else if (deco === 'sand') {
    /* ---- rolling dune sand, sun-bleached bones beneath ---- */
    ctx.fillStyle = ['#5a4c30', '#625434', '#52442c'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#453a22'; ctx.lineWidth = 1.4;
    for (let k = 0; k < 3; k++) {   // diagonal wind ripples
      const off = k * 14 + h * 8;
      ctx.beginPath();
      ctx.moveTo(px + off - 8, py + TILE);
      ctx.quadraticCurveTo(px + off + 6, py + TILE / 2, px + off - 2, py);
      ctx.stroke();
    }
    ctx.fillStyle = '#74603a55';
    ctx.beginPath(); ctx.ellipse(px + TILE * h2, py + TILE * h3, 11, 5, 0.6, 0, 7); ctx.fill();
    if (h < 0.05) {   // bleached bones surfacing
      ctx.strokeStyle = '#c8bda4'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(px + 14, py + 24); ctx.lineTo(px + 26, py + 20); ctx.stroke();
      ctx.fillStyle = '#c8bda4';
      ctx.beginPath(); ctx.arc(px + 13, py + 24.5, 2.4, 0, 7); ctx.fill();
    }
  } else if (deco === 'crystal') {
    /* ---- polished cavern floor flecked with crystal ---- */
    ctx.fillStyle = ['#2e2440', '#332948', '#2a203a'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#100c1a66'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, py + TILE * h2); ctx.lineTo(px + TILE, py + TILE * h3); ctx.stroke();
    if (h > 0.8) {   // embedded shard cluster
      const glow = 0.4 + Math.sin(G.time * 2 + tx * 2 + ty * 3) * 0.2;
      ctx.fillStyle = hexA('#c28aff', glow);
      const cxp = px + TILE / 2, cyp = py + TILE / 2;
      ctx.beginPath();
      ctx.moveTo(cxp, cyp - 6); ctx.lineTo(cxp + 3.4, cyp + 2); ctx.lineTo(cxp - 3.4, cyp + 2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cxp + 6, cyp - 2); ctx.lineTo(cxp + 8.5, cyp + 4); ctx.lineTo(cxp + 3.5, cyp + 4);
      ctx.closePath(); ctx.fill();
    }
    if (h3 > 0.9) { ctx.fillStyle = '#f0e2ff88'; ctx.fillRect(px + h * 40, py + h2 * 40, 1.6, 1.6); }
  } else if (deco === 'veins') {
    /* ---- garden of flesh: tendrils weaving through dark loam ---- */
    ctx.fillStyle = ['#3c1e22', '#422226', '#361a1e'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#26090e'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, py + h2 * TILE);
    ctx.bezierCurveTo(px + 14, py + h3 * 30, px + 30, py + (1 - h2) * 30, px + TILE, py + h3 * TILE);
    ctx.stroke();
    if (h > 0.74) {   // pulsing tendril
      const pulse = 0.3 + Math.max(0, Math.sin(G.time * 2.6 + tx * 2 + ty)) * 0.35;
      ctx.strokeStyle = hexA('#ff5a6a', pulse); ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(px + h3 * TILE, py);
      ctx.quadraticCurveTo(px + TILE / 2, py + TILE * h2, px + h2 * TILE, py + TILE);
      ctx.stroke();
    }
    if (h < 0.05) {   // bulbous seed pod
      ctx.fillStyle = '#5a2830';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 7, 5.5, h * 9, 0, 7); ctx.fill();
      ctx.fillStyle = hexA('#ff8a9a', 0.4 + Math.max(0, Math.sin(G.time * 2 + tx)) * 0.3);
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 2.2, 0, 7); ctx.fill();
    }
  } else if (deco === 'void') {
    /* ---- void glass: a floor of near-nothing and cold stars ---- */
    ctx.fillStyle = ['#14141e', '#181824', '#10101a'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#8a9aff18'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    for (let k = 0; k < 3; k++) {   // starlight beneath the glass
      const hh = thash(tx * 9 + k * 5, ty * 13 + k);
      ctx.fillStyle = hexA('#c8d2ff', 0.15 + hh * 0.55);
      ctx.fillRect(px + 3 + hh * 38, py + 3 + thash(tx + k * 2, ty * 7) * 38, 1.3, 1.3);
    }
    if (h > 0.86) {   // a drifting violet mote
      const my = (G.time * 5 + h * 44) % 44;
      ctx.fillStyle = hexA('#8a9aff', 0.6);
      ctx.beginPath(); ctx.arc(px + h2 * 40, py + 44 - my, 1.6, 0, 7); ctx.fill();
    }
    if (h < 0.03) {   // hairline fracture in reality
      ctx.strokeStyle = hexA('#8a9aff', 0.5); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 30);
      ctx.lineTo(px + 18, py + 22); ctx.lineTo(px + 24, py + 26); ctx.lineTo(px + 36, py + 14);
      ctx.stroke();
    }
  } else if (deco === 'sky') {
    /* ---- cloudstone: pale sky-slabs with drifting wisps ---- */
    ctx.fillStyle = ['#a8c2d8', '#b0cade', '#9fbad2'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#8a94ac55'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    // soft cloud shadows sliding over the stone
    ctx.fillStyle = '#ffffff44';
    const dx2 = Math.sin(G.time * 0.5 + tx * 0.7) * 4;
    ctx.beginPath(); ctx.ellipse(px + TILE * h2 + dx2, py + TILE * h3, 12, 5, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a94b433';
    ctx.beginPath(); ctx.ellipse(px + TILE * (1 - h3), py + TILE * h2, 9, 4, -0.2, 0, 7); ctx.fill();
    if (h > 0.62 && h < 0.74) {   // gilded inlay in the slab
      ctx.strokeStyle = '#ffd76a88'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(px + TILE / 2, py + TILE / 2, 9, 0, 7); ctx.stroke();
    }
    if (h < 0.04) {   // a gap of open sky between the slabs
      ctx.fillStyle = '#4a7ab0';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + TILE / 2, 12, 8, h * 20, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffffaa';
      ctx.beginPath(); ctx.ellipse(px + TILE / 2 - 3 + Math.sin(G.time * 0.8 + tx) * 3, py + TILE / 2 + 1, 5, 1.8, 0, 0, 7); ctx.fill();
    }
    if (h3 > 0.93) { ctx.fillStyle = '#fff2c8'; ctx.fillRect(px + h * 40, py + h2 * 40, 1.8, 1.8); }
  } else if (deco === 'tech') {
    /* ---- deck plating: brushed alloy, rivets and live conduits ---- */
    ctx.fillStyle = ['#232830', '#282d36', '#1e232b'][Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = '#12151a'; ctx.lineWidth = 1.2;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    // brushed sheen
    ctx.fillStyle = '#ffffff08';
    ctx.fillRect(px, py + 4 + h2 * 8, TILE, 3);
    // corner rivets
    ctx.fillStyle = '#454d5a';
    for (const [rx, ry2] of [[4, 4], [TILE - 4, 4], [4, TILE - 4], [TILE - 4, TILE - 4]]) {
      ctx.beginPath(); ctx.arc(px + rx, py + ry2, 1.4, 0, 7); ctx.fill();
    }
    if (h > 0.72 && h < 0.86) {   // glowing floor conduit
      const glow = 0.4 + Math.sin(G.time * 2.2 + tx + ty * 2) * 0.25;
      ctx.strokeStyle = hexA('#4affd4', glow); ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(px, py + TILE * h2);
      ctx.lineTo(px + TILE * 0.45, py + TILE * h2); ctx.lineTo(px + TILE * 0.55, py + TILE * h3);
      ctx.lineTo(px + TILE, py + TILE * h3);
      ctx.stroke();
    }
    if (h < 0.05) {   // vent grate breathing faint steam
      ctx.fillStyle = '#12151a';
      ctx.fillRect(px + 10, py + 14, 24, 16);
      ctx.fillStyle = '#454d5a';
      for (let k = 0; k < 4; k++) ctx.fillRect(px + 12, py + 16 + k * 4, 20, 1.6);
      ctx.fillStyle = hexA('#8adfff', 0.12 + Math.max(0, Math.sin(G.time * 1.4 + tx)) * 0.1);
      ctx.beginPath(); ctx.ellipse(px + TILE / 2, py + 10, 8, 5, 0, 0, 7); ctx.fill();
    }
    if (h3 > 0.9) {   // blinking deck diode
      ctx.fillStyle = Math.sin(G.time * 4 + tx * 3) > 0.2 ? '#4affd4' : '#12403a';
      ctx.fillRect(px + 6 + h * 30, py + 6 + h2 * 30, 2, 2);
    }
  } else {
    /* ---- classic flagstone (fallback) ---- */
    ctx.fillStyle = pal.f[Math.floor(h * 3) % 3];
    ctx.fillRect(px, py, TILE, TILE);
    ctx.strokeStyle = pal.m + '99'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
    ctx.strokeStyle = pal.m + '55';
    if (h2 < 0.35) { ctx.beginPath(); ctx.moveTo(px + TILE * (0.3 + h2), py); ctx.lineTo(px + TILE * (0.3 + h2), py + TILE); ctx.stroke(); }
    else if (h2 < 0.7) { ctx.beginPath(); ctx.moveTo(px, py + TILE * h2); ctx.lineTo(px + TILE, py + TILE * h2); ctx.stroke(); }
    if (h > 0.84 && h < 0.93) {
      ctx.strokeStyle = pal.m + 'cc'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 6 + h * 20, py + 8);
      ctx.lineTo(px + 14 + h2 * 16, py + 18 + h * 10);
      ctx.lineTo(px + 8 + h * 24, py + 32 + h2 * 8);
      ctx.stroke();
    }
    if (h < 0.05) {
      ctx.fillStyle = '#00000030';
      ctx.beginPath(); ctx.ellipse(px + TILE * 0.5, py + TILE * 0.5, 12 + h * 100, 8, h * 40, 0, 7); ctx.fill();
    }
  }
}

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
  // boss floors replace the plain stairs with the next world's gate
  const bossGate = G.dlvl > 0 && worldFloor(G.dlvl) === 25 && !G.rift && !G.cowLevel && !G.petLair;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const t = G.lvl.map[ty][tx], px = tx * TILE, py = ty * TILE, h = thash(tx, ty);
    if (t === T_WALL) {
      // prop tiles are walls for physics but painted as open ground —
      // the prop itself is drawn y-sorted among the entities
      if (G.lvl.propSet && G.lvl.propSet.has(ty * MAP_W + tx)) {
        drawFloorTile(wrld.deco, px, py, tx, ty, h, pal);
        continue;
      }
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
        drawWallTile(wrld.deco, px, py, tx, ty, h, pal);
      }
    } else {
      drawFloorTile(wrld.deco, px, py, tx, ty, h, pal);
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
        } else if (wrld.deco === 'spores') {   // glowing mushrooms
          ctx.strokeStyle = '#3a5248'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(cx3, cy3 + 3); ctx.lineTo(cx3, cy3 - 4); ctx.stroke();
          ctx.fillStyle = '#6adfb8';
          ctx.beginPath(); ctx.ellipse(cx3, cy3 - 5, 4.5, 2.6, 0, Math.PI, 0); ctx.fill();
          if (h > 0.95) {
            ctx.fillStyle = '#6adfb866';
            ctx.beginPath(); ctx.arc(cx3 + 7, cy3 - 8 + Math.sin(G.time * 2 + cx3) * 2, 1.6, 0, 7); ctx.fill();
          }
        } else if (wrld.deco === 'sand') {   // dunes & sun-bleached skulls
          ctx.strokeStyle = '#6a5a36'; ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(cx3 - 9, cy3 + 2); ctx.quadraticCurveTo(cx3, cy3 - 3 + h * 4, cx3 + 9, cy3 + 2); ctx.stroke();
          if (h > 0.96) {
            ctx.fillStyle = '#d8ccb0';
            ctx.beginPath(); ctx.arc(cx3, cy3 - 3, 3.2, 0, 7); ctx.fill();
            ctx.fillStyle = '#241c0e';
            ctx.fillRect(cx3 - 1.8, cy3 - 4, 1.3, 1.3); ctx.fillRect(cx3 + 0.6, cy3 - 4, 1.3, 1.3);
          }
        } else if (wrld.deco === 'crystal') {   // amethyst shards
          ctx.fillStyle = '#c28aff';
          ctx.beginPath();
          ctx.moveTo(cx3 - 3, cy3 + 3); ctx.lineTo(cx3 - 1, cy3 - 7 - h * 4); ctx.lineTo(cx3 + 1.5, cy3 + 3);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#e8d4ff';
          ctx.beginPath();
          ctx.moveTo(cx3 + 2, cy3 + 3); ctx.lineTo(cx3 + 3.5, cy3 - 3); ctx.lineTo(cx3 + 5, cy3 + 3);
          ctx.closePath(); ctx.fill();
        } else if (wrld.deco === 'veins') {   // pulsing flesh-veins
          ctx.strokeStyle = hexA('#ff5a6a', 0.35 + Math.sin(G.time * 2.2 + cx3 * 0.05) * 0.15);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(cx3 - 10, cy3 - 4);
          ctx.quadraticCurveTo(cx3 - 2, cy3 + 2 + h * 4, cx3 + 4, cy3 - 2);
          ctx.quadraticCurveTo(cx3 + 8, cy3 - 5, cx3 + 11, cy3 + 3);
          ctx.stroke();
        } else if (wrld.deco === 'void') {   // starlike motes in the dark
          ctx.fillStyle = hexA('#8a9aff', 0.5 + Math.sin(G.time * 3 + h * 30) * 0.3);
          ctx.fillRect(cx3 - 1 + h * 10, cy3 - 6 + h * 8, 1.8, 1.8);
          ctx.fillRect(cx3 - 8 + h * 4, cy3 + 2, 1.3, 1.3);
          if (h > 0.97) {
            ctx.strokeStyle = '#8a9aff44'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx3, cy3 - 2, 5 + Math.sin(G.time * 1.6) * 1.5, 0, 7); ctx.stroke();
          }
        } else if (wrld.deco === 'sky') {   // drifting cloud tufts
          ctx.fillStyle = '#ffffffbb';
          const cdx = Math.sin(G.time * 0.6 + cx3 * 0.1) * 4;
          ctx.beginPath(); ctx.ellipse(cx3 + cdx, cy3, 8, 3.2, 0, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.ellipse(cx3 + cdx - 5, cy3 + 2, 5, 2.4, 0, 0, 7); ctx.fill();
          if (h > 0.96) {   // a golden feather left behind
            ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(cx3 - 4, cy3 + 4); ctx.quadraticCurveTo(cx3, cy3 - 4, cx3 + 5, cy3 - 6); ctx.stroke();
          }
        } else if (wrld.deco === 'tech') {   // scattered machine litter
          if (h > 0.96) {   // sparking severed cable
            const on = Math.sin(G.time * 6 + cx3) > 0.4;
            ctx.strokeStyle = '#5a6472'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx3 - 7, cy3 + 3); ctx.quadraticCurveTo(cx3, cy3 - 3, cx3 + 6, cy3 + 1); ctx.stroke();
            if (on) { ctx.fillStyle = '#8adfff'; ctx.fillRect(cx3 + 5, cy3 - 2, 2.4, 2.4); }
          } else {   // loose bolts and a gear
            ctx.fillStyle = '#5a6472';
            ctx.beginPath(); ctx.arc(cx3 - 3, cy3, 3, 0, 7); ctx.fill();
            ctx.fillStyle = '#232830';
            ctx.beginPath(); ctx.arc(cx3 - 3, cy3, 1.2, 0, 7); ctx.fill();
            ctx.fillStyle = '#454d5a';
            ctx.fillRect(cx3 + 4, cy3 - 1, 2, 2); ctx.fillRect(cx3 + 7, cy3 + 2, 2, 2);
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
      if (t === T_DOWN && !bossGate) drawExit(px, py, G.lvl.locked, wrld);
    }
  }

  /* the cracked wall hiding a vault */
  const ck2 = G.lvl.crack;
  if (ck2 && !ck2.open) {
    const px2 = ck2.tx * TILE, py2 = ck2.ty * TILE;
    ctx.strokeStyle = '#0a0806cc'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px2 + 8, py2 + 4);
    ctx.lineTo(px2 + 18, py2 + 16); ctx.lineTo(px2 + 12, py2 + 26); ctx.lineTo(px2 + 22, py2 + 40);
    ctx.moveTo(px2 + 18, py2 + 16); ctx.lineTo(px2 + 30, py2 + 20); ctx.lineTo(px2 + 38, py2 + 12);
    ctx.moveTo(px2 + 12, py2 + 26); ctx.lineTo(px2 + 27, py2 + 32);
    ctx.stroke();
    // a thread of treasure-light leaks through the widest seam
    ctx.strokeStyle = hexA('#ffd76a', 0.3 + Math.max(0, Math.sin(G.time * 1.8)) * 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px2 + 18, py2 + 16); ctx.lineTo(px2 + 12, py2 + 26); ctx.stroke();
    if (ck2.t > 0) {   // crumble progress
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(px2 + TILE / 2, py2 - 8, 8, -Math.PI / 2, -Math.PI / 2 + (ck2.t / 0.8) * Math.PI * 2); ctx.stroke();
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
      // beacon of light over rare+ loot so a big drop reads from across the room
      if (!dr.item.g && dr.item.rarity !== 'common' && dr.item.rarity !== 'magic') {
        const pulse2 = 0.5 + Math.sin(G.time * 2.6 + dr.x) * 0.18;
        const bh = 88, bw = 7;
        const bg2 = ctx.createLinearGradient(0, dr.y - bh, 0, dr.y);
        bg2.addColorStop(0, hexA(col, 0));
        bg2.addColorStop(1, hexA(col, 0.4 * pulse2));
        ctx.fillStyle = bg2;
        ctx.beginPath();
        ctx.moveTo(dr.x - 1.5, dr.y - bh);
        ctx.lineTo(dr.x + 1.5, dr.y - bh);
        ctx.lineTo(dr.x + bw, dr.y);
        ctx.lineTo(dr.x - bw, dr.y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = hexA(col, 0.22 * pulse2);
        ctx.beginPath(); ctx.ellipse(dr.x, dr.y + 4, 13, 5.5, 0, 0, 7); ctx.fill();
      }
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
  for (const wo of G.lvl.wonders || []) drawWonder(wo);
  for (const ch of G.lvl.chests || []) drawChest(ch);

  /* world gates: the town's row of realm doors + the boss floor's exit */
  if (G.lvl.gates) for (const gt of G.lvl.gates) drawWorldGate(gt.x, gt.y, gt.w, gateUnlocked(gt.w), 1, true);
  if (bossGate) {
    const ex = G.lvl.exitTile;
    drawWorldGate(ex.x * TILE + TILE / 2, ex.y * TILE + TILE * 0.4, worldOf(G.dlvl + 1), !G.lvl.locked, 1.4, false);
  }

  /* town vendor, stash trunk, stable & rift obelisk */
  if (G.lvl.vendor) drawVendor(G.lvl.vendor);
  if (G.lvl.stash) drawTrunk(G.lvl.stash);
  if (G.lvl.stable) drawStable(G.lvl.stable);
  if (G.lvl.obelisk) drawObelisk(G.lvl.obelisk);
  if (G.lvl.npcs) for (const n of G.lvl.npcs) drawNpc(n);
  if (G.lvl.questNpc) drawQuestNpc(G.lvl.questNpc);
  if (G.lvl.satchel && !G.lvl.satchel.got) drawSatchel(G.lvl.satchel);

  /* portals: town-side return + dungeon-side anchor */
  if (G.dlvl === 0 && G.lvl.portal && G.anchor) drawPortal(G.lvl.portal.x, G.lvl.portal.y);
  if (G.anchor && G.dlvl === G.anchor.dlvl && G.lvl === G.anchor.lvl) drawPortal(G.anchor.x, G.anchor.y);

  /* entities sorted by y (scenery props take part so heroes pass behind) */
  const ents = [];
  for (const m of G.lvl.monsters) if (m.hp > 0 && m.x > cam.x - VW / ZOOM && m.x < cam.x + VW / ZOOM && m.y > cam.y - VH / ZOOM && m.y < cam.y + VH / ZOOM) ents.push(m);
  for (const pr of G.lvl.props || []) if (pr.x > cam.x - VW / ZOOM && pr.x < cam.x + VW / ZOOM && pr.y > cam.y - VH / ZOOM && pr.y < cam.y + VH / ZOOM) ents.push(pr);
  for (const mi of G.minions) ents.push(mi);
  for (const tp of G.townPets || []) ents.push(tp);
  if (G.pet) ents.push(G.pet);
  ents.push(p);
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e === p) drawPlayer(p);
    else if (e.tx !== undefined) drawProp(e);
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

  /* per-world weather, drifting over the scene */
  drawWeather();

  /* rift clock (screen space) */
  if (G.rift && !G.rift.done) {
    const r = G.rift;
    const low = r.t < 20;
    ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = '⏳ ' + fmtTime(Math.ceil(r.t)) + '  ·  ' +
      (r.guardian ? 'SLAY THE GUARDIAN' : r.kills + ' / ' + r.need);
    ctx.fillStyle = '#000000b0';
    const lw = ctx.measureText(label).width;
    ctx.fillRect(VW / 2 - lw / 2 - 10, 33, lw + 20, 22);
    ctx.fillStyle = low && Math.floor(G.time * 2) % 2 ? '#ff5a3a' : '#e8d9a8';
    ctx.fillText(label, VW / 2, 44);
  }

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

/* ---------------- weather & ambience ----------------
   Every realm breathes: a light field of screen-space particles —
   petals, snow, embers, fog, bubbles, spores, sandstorm, glints,
   mist, void motes, clouds, data-rain — drawn over the lit scene. */
let weatherParts = [], weatherWorld = -1, weatherPrevT = 0;

function makeWeatherPart(w, anywhere) {
  const p = { x: Math.random() * VW, y: Math.random() * VH, ph: Math.random() * 7, vx: 0, vy: 0, r: 1, a: 0.5 };
  switch (w) {
    case 0:   // drifting petals & pollen
      p.vx = rand(6, 18); p.vy = rand(10, 24); p.r = rand(1.2, 2.4);
      p.c = choice(['#d8b84a', '#c86a8a', '#e8e4da']); p.a = rand(0.3, 0.55);
      break;
    case 1:   // snowfall
      p.vx = rand(-6, 6); p.vy = rand(28, 70); p.r = rand(1, 2.6);
      p.c = '#e8f2fa'; p.a = rand(0.35, 0.8);
      break;
    case 2:   // rising embers and ash
      p.vx = rand(-8, 8); p.vy = -rand(20, 55); p.r = rand(0.8, 2);
      p.c = Math.random() < 0.7 ? '#ff8a3a' : '#8a8078'; p.a = rand(0.3, 0.7);
      if (!anywhere) p.y = VH + 4;
      break;
    case 3:   // creeping grave-fog
      p.vx = rand(4, 14) * (Math.random() < 0.5 ? -1 : 1); p.vy = rand(-2, 2);
      p.r = rand(36, 80); p.c = '#8a9a8a'; p.a = rand(0.04, 0.08);
      break;
    case 4:   // rising bubbles
      p.vx = rand(-4, 4); p.vy = -rand(14, 34); p.r = rand(1.2, 3.2);
      p.c = '#bfe8ff'; p.a = rand(0.2, 0.45); p.ring = true;
      if (!anywhere) p.y = VH + 4;
      break;
    case 5:   // luminous spores
      p.vx = rand(-8, 8); p.vy = rand(-8, 8); p.r = rand(1, 2.2);
      p.c = '#6adfb8'; p.a = rand(0.25, 0.6); p.pulse = true;
      break;
    case 6:   // sandstorm streaks
      p.vx = rand(120, 240); p.vy = rand(6, 20); p.r = rand(8, 22);
      p.c = '#d8bc7a'; p.a = rand(0.12, 0.28); p.streak = true;
      if (!anywhere) p.x = -24;
      break;
    case 7:   // crystal glints, winking in place
      p.vx = 0; p.vy = 0; p.r = rand(1, 2);
      p.c = Math.random() < 0.5 ? '#e8d4ff' : '#fff'; p.a = 1; p.pulse = true;
      break;
    case 8:   // crimson mist
      p.vx = rand(3, 10) * (Math.random() < 0.5 ? -1 : 1); p.vy = rand(-3, 3);
      p.r = rand(30, 70); p.c = '#8a2432'; p.a = rand(0.05, 0.1);
      break;
    case 9:   // slow void motes
      p.vx = rand(-5, 5); p.vy = rand(-5, 5); p.r = rand(0.8, 1.8);
      p.c = Math.random() < 0.6 ? '#8a9aff' : '#c8d2ff'; p.a = rand(0.3, 0.8); p.pulse = true;
      break;
    case 10:   // passing cloud wisps
      p.vx = rand(16, 34); p.vy = rand(-2, 2); p.r = rand(30, 70);
      p.c = '#ffffff'; p.a = rand(0.07, 0.13);
      if (!anywhere) p.x = -80;
      break;
    default:   // 11: data-rain
      p.vx = 0; p.vy = rand(150, 260); p.r = rand(6, 14);
      p.c = Math.random() < 0.85 ? '#4affd4' : '#8adfff'; p.a = rand(0.1, 0.25); p.fall = true;
      if (!anywhere) p.y = -16;
      break;
  }
  return p;
}

function drawWeather() {
  if (!G) return;
  const w = G.world || 0;
  const dt = Math.min(0.06, Math.max(0, G.time - weatherPrevT));
  weatherPrevT = G.time;
  if (weatherWorld !== w) {   // rebuild the field when the realm changes
    weatherWorld = w;
    weatherParts = [];
    const n = [24, 54, 38, 14, 28, 32, 40, 26, 12, 26, 14, 34][w] || 26;
    for (let i = 0; i < n; i++) weatherParts.push(makeWeatherPart(w, true));
  }
  ctx.save();
  for (let i = 0; i < weatherParts.length; i++) {
    const pt = weatherParts[i];
    pt.ph += dt;
    pt.x += (pt.vx + (pt.streak ? Math.sin(G.time * 0.7) * 60 : Math.sin(pt.ph * 1.6) * 8)) * dt;
    pt.y += pt.vy * dt;
    // recycle particles that drift off screen
    if (pt.x < -100 || pt.x > VW + 100 || pt.y < -100 || pt.y > VH + 100) {
      weatherParts[i] = makeWeatherPart(w, false);
      continue;
    }
    const a = pt.pulse ? pt.a * (0.35 + Math.max(0, Math.sin(pt.ph * 2.2)) * 0.65) : pt.a;
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    if (pt.streak) {   // wind-stretched grains
      ctx.strokeStyle = pt.c; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x - pt.r, pt.y + pt.r * 0.15); ctx.stroke();
    } else if (pt.fall) {   // vertical data streaks
      ctx.strokeStyle = pt.c; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(pt.x, pt.y - pt.r); ctx.stroke();
    } else if (pt.ring) {   // hollow bubbles
      ctx.strokeStyle = pt.c; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.stroke();
    } else if (pt.r > 20) {   // soft fog / cloud blobs
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, pt.r);
      g.addColorStop(0, pt.c); g.addColorStop(1, pt.c + '00');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
    } else {
      ctx.fillStyle = pt.c;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
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
  for (const dr of G.drops) {
    if (dr.kind === 'item' && !dr.item.g && dr.item.rarity !== 'common' && dr.item.rarity !== 'magic')
      hole(dr.x, dr.y - 20, 70, 0.6);
  }
  for (const s of G.lvl.shrines || []) if (!s.used) hole(s.x, s.y - 14, 85, 0.8);
  for (const wo of G.lvl.wonders || []) if (!wo.used || wo.w === 2 || wo.on > 0) hole(wo.x, wo.y - 10, 75, 0.7);
  if (G.lvl.crack && !G.lvl.crack.open) hole(G.lvl.crack.tx * TILE + TILE / 2, G.lvl.crack.ty * TILE + TILE / 2, 55, 0.4);
  if (G.lvl.vendor) hole(G.lvl.vendor.x, G.lvl.vendor.y, 120, 0.9);
  if (G.lvl.stash) hole(G.lvl.stash.x, G.lvl.stash.y, 100, 0.85);
  if (G.lvl.obelisk) hole(G.lvl.obelisk.x, G.lvl.obelisk.y - 16, 110, 0.9);
  if (G.lvl.gates) for (const gt of G.lvl.gates) hole(gt.x, gt.y - 12, gateUnlocked(gt.w) ? 95 : 60, gateUnlocked(gt.w) ? 0.85 : 0.5);
  if (G.lvl.npcs) for (const n of G.lvl.npcs) hole(n.x, n.y - 8, 95, 0.85);
  if (G.lvl.questNpc) hole(G.lvl.questNpc.x, G.lvl.questNpc.y - 8, 100, 0.85);
  if (G.lvl.satchel && !G.lvl.satchel.got) hole(G.lvl.satchel.x, G.lvl.satchel.y - 6, 75, 0.7);
  for (const pr of G.lvl.props || []) {   // luminous scenery sheds its own light
    if (pr.w === 5 && pr.v === 0) hole(pr.x, pr.y - 22, 80, 0.7);
    else if (pr.w === 7) hole(pr.x, pr.y - 12, 65, 0.55);
    else if (pr.w === 9) hole(pr.x, pr.y - 18, 60, 0.5);
    else if (pr.w === 2) hole(pr.x, pr.y - 15, 50, 0.4);
    else if (pr.w === 8) hole(pr.x, pr.y - 12, 45, 0.3);
  }
  if (G.dlvl > 0 && worldFloor(G.dlvl) === 25 && !G.rift && !G.cowLevel && !G.petLair)
    hole(G.lvl.exitTile.x * TILE + TILE / 2, G.lvl.exitTile.y * TILE, 110, 0.85);
  if (G.lvl.stable) hole(G.lvl.stable.x, G.lvl.stable.y, 130, 0.85);
  if (G.dlvl === 0 && G.lvl.portal && G.anchor) hole(G.lvl.portal.x, G.lvl.portal.y - 6, 90, 0.85);
  if (G.anchor && G.dlvl === G.anchor.dlvl && G.lvl === G.anchor.lvl) hole(G.anchor.x, G.anchor.y - 6, 90, 0.85);
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

function drawWildPet(m) {
  if (!m.petVis) {
    const spDef = PET_SPECIES[m.wild.data.sp];
    m.petVis = { isPet: true, kind: spDef.form || spDef.id, data: m.wild.data, x: m.x, y: m.y, dir: m.dir, atkT: 0, swingT: 0 };
  }
  m.petVis.x = m.x; m.petVis.y = m.y; m.petVis.dir = m.dir;
  // a feral red ring marks it as wild until subdued
  ctx.strokeStyle = hexA('#ff5a3a', 0.5 + Math.sin(G.time * 4) * 0.2);
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(m.x, m.y + m.r * 0.8, m.r * 1.25, m.r * 0.5, 0, 0, 7); ctx.stroke();
  drawPet(m.petVis);
  if (!m.aggro) {   // an alert mark hovers over the unprovoked beast
    ctx.fillStyle = '#ff5a3a';
    ctx.font = 'bold 13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('❗', m.x, m.y - m.r - 18 + Math.sin(G.time * 3) * 2);
  }
  if (m.hitT < 4 && m.hp < m.maxHp) {   // same hp bar as any monster
    const w = m.r * 2.2;
    ctx.fillStyle = '#000000aa'; ctx.fillRect(m.x - w / 2 - 1, m.y - m.r * 1.9 - 1, w + 2, 5);
    ctx.fillStyle = '#5a0f0a'; ctx.fillRect(m.x - w / 2, m.y - m.r * 1.9, w, 3);
    ctx.fillStyle = '#c8281e';
    ctx.fillRect(m.x - w / 2, m.y - m.r * 1.9, w * clamp(m.hp / m.maxHp, 0, 1), 3);
  }
  if (G.p.target === m) {
    ctx.strokeStyle = '#ff8a5a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 5 + Math.sin(G.time * 7) * 1.5, 0, 7); ctx.stroke();
  }
}

function drawMonster(m) {
  const t = m.type, rr = m.r;
  if (t.id === 'wildpet') { drawWildPet(m); return; }
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

  } else if (t.id === 'cow' || t.id === 'cowking') {
    /* -------- hell bovine: an upright cow with a halberd -------- */
    const king = t.id === 'cowking';
    ctx.scale(rr / 14, rr / 14);
    ctx.strokeStyle = W('#d8d4c8'); ctx.lineWidth = 3.2;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 2.8, 3); ctx.lineTo(sd * 2.8 + stride * 3.8 * sd, 10.5); ctx.stroke();
    }
    ctx.strokeStyle = W('#e8e4da'); ctx.lineWidth = 1.6;   // swishing tail
    ctx.beginPath();
    ctx.moveTo(-4, 1);
    ctx.quadraticCurveTo(-9, 3 + Math.sin(time * 5 + ph) * 2, -8, 8 + Math.sin(time * 5 + ph) * 2);
    ctx.stroke();
    // white body with black patches
    const g = ctx.createLinearGradient(0, -9, 0, 6);
    g.addColorStop(0, W('#f0ece0')); g.addColorStop(1, W('#c4c0b4'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-6.5, 5.5);
    ctx.quadraticCurveTo(-8.5, -6, 0, -9);
    ctx.quadraticCurveTo(8.5, -6, 6.5, 5.5);
    ctx.quadraticCurveTo(0, 8, -6.5, 5.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#2a2a2e');
    ctx.beginPath(); ctx.ellipse(-2.5, -3.5, 2.6, 3.2, 0.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.5, 1.5, 2.2, 2.6, -0.4, 0, 7); ctx.fill();
    ctx.fillStyle = W('#e8b4c0');   // pink belly patch
    ctx.beginPath(); ctx.ellipse(0.5, 4.2, 3, 2, 0, 0, 7); ctx.fill();
    // head with snout & horns
    ctx.fillStyle = W('#f0ece0');
    ctx.beginPath(); ctx.arc(1, -13, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = W('#e8b4c0');   // snout
    ctx.beginPath(); ctx.ellipse(3.2, -11.2, 3, 2.2, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a3a4a';
    ctx.fillRect(2.2, -11.6, 1, 1); ctx.fillRect(4.2, -11.4, 1, 1);
    ctx.fillStyle = king ? '#ff3a2a' : '#20140a';   // eyes (the king's burn red)
    ctx.fillRect(-0.6, -14.4, 1.6, 1.6); ctx.fillRect(2.6, -14.6, 1.6, 1.6);
    ctx.fillStyle = W('#e8d9a8');   // horns
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(1 + sd * 3, -16);
      ctx.quadraticCurveTo(1 + sd * 7, -18.5, 1 + sd * 7.5, -21.5);
      ctx.quadraticCurveTo(1 + sd * 4.5, -19, 1 + sd * 2, -17);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = W('#2a2a2e');   // floppy ear
    ctx.beginPath(); ctx.ellipse(-3.6, -13.6, 2, 1.2, 0.6, 0, 7); ctx.fill();
    if (king) {   // golden crown between the horns
      ctx.fillStyle = '#ffd76a';
      ctx.beginPath();
      ctx.moveTo(-2.4, -17.2); ctx.lineTo(-2.4, -20.4); ctx.lineTo(-0.8, -18.4);
      ctx.lineTo(1, -21); ctx.lineTo(2.8, -18.4); ctx.lineTo(4.4, -20.4); ctx.lineTo(4.4, -17.2);
      ctx.closePath(); ctx.fill();
    }
    // halberd arm
    ctx.save();
    ctx.translate(6, -5);
    ctx.rotate(-0.35 + (m.hurtT > 0 ? 0.3 : 0) + stride * 0.12);
    ctx.strokeStyle = W('#d8d4c8'); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3.5, 1.5); ctx.stroke();
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(2, 9); ctx.lineTo(5, -12); ctx.stroke();
    ctx.fillStyle = W('#ccd2da');
    ctx.beginPath();
    ctx.moveTo(4.4, -12.5);
    ctx.quadraticCurveTo(11, -11, 11.5, -5.5);
    ctx.quadraticCurveTo(7.5, -8.5, 4.7, -9);
    ctx.closePath(); ctx.fill();
    ctx.restore();

  } else if (t.id === 'dragon') {
    /* -------- the realm tyrant: a great winged wyrm -------- */
    const dr = DRAGONS[m.dragon || 0];
    const eleC = ELE_COLORS[dr.ele];
    ctx.scale(rr / 30, rr / 30);
    const flap = Math.sin(time * 4 + ph);
    // tail sweeping behind
    ctx.strokeStyle = W(dr.body); ctx.lineWidth = 7; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 4);
    ctx.quadraticCurveTo(-26, 8 + Math.sin(time * 2 + ph) * 4, -34, -2 + Math.sin(time * 2.4 + ph) * 5);
    ctx.stroke();
    ctx.fillStyle = W(dr.belly);   // tail spade
    ctx.beginPath();
    ctx.moveTo(-33, -8 + Math.sin(time * 2.4 + ph) * 5);
    ctx.lineTo(-40, -2 + Math.sin(time * 2.4 + ph) * 5);
    ctx.lineTo(-31, 2 + Math.sin(time * 2.4 + ph) * 5);
    ctx.closePath(); ctx.fill();
    // far wing
    ctx.fillStyle = W(shadeMix(dr.body, 0.7));
    ctx.beginPath();
    ctx.moveTo(-2, -12);
    ctx.quadraticCurveTo(-18, -30 - flap * 8, -34, -24 - flap * 12);
    ctx.quadraticCurveTo(-20, -14 - flap * 3, -4, -6);
    ctx.closePath(); ctx.fill();
    // haunches & body
    const g = ctx.createLinearGradient(0, -16, 0, 12);
    g.addColorStop(0, W(dr.body)); g.addColorStop(1, W(shadeMix(dr.body, 0.55)));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-16, 8);
    ctx.quadraticCurveTo(-20, -12, -2, -15);
    ctx.quadraticCurveTo(16, -12, 14, 6);
    ctx.quadraticCurveTo(0, 13, -16, 8);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#00000088'; ctx.lineWidth = 1.6; ctx.stroke();   // keep the wyrm readable on same-hue ground
    // belly plates
    ctx.strokeStyle = W(dr.belly); ctx.lineWidth = 2.2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath(); ctx.arc(-1, -2 + i * 3.6, 10 - i * 1.4, 0.5, Math.PI - 0.5); ctx.stroke();
    }
    // legs
    ctx.strokeStyle = W(shadeMix(dr.body, 0.6)); ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(-10, 6); ctx.lineTo(-12 + stride * 3, 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 6); ctx.lineTo(10 - stride * 3, 15); ctx.stroke();
    // near wing
    ctx.fillStyle = W(dr.body);
    ctx.beginPath();
    ctx.moveTo(2, -13);
    ctx.quadraticCurveTo(18, -34 - flap * 10, 36, -26 - flap * 14);
    ctx.quadraticCurveTo(22, -12 - flap * 4, 6, -5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = W(dr.belly); ctx.lineWidth = 1.2;   // wing fingers
    for (const [fx2, fy2] of [[30, -25 - flap * 12], [24, -28 - flap * 11], [17, -30 - flap * 10]]) {
      ctx.beginPath(); ctx.moveTo(4, -10); ctx.lineTo(fx2, fy2); ctx.stroke();
    }
    // neck & horned head
    ctx.strokeStyle = W(dr.body); ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(10, -8); ctx.quadraticCurveTo(18, -16, 20, -24); ctx.stroke();
    ctx.fillStyle = W(dr.body);
    ctx.beginPath(); ctx.ellipse(24, -27, 9, 6, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = W(dr.belly);   // snout
    ctx.beginPath(); ctx.ellipse(31, -25.5, 4.5, 3, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = W('#e8e4da');  // horns
    ctx.beginPath(); ctx.moveTo(20, -32); ctx.quadraticCurveTo(14, -40, 12, -44); ctx.quadraticCurveTo(18, -40, 22, -34); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(25, -33); ctx.quadraticCurveTo(23, -40, 24, -44); ctx.quadraticCurveTo(27, -39, 27, -33); ctx.closePath(); ctx.fill();
    // burning eye + breath glow at the maw
    const eg = ctx.createRadialGradient(24, -28, 0, 24, -28, 10);
    eg.addColorStop(0, hexA(eleC, 0.45)); eg.addColorStop(1, hexA(eleC, 0));
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(24, -28, 10, 0, 7); ctx.fill();
    ctx.fillStyle = eleC;
    ctx.fillRect(22, -29.5, 2.6, 2.6);
    const mawGlow = 0.4 + Math.max(0, Math.sin(time * 2.5 + ph)) * 0.5;
    ctx.fillStyle = hexA(eleC, mawGlow);
    ctx.beginPath(); ctx.arc(33.5, -24.5, 2.4, 0, 7); ctx.fill();
    // back spines
    ctx.fillStyle = W(dr.belly);
    for (const [sx, sy] of [[-8, -13], [-1, -15], [6, -13]]) {
      ctx.beginPath(); ctx.moveTo(sx - 2, sy + 2); ctx.lineTo(sx, sy - 5); ctx.lineTo(sx + 2.4, sy + 2); ctx.closePath(); ctx.fill();
    }
  } else if (t.id === 'timp') {
    /* -------- gilded imp: a golden thief hauling its sack -------- */
    ctx.scale(rr / 11, rr / 11);
    ctx.strokeStyle = W('#c89a2e'); ctx.lineWidth = 2;   // whipping tail
    ctx.beginPath();
    ctx.moveTo(-3, 3);
    ctx.quadraticCurveTo(-9, 2 + Math.sin(time * 8 + ph) * 2, -12, -3 + Math.sin(time * 8 + ph) * 3);
    ctx.stroke();
    ctx.strokeStyle = W('#a87e20'); ctx.lineWidth = 2.4;   // sprinting legs
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 2, 4); ctx.lineTo(sd * 2 + Math.sin(time * 12 + ph) * 4 * sd, 9.5); ctx.stroke();
    }
    ctx.fillStyle = W('#e8c14d');   // gleaming body
    ctx.beginPath();
    ctx.moveTo(-5, 4);
    ctx.quadraticCurveTo(-6, -4, 0, -5.5);
    ctx.quadraticCurveTo(6, -4, 5, 4);
    ctx.quadraticCurveTo(0, 6, -5, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#8a6a3a');   // bulging loot sack over the shoulder
    ctx.beginPath(); ctx.ellipse(-6, -8, 5.5, 6.5, -0.4, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#5a4426'); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-3, -3.4); ctx.lineTo(-1, -1); ctx.stroke();   // tied neck
    ctx.fillStyle = '#ffd23a';   // coins spilling from the sack
    ctx.fillRect(-9, -12.5, 2, 2); ctx.fillRect(-4.5, -13.5, 1.7, 1.7);
    ctx.fillStyle = W('#e8c14d');   // head
    ctx.beginPath(); ctx.arc(2, -8.5, 4, 0, 7); ctx.fill();
    ctx.beginPath();   // pointed ear
    ctx.moveTo(-1.4, -9.5); ctx.lineTo(-5, -11.5); ctx.lineTo(-1.6, -7.2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1a08';   // wide panicked eyes
    ctx.fillRect(0.6, -10, 1.8, 1.8); ctx.fillRect(3.6, -10, 1.8, 1.8);
    ctx.strokeStyle = '#2a1a08'; ctx.lineWidth = 1;   // worried mouth
    ctx.beginPath(); ctx.arc(2.6, -5.6, 1.6, Math.PI + 0.4, -0.4); ctx.stroke();
    ctx.fillStyle = hexA('#ffd23a', 0.6 + Math.sin(time * 6) * 0.3);   // golden shimmer
    ctx.beginPath(); ctx.arc(0, -14 + Math.sin(time * 4) * 1.5, 1.4, 0, 7); ctx.fill();

  } else if (t.id === 'harpy') {
    /* -------- storm harpy: winged shrieker riding the gale -------- */
    ctx.scale(rr / 13, rr / 13);
    const flap = Math.sin(time * 11 + ph);
    ctx.fillStyle = W('#8fb2d8');   // beating wings
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sd * 3, -6);
      ctx.quadraticCurveTo(sd * 12, -12 - flap * 5, sd * 16, -6 - flap * 7);
      ctx.quadraticCurveTo(sd * 12, -3 - flap * 3, sd * 3, -2);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = W('#bfe0ff'); ctx.lineWidth = 1;   // feather lines
      ctx.beginPath(); ctx.moveTo(sd * 5, -5); ctx.lineTo(sd * 13, -7 - flap * 5); ctx.stroke();
    }
    ctx.fillStyle = W('#a9c6e4');   // feathered body
    ctx.beginPath(); ctx.ellipse(0, -3, 4.6, 6.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#e8c05a'); ctx.lineWidth = 1.8;   // talons trailing
    ctx.beginPath(); ctx.moveTo(-1.5, 3); ctx.lineTo(-2.5, 8 + flap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.5, 3); ctx.lineTo(2.8, 8 - flap); ctx.stroke();
    ctx.fillStyle = W('#c9dcf0');   // head
    ctx.beginPath(); ctx.arc(1.5, -10.5, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = W('#e8c05a');   // hooked beak
    ctx.beginPath(); ctx.moveTo(4.4, -10.5); ctx.lineTo(8, -9.5); ctx.lineTo(4.4, -8.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd23a';
    ctx.fillRect(1.6, -11.8, 1.7, 1.7);
    ctx.strokeStyle = W('#7a8ff0'); ctx.lineWidth = 1;   // storm-crest
    ctx.beginPath(); ctx.moveTo(-1, -13.5); ctx.lineTo(-3, -16.5); ctx.moveTo(1, -14); ctx.lineTo(0.2, -17); ctx.stroke();

  } else if (t.id === 'djinn') {
    /* -------- cloud djinn: torso trailing into vapor -------- */
    ctx.scale(rr / 15, rr / 15);
    const swirl = time * 2.4 + ph;
    ctx.fillStyle = W('#c9dcf0');   // vapor tail instead of legs
    ctx.beginPath();
    ctx.moveTo(-5, -1);
    ctx.quadraticCurveTo(-3 + Math.sin(swirl) * 2, 5, 0, 9);
    ctx.quadraticCurveTo(3 - Math.sin(swirl) * 2, 5, 5, -1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#ffffff88');
    ctx.beginPath(); ctx.ellipse(Math.sin(swirl) * 3, 7.5, 5.5, 2, 0, 0, 7); ctx.fill();
    const g = ctx.createLinearGradient(0, -12, 0, 2);
    g.addColorStop(0, W('#e8f2fc')); g.addColorStop(1, W('#9ec2e0'));
    ctx.fillStyle = g;   // billowing torso
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.quadraticCurveTo(-7.5, -9, 0, -10.5);
    ctx.quadraticCurveTo(7.5, -9, 6, 0);
    ctx.quadraticCurveTo(0, 2.5, -6, 0);
    ctx.closePath(); ctx.fill();
    // arms gathering a storm
    ctx.strokeStyle = W('#c9dcf0'); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(5, -7); ctx.quadraticCurveTo(10, -6, 11, -1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5, -7); ctx.quadraticCurveTo(-10, -6, -11, -1); ctx.stroke();
    const bz = 0.5 + Math.sin(time * 5 + ph) * 0.4;   // crackling orb
    ctx.fillStyle = hexA('#9adcff', bz);
    ctx.beginPath(); ctx.arc(11, 1, 3, 0, 7); ctx.fill();
    ctx.strokeStyle = hexA('#ffffff', bz); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(9.5, -0.5); ctx.lineTo(11.5, 1); ctx.lineTo(10, 2.5); ctx.stroke();
    ctx.fillStyle = W('#e8f2fc');   // hooded head
    ctx.beginPath(); ctx.arc(0, -13, 4.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#5ab0ff';
    ctx.fillRect(-2.6, -14, 2, 1.8); ctx.fillRect(0.8, -14, 2, 1.8);

  } else if (t.id === 'roc') {
    /* -------- thunder roc: storm-bird bruiser -------- */
    ctx.scale(rr / 20, rr / 20);
    const flap = Math.sin(time * 7 + ph);
    for (const sd of [-1, 1]) {   // vast wings
      ctx.fillStyle = W('#5a6ec0');
      ctx.beginPath();
      ctx.moveTo(sd * 4, -8);
      ctx.quadraticCurveTo(sd * 14, -16 - flap * 6, sd * 21, -8 - flap * 9);
      ctx.quadraticCurveTo(sd * 16, -2 - flap * 4, sd * 4, -1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = W('#7a8ff0');   // wing coverts
      ctx.beginPath();
      ctx.moveTo(sd * 5, -7);
      ctx.quadraticCurveTo(sd * 12, -11 - flap * 4, sd * 16, -7 - flap * 6);
      ctx.quadraticCurveTo(sd * 11, -4 - flap * 2, sd * 5, -3);
      ctx.closePath(); ctx.fill();
    }
    const g = ctx.createLinearGradient(0, -12, 0, 10);
    g.addColorStop(0, W('#6a7ed8')); g.addColorStop(1, W('#3a4a90'));
    ctx.fillStyle = g;   // barrel body
    ctx.beginPath(); ctx.ellipse(0, -2, 9, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = W('#9aacf4');   // breast feathers
    ctx.beginPath(); ctx.ellipse(2, 1, 5, 7, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#e8c05a'); ctx.lineWidth = 2.4;   // talons
    ctx.beginPath(); ctx.moveTo(-3, 8); ctx.lineTo(-4, 13 + stride); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(4, 13 - stride); ctx.stroke();
    ctx.fillStyle = W('#6a7ed8');   // proud head
    ctx.beginPath(); ctx.arc(4, -13, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = W('#ffd23a');   // heavy beak
    ctx.beginPath(); ctx.moveTo(8.6, -13.5); ctx.lineTo(14, -11.5); ctx.lineTo(8.6, -10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = Math.sin(time * 3 + ph) > 0.6 ? '#ffffff' : '#ffd23a';   // lightning glare
    ctx.fillRect(4.2, -15, 2.2, 2.2);
    ctx.strokeStyle = hexA('#9adcff', 0.5 + Math.sin(time * 6 + ph) * 0.4);   // static arcing off the crest
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(1, -17.5); ctx.lineTo(3, -20); ctx.lineTo(4.4, -18); ctx.lineTo(6.4, -21); ctx.stroke();

  } else if (t.id === 'scrapbot') {
    /* -------- scrap skitterer: rusty spider-bot -------- */
    ctx.scale(rr / 11, rr / 11);
    ctx.strokeStyle = W('#5a6472'); ctx.lineWidth = 1.8;   // four skittering legs
    for (const [sd, k] of [[-1, 0], [-1, 1], [1, 0], [1, 1]]) {
      const lp = stride * (k ? 1 : -1) * 2.5;
      ctx.beginPath();
      ctx.moveTo(sd * 3, -1 + k * 2);
      ctx.lineTo(sd * (7 + k * 2), -4 + k * 3 + lp * 0.4);
      ctx.lineTo(sd * (9 + k * 2), 8 + lp);
      ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -8, 0, 4);
    g.addColorStop(0, W('#8a94a4')); g.addColorStop(1, W('#4a525e'));
    ctx.fillStyle = g;   // dented chassis
    ctx.beginPath();
    ctx.moveTo(-6, 2); ctx.lineTo(-5.5, -6); ctx.lineTo(5.5, -6); ctx.lineTo(6, 2); ctx.lineTo(0, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = W('#6a4a2a');   // rust patches
    ctx.beginPath(); ctx.arc(-3, -2, 1.8, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(4, 0.5, 1.3, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#5a6472'); ctx.lineWidth = 1;   // panel seam + bolts
    ctx.beginPath(); ctx.moveTo(-5.5, -2); ctx.lineTo(6, -2); ctx.stroke();
    ctx.fillStyle = '#12151a';
    ctx.fillRect(-4.4, -5, 1.2, 1.2); ctx.fillRect(3.2, -5, 1.2, 1.2);
    const on = Math.sin(time * 8 + ph) > -0.4;   // single mad eye
    ctx.fillStyle = on ? '#ff5a3a' : '#4a1a12';
    ctx.beginPath(); ctx.arc(2, -8.5, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd8c8';
    ctx.beginPath(); ctx.arc(2.6, -9.1, 0.9, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#8a94a4'); ctx.lineWidth = 1.2;   // waving antenna
    ctx.beginPath(); ctx.moveTo(-2, -8); ctx.quadraticCurveTo(-4, -12, -3 + Math.sin(time * 9) * 1.5, -14); ctx.stroke();
    ctx.strokeStyle = W('#c8ccd4'); ctx.lineWidth = 1.6;   // snipping claw
    ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(9.5, -5 + stride); ctx.moveTo(6, -3); ctx.lineTo(9.5, -1 + stride); ctx.stroke();

  } else if (t.id === 'sentinel') {
    /* -------- laser sentinel: hovering hunter-orb -------- */
    ctx.scale(rr / 13, rr / 13);
    const hover = Math.sin(time * 3 + ph) * 1.5;
    ctx.fillStyle = hexA('#4affd4', 0.35 + Math.sin(time * 6 + ph) * 0.15);   // thruster wash
    ctx.beginPath(); ctx.ellipse(0, 8 + hover * 0.4, 4, 6, 0, 0, 7); ctx.fill();
    ctx.translate(0, hover);
    const g = ctx.createRadialGradient(-2, -8, 1, 0, -5, 10);
    g.addColorStop(0, W('#aab4c0')); g.addColorStop(1, W('#3a424e'));
    ctx.fillStyle = g;   // armored sphere
    ctx.beginPath(); ctx.arc(0, -5, 7.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#12151a'; ctx.lineWidth = 1;   // hull seams
    ctx.beginPath(); ctx.arc(0, -5, 7.5, 0.4, 2.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7.5, -5); ctx.lineTo(7.5, -5); ctx.stroke();
    const charge = 0.5 + Math.sin(time * 4 + ph) * 0.4;   // main lens
    ctx.fillStyle = '#12151a';
    ctx.beginPath(); ctx.arc(3, -5, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = hexA('#ff3a3a', charge);
    ctx.beginPath(); ctx.arc(3, -5, 2.2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd8c8';
    ctx.beginPath(); ctx.arc(3.8, -5.8, 0.8, 0, 7); ctx.fill();
    ctx.strokeStyle = W('#5a6472'); ctx.lineWidth = 1.6;   // side vanes
    ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(-11, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-7, -2); ctx.lineTo(-11, 0); ctx.stroke();
    ctx.fillStyle = Math.sin(time * 5 + ph) > 0.3 ? '#4affd4' : '#173a34';   // status blip
    ctx.fillRect(-3.5, -10.5, 1.6, 1.6);

  } else if (t.id === 'warbot') {
    /* -------- siege automaton: hulking mech -------- */
    ctx.scale(rr / 20, rr / 20);
    ctx.fillStyle = W('#343b46');   // piston legs
    for (const sd of [-1, 1]) {
      const lp = stride * 3 * sd;
      ctx.fillRect(sd * 6 - 2.6, 4, 5.2, 6);
      ctx.fillRect(sd * 6 - 3.4 + lp * 0.5, 10, 6.8, 5);
      ctx.strokeStyle = W('#5a6472'); ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(sd * 6, 5); ctx.lineTo(sd * 6 + lp * 0.5, 11); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -14, 0, 6);
    g.addColorStop(0, W('#6a7482')); g.addColorStop(1, W('#3a424e'));
    ctx.fillStyle = g;   // slab torso
    ctx.beginPath();
    ctx.moveTo(-12, 5); ctx.lineTo(-13, -9); ctx.lineTo(-7, -13); ctx.lineTo(7, -13); ctx.lineTo(13, -9); ctx.lineTo(12, 5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#12151a'; ctx.lineWidth = 1.2;   // armor plating seams
    ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(13, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, -4); ctx.stroke();
    ctx.fillStyle = '#5a6472';
    for (const [bx2, by2] of [[-10, -7], [10, -7], [-9, 1], [9, 1]]) {
      ctx.beginPath(); ctx.arc(bx2, by2, 1.4, 0, 7); ctx.fill();
    }
    const core = 0.5 + Math.sin(time * 2.6 + ph) * 0.3;   // reactor core
    ctx.fillStyle = hexA('#4affd4', core);
    ctx.beginPath(); ctx.arc(0, 0, 3.4, 0, 7); ctx.fill();
    ctx.strokeStyle = hexA('#8affe4', core); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 4.8, time * 2, time * 2 + 2); ctx.stroke();
    // pile-driver arms
    ctx.strokeStyle = W('#4a525e'); ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-16, 0 + stride * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(12, -8); ctx.lineTo(16, 0 - stride * 2); ctx.stroke();
    ctx.fillStyle = W('#8a94a4');   // hammer fists
    ctx.fillRect(-19.5, -1 + stride * 2, 7, 6);
    ctx.fillRect(12.5, -1 - stride * 2, 7, 6);
    ctx.fillStyle = W('#262c34');   // low sensor head
    ctx.fillRect(-5, -18, 10, 6);
    const scan = Math.sin(time * 4 + ph);   // sweeping eye-bar
    ctx.fillStyle = '#ff5a3a';
    ctx.fillRect(-3.5 + scan * 3, -16.6, 3, 2);
    ctx.fillStyle = hexA('#ff5a3a', 0.35);
    ctx.fillRect(-4.5, -16.6, 9, 2);

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
  if (mi.kind === 'merc') {
    /* man-at-arms: mail tunic, kettle helm, sword & round buckler */
    ctx.scale(mi.r / 13, mi.r / 13);
    ctx.lineCap = 'round';
    ctx.strokeStyle = W('#4a3826'); ctx.lineWidth = 3.4;
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 2.6, 2); ctx.lineTo(sd * 2.6 + stride * 3.8 * sd, 10); ctx.stroke();
    }
    const g = ctx.createLinearGradient(0, -9, 0, 6);
    g.addColorStop(0, W('#8a8f9a')); g.addColorStop(1, W('#565c66'));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-5.5, 5.5);
    ctx.quadraticCurveTo(-7.5, -6, 0, -9);
    ctx.quadraticCurveTo(7.5, -6, 5.5, 5.5);
    ctx.quadraticCurveTo(0, 7.5, -5.5, 5.5);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3a4048'; ctx.lineWidth = 0.7;   // mail rows
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.arc(0, -6 + i * 3.6, 5.4 - i * 0.6, 0.3, Math.PI - 0.3); ctx.stroke();
    }
    ctx.fillStyle = '#3c2c1a'; ctx.fillRect(-5.4, 3.2, 10.8, 2.6);   // belt
    /* buckler on the off-hand */
    ctx.fillStyle = W('#5a3a22');
    ctx.beginPath(); ctx.arc(-7.5, -1.5, 4.6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a909c'; ctx.lineWidth = 1.4; ctx.stroke();
    /* head + kettle helm */
    ctx.fillStyle = mi.hurtT > 0 ? '#ffb0a0' : '#d8b890';
    ctx.beginPath(); ctx.arc(0, -13.5, 4.4, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(-2.5, -13.6, 1.6, 1.6); ctx.fillRect(1, -13.6, 1.6, 1.6);
    ctx.fillStyle = W('#7a808c');
    ctx.beginPath(); ctx.arc(0, -14.5, 5, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
    ctx.fillRect(-6.4, -15, 12.8, 1.8);   // brim
    /* sword arm */
    ctx.save();
    ctx.translate(5.5, -5);
    ctx.rotate(-0.45 + (mi.swingT > 0 ? Math.sin((0.2 - mi.swingT) / 0.2 * Math.PI) * 1.5 : 0));
    ctx.strokeStyle = mi.hurtT > 0 ? '#ffb0a0' : '#d8b890'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 1.5); ctx.stroke();
    ctx.fillStyle = '#c9a45a'; ctx.fillRect(3, 0, 1.6, 3.4);
    ctx.fillStyle = W('#ccd2da');
    ctx.beginPath(); ctx.moveTo(4.5, 1.2); ctx.lineTo(15, 0.2); ctx.lineTo(4.8, 2.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else if (mi.kind === 'golem') {
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
  // egg-born species reuse a base body recolored to their realm
  const spDef = pet.data ? PET_SPECIES[pet.data.sp] : null;
  const pal = (spDef && spDef.pal) || null;
  // rare+ companions glow with their grade's color
  const rIdx = pet.data ? PET_RARITIES.indexOf(pet.data.rarity) : 0;
  if (rIdx >= 2) {
    ctx.strokeStyle = hexA(rarityColor(pet.data.rarity), 0.35 + Math.sin(t * 3) * 0.12);
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 8, 15, 5.5, 0, 0, 7); ctx.stroke();
  }
  // the Lord of Beasts' companion wears a tiny golden crown
  if (bestiaryTier >= 2 && G.pet === pet) {
    const cy = pet.y - ({ dragon: 54, drake: 40, hawk: 38, wisp: 32 }[pet.kind] || 24) + bob;
    ctx.fillStyle = '#ffd76a';
    ctx.beginPath();
    ctx.moveTo(pet.x - 5, cy); ctx.lineTo(pet.x - 5, cy - 4); ctx.lineTo(pet.x - 2.5, cy - 1.5);
    ctx.lineTo(pet.x, cy - 5); ctx.lineTo(pet.x + 2.5, cy - 1.5); ctx.lineTo(pet.x + 5, cy - 4); ctx.lineTo(pet.x + 5, cy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a3130b';
    ctx.fillRect(pet.x - 1, cy - 2.4, 2, 1.8);
  }
  if (pet.kind === 'hound' || pet.kind === 'wolf' || pet.kind === 'tiger') {
    const wolf = pet.kind === 'wolf', tiger = pet.kind === 'tiger';
    const cBody = pal ? pal.body : tiger ? '#d8863a' : wolf ? '#78828e' : '#6a5238';
    const cDark = pal ? pal.dark : tiger ? '#2c1c10' : wolf ? '#4e5762' : '#3a2c1c';
    const cLeg = pal ? (pal.leg || pal.dark) : tiger ? '#b8702e' : wolf ? '#565f6a' : '#4a3826';
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
    ctx.fillStyle = pal ? (pal.eye || '#ffd76a') : tiger ? '#ffe14d' : wolf ? '#9adcff' : '#ffd76a';
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
    const cBody = pal ? pal.body : drg ? '#a32430' : '#c86a30';
    const cWing = pal ? pal.dark : drg ? '#701420' : '#8a4520';
    const cBelly = pal ? (pal.belly || '#e8c05a') : drg ? '#e8c05a' : '#e8a05a';
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
    ctx.fillStyle = pal ? (pal.eye || '#ffd76a') : drg ? '#ffe14d' : '#ffd76a';
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
    ctx.fillStyle = pal ? pal.dark : '#7a5a34';
    for (const sd of [-1, 1]) {   // wings
      ctx.beginPath();
      ctx.moveTo(sd * 2, 0);
      ctx.quadraticCurveTo(sd * 10, -4 - flap * 5, sd * 15, -1 - flap * 7);
      ctx.quadraticCurveTo(sd * 9, 2 - flap * 2, sd * 2, 2.5);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = pal ? pal.body : '#8a683c';   // body
    ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 3.4, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(5, -1.4, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd23a';   // beak + eye
    ctx.beginPath(); ctx.moveTo(7.2, -1.8); ctx.lineTo(10, -0.8); ctx.lineTo(7.2, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(5, -2.4, 1.3, 1.3);
    ctx.fillStyle = pal ? pal.dark : '#6a4a2c';   // tail feathers
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-10, -1 + bob * 0.4); ctx.lineTo(-9.5, 2); ctx.closePath(); ctx.fill();
    ctx.restore();
  } else {   // arcane familiar / wisp-form beasts
    const wc = pal ? pal.body : '#b8a4ff';
    const fy = pet.y - 18 + bob * 2;
    ctx.fillStyle = '#00000044';
    ctx.beginPath(); ctx.ellipse(pet.x, pet.y + 5, 6, 2.4, 0, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(pet.x, fy, 0, pet.x, fy, 13);
    g.addColorStop(0, hexA(wc, 0.55)); g.addColorStop(1, hexA(wc, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(pet.x, fy, 13, 0, 7); ctx.fill();
    ctx.fillStyle = wc;
    ctx.beginPath(); ctx.arc(pet.x, fy, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#efe8ff';
    ctx.beginPath(); ctx.arc(pet.x - 1.5, fy - 1.5, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(pet.x - 2.6, fy - 1, 1.6, 1.8); ctx.fillRect(pet.x + 1, fy - 1, 1.6, 1.8);
    if (Math.random() < 0.25) G.parts.push({ x: pet.x + rand(-4, 4), y: fy + rand(-4, 4), vx: rand(-6, 6), vy: rand(4, 14), r: rand(1, 2), color: wc, life: 0.4, glow: true });
  }
}

const SHRINE_COLORS = { combat: '#ff5a3a', armor: '#c9b98a', speed: '#7ac8ff', healing: '#ff8a7a', gem: '#4ad46a', xp: '#b8a4e8', bandit: '#ffd23a' };
/* per-world exit doorways: every realm descends through something else */
function drawExit(px, py, locked, wrld) {
  const cx = px + TILE / 2, cy = py + TILE / 2, t = G.time;
  ctx.save();
  switch (wrld.deco) {
    case 'flowers': {   // wooden cellar trapdoor in the meadow
      ctx.fillStyle = '#5a3f22';
      ctx.fillRect(px + 5, py + 6, TILE - 10, TILE - 12);
      ctx.strokeStyle = '#3a2812'; ctx.lineWidth = 1.4;
      for (let k = 1; k < 4; k++) {
        const lx = px + 5 + k * (TILE - 10) / 4;
        ctx.beginPath(); ctx.moveTo(lx, py + 6); ctx.lineTo(lx, py + TILE - 6); ctx.stroke();
      }
      ctx.strokeStyle = '#8a909c'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 5, py + 6, TILE - 10, TILE - 12);
      ctx.beginPath(); ctx.arc(cx, cy + 4, 4, 0, Math.PI); ctx.stroke();   // ring handle
      break;
    }
    case 'snow': {   // jagged ice crevasse
      ctx.fillStyle = '#0a1620';
      ctx.beginPath();
      ctx.moveTo(px + 6, cy - 4); ctx.lineTo(cx - 4, py + 6); ctx.lineTo(cx + 8, cy - 6);
      ctx.lineTo(px + TILE - 6, cy + 2); ctx.lineTo(cx + 4, py + TILE - 6); ctx.lineTo(cx - 8, cy + 6);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 1.6; ctx.stroke();
      break;
    }
    case 'lava': {   // glowing magma vent
      ctx.fillStyle = '#0c0604';
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.fill();
      ctx.strokeStyle = '#ff6a2a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.stroke();
      ctx.strokeStyle = hexA('#ff9a4a', 0.5 + Math.sin(t * 4) * 0.3);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.stroke();
      break;
    }
    case 'graves': {   // open grave beneath a headstone
      ctx.fillStyle = '#0a0810';
      ctx.fillRect(px + 8, py + 12, TILE - 16, TILE - 18);
      ctx.strokeStyle = '#6a6472'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 8, py + 12, TILE - 16, TILE - 18);
      ctx.fillStyle = '#6a6472';
      ctx.fillRect(cx - 7, py + 2, 14, 8);
      ctx.beginPath(); ctx.arc(cx, py + 2, 7, Math.PI, 0); ctx.fill();
      break;
    }
    case 'shells': {   // spinning whirlpool
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = hexA('#4ad4c8', 0.9 - k * 0.25);
        ctx.lineWidth = 2.4 - k * 0.5;
        ctx.beginPath(); ctx.arc(cx, cy, 15 - k * 5, t * (1.5 + k), t * (1.5 + k) + 4.4); ctx.stroke();
      }
      ctx.fillStyle = '#06181c';
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
      break;
    }
    case 'spores': {   // hollow glowing mushroom stump
      ctx.fillStyle = '#4a3828';
      ctx.beginPath(); ctx.ellipse(cx, cy, 16, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#0c1512';
      ctx.beginPath(); ctx.ellipse(cx, cy, 10, 7, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = hexA('#6adfb8', 0.6 + Math.sin(t * 3) * 0.25);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 10, 7, 0, 0, 7); ctx.stroke();
      break;
    }
    case 'sand': {   // sinkhole funnel
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = ['#6a5a36', '#54462a', '#3e341e'][k];
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(cx, cy, 16 - k * 5, 12 - k * 4, 0, 0, 7); ctx.stroke();
      }
      ctx.fillStyle = '#181206';
      ctx.beginPath(); ctx.ellipse(cx, cy, 5, 3.6, 0, 0, 7); ctx.fill();
      break;
    }
    case 'crystal': {   // shard-ringed fissure
      ctx.fillStyle = '#0a0614';
      ctx.beginPath(); ctx.ellipse(cx, cy + 2, 12, 8, 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = '#c28aff';
      for (const [dx, dy, hgt] of [[-12, 2, 9], [-4, 8, 7], [6, 7, 10], [12, 0, 7], [2, -8, 8], [-8, -6, 6]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx - 2.4, cy + dy);
        ctx.lineTo(cx + dx, cy + dy - hgt);
        ctx.lineTo(cx + dx + 2.4, cy + dy);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'veins': {   // pulsing fleshy maw
      const pulse = Math.sin(t * 2.4);
      ctx.fillStyle = '#8a2432';
      ctx.beginPath(); ctx.ellipse(cx, cy, 16, 12 + pulse * 1.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#160608';
      ctx.beginPath(); ctx.ellipse(cx, cy, 10, 7 + pulse, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8e4da';
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + 0.3;
        const tx = cx + Math.cos(a) * 10, ty = cy + Math.sin(a) * 7;
        ctx.beginPath();
        ctx.moveTo(tx - 1.6, ty); ctx.lineTo(tx - Math.cos(a) * 3.4, ty - Math.sin(a) * 3); ctx.lineTo(tx + 1.6, ty);
        ctx.closePath(); ctx.fill();
      }
      break;
    }
    case 'sky': {   // a gap in the clouds, open air below
      ctx.fillStyle = '#3a6aa0';
      ctx.beginPath(); ctx.ellipse(cx, cy, 15, 11, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#254a78';
      ctx.beginPath(); ctx.ellipse(cx, cy + 1, 9, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffffffd8';   // cloud ring around the drop
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2 + t * 0.3;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 14, cy + Math.sin(a) * 10, 6, 3, a * 0.3, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#ffffff88';   // a tiny cloud drifting far below
      ctx.beginPath(); ctx.ellipse(cx + Math.sin(t * 0.9) * 4, cy + 2, 4, 1.4, 0, 0, 7); ctx.fill();
      break;
    }
    case 'tech': {   // freight elevator hatch
      ctx.fillStyle = '#12151a';
      ctx.fillRect(px + 6, py + 7, TILE - 12, TILE - 14);
      ctx.strokeStyle = '#5a6472'; ctx.lineWidth = 2;
      ctx.strokeRect(px + 6, py + 7, TILE - 12, TILE - 14);
      ctx.fillStyle = '#e8c05a';   // hazard-striped lip
      ctx.fillRect(px + 6, py + 7, TILE - 12, 4);
      ctx.fillStyle = '#1a1408';
      for (let k = 0; k < 4; k++) ctx.fillRect(px + 8 + k * 8, py + 7, 4, 4);
      const ph2 = (t * 1.6) % 1;   // descending chevrons
      for (let k = 0; k < 3; k++) {
        const yy = py + 14 + ((ph2 + k / 3) % 1) * 18;
        ctx.strokeStyle = hexA('#4affd4', 0.9 - ((ph2 + k / 3) % 1) * 0.7);
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(cx - 6, yy); ctx.lineTo(cx, yy + 4); ctx.lineTo(cx + 6, yy); ctx.stroke();
      }
      ctx.fillStyle = Math.sin(t * 5) > 0 ? '#ff5a3a' : '#4a1a12';   // call light
      ctx.beginPath(); ctx.arc(px + TILE - 9, py + TILE - 11, 1.8, 0, 7); ctx.fill();
      break;
    }
    default: {   // void rift
      ctx.fillStyle = '#000006';
      ctx.beginPath(); ctx.ellipse(cx, cy, 6 + Math.sin(t * 1.8) * 1.5, 16, 0.5, 0, 7); ctx.fill();
      ctx.strokeStyle = hexA('#8a9aff', 0.7);
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(cx, cy, 7 + Math.sin(t * 1.8) * 1.5, 17, 0.5, 0, 7); ctx.stroke();
      ctx.fillStyle = '#c8d2ff';
      ctx.fillRect(cx + Math.sin(t * 2.6) * 4, cy - 6, 1.6, 1.6);
      ctx.fillRect(cx - 3, cy + 5 + Math.sin(t * 3.1) * 3, 1.3, 1.3);
      break;
    }
  }
  // shared marker so the way down stays recognizable in any realm
  ctx.fillStyle = locked ? '#ff5a3a' : '#ffd76a';
  ctx.font = 'bold 13px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(locked ? '✖' : '▼', cx, py - 6 + Math.sin(t * 3) * 2);
  if (locked) {
    ctx.strokeStyle = '#ff5a3a88'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 19, 0, 7); ctx.stroke();
  }
  ctx.restore();
}

function drawWonder(wo) {
  const t = G.time, x = wo.x, y = wo.y;
  ctx.save();
  if (wo.w !== 2 && wo.used && wo.w !== 11) {   // spent wonders fade to a remnant
    ctx.globalAlpha = 0.45;
  }
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(x, y + 6, 14, 5, 0, 0, 7); ctx.fill();
  switch (wo.w) {
    case 0: {   // fae ring: a circle of tiny mushrooms
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * Math.PI * 2;
        const mx = x + Math.cos(a) * 15, my = y + Math.sin(a) * 9;
        ctx.fillStyle = '#e8e4da';
        ctx.fillRect(mx - 1, my - 3, 2, 3.4);
        ctx.fillStyle = k % 2 ? '#c86a8a' : '#d8b84a';
        ctx.beginPath(); ctx.ellipse(mx, my - 3.4, 3, 1.8, 0, Math.PI, 0); ctx.fill();
      }
      if (!wo.used) {
        ctx.fillStyle = hexA('#c86a8a', 0.5 + Math.sin(t * 3) * 0.3);
        ctx.beginPath(); ctx.arc(x + Math.cos(t * 1.6) * 8, y - 8 + Math.sin(t * 2.2) * 4, 1.6, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(x - Math.cos(t * 1.3) * 9, y - 12 + Math.sin(t * 1.8) * 4, 1.3, 0, 7); ctx.fill();
      }
      break;
    }
    case 1: {   // frozen adventurer: a hero locked in blue ice
      const g = ctx.createLinearGradient(x - 10, y - 26, x + 10, y + 6);
      g.addColorStop(0, hexA('#b8d8ee', 0.9)); g.addColorStop(1, hexA('#6f9cc0', 0.9));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 6); ctx.lineTo(x - 8, y - 20); ctx.lineTo(x, y - 27);
      ctx.lineTo(x + 9, y - 19); ctx.lineTo(x + 11, y + 6);
      ctx.closePath(); ctx.fill();
      if (!wo.used) {   // the poor soul inside
        ctx.fillStyle = '#4a5568';
        ctx.beginPath(); ctx.arc(x, y - 16, 3.6, 0, 7); ctx.fill();
        ctx.fillRect(x - 4, y - 13, 8, 12);
        ctx.strokeStyle = '#4a5568'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 4, y - 10); ctx.lineTo(x + 8, y - 16); ctx.stroke();   // reaching arm
      }
      ctx.strokeStyle = '#e8f4ffcc'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 2, y - 22); ctx.stroke();
      break;
    }
    case 2: {   // lava geyser: rumbles, then blows
      const ph = wo.t % 6, warm = ph > 3.4;
      ctx.fillStyle = '#0c0604';
      ctx.beginPath(); ctx.ellipse(x, y, 15, 9, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = hexA('#ff6a2a', warm ? 0.8 : 0.35); ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(x, y, 14, 8.4, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = hexA('#ff9a4a', warm ? 0.5 + (ph - 3.4) * 0.4 : 0.2);
      ctx.beginPath(); ctx.ellipse(x, y, 7, 4, 0, 0, 7); ctx.fill();
      if (warm && Math.random() < 0.3) {   // pre-eruption sputter
        G.parts.push({ x: x + rand(-6, 6), y: y - 2, vx: rand(-20, 20), vy: rand(-90, -40), r: rand(1, 2.2), color: '#ff8a3a', life: 0.5, glow: true });
      }
      if (ph >= 4.6 && ph < 5.1) {   // the column of fire
        ctx.fillStyle = hexA('#ff8a3a', 0.85);
        ctx.beginPath(); ctx.ellipse(x, y - 26, 7 + Math.sin(t * 30) * 2, 26, 0, 0, 7); ctx.fill();
        ctx.fillStyle = hexA('#ffd27a', 0.9);
        ctx.beginPath(); ctx.ellipse(x, y - 22, 3.4, 18, 0, 0, 7); ctx.fill();
      }
      break;
    }
    case 3: {   // restless grave: a mound that just moved
      ctx.fillStyle = '#2e2834';
      ctx.beginPath(); ctx.ellipse(x, y, 14, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#6a6472';   // crooked marker
      ctx.save();
      ctx.translate(x - 8, y - 6); ctx.rotate(-0.22);
      ctx.fillRect(-2, -14, 4, 16); ctx.fillRect(-6, -10, 12, 3.4);
      ctx.restore();
      if (!wo.used) {   // a hand? no. surely not.
        const push = Math.max(0, Math.sin(t * 1.8 + x));
        ctx.fillStyle = '#b8ab8f';
        ctx.fillRect(x + 5, y - 2 - push * 4, 2.4, 3 + push * 4);
        if (push > 0.85 && Math.random() < 0.1) burst(x + 6, y, '#38303c', 2, 40);
      }
      break;
    }
    case 4: {   // giant clam: pearl-light leaking from the shell
      const open = wo.used ? 0.7 : 0.15 + Math.sin(t * 1.4) * 0.08;
      ctx.fillStyle = '#3f7a70';
      ctx.beginPath(); ctx.ellipse(x, y + 2, 15, 7, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#5a9a8a';
      ctx.save();
      ctx.translate(x, y + 1); ctx.rotate(-open);
      ctx.beginPath(); ctx.ellipse(0, 0, 15, 7, 0, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#2e5a50'; ctx.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 5, -1); ctx.lineTo(k * 6.4, -6.4); ctx.stroke(); }
      ctx.restore();
      if (!wo.used) {
        ctx.fillStyle = hexA('#ffe9d8', 0.6 + Math.sin(t * 2.6) * 0.3);
        ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      }
      break;
    }
    case 5: {   // spore pod: a swollen, glowing bulb
      const swell = wo.used ? 0 : Math.sin(t * 2.2 + x) * 1.4;
      ctx.fillStyle = wo.used ? '#3a4a42' : '#4a6a5a';
      ctx.beginPath(); ctx.ellipse(x, y - 8, 10 + swell, 12 + swell, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#324a40'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 18); ctx.quadraticCurveTo(x, y - 8, x - 2, y + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 5, y - 17); ctx.quadraticCurveTo(x + 2, y - 8, x + 4, y + 1); ctx.stroke();
      if (!wo.used) {
        ctx.fillStyle = hexA('#6adfb8', 0.55 + Math.sin(t * 3) * 0.25);
        ctx.beginPath(); ctx.arc(x, y - 9, 3.6 + swell * 0.5, 0, 7); ctx.fill();
      }
      break;
    }
    case 6: {   // buried cache: a suspicious mound with a jutting handle
      ctx.fillStyle = '#6a5834';
      ctx.beginPath(); ctx.ellipse(x, y, 15, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5a4a2c';
      ctx.beginPath(); ctx.ellipse(x + 3, y + 1, 8, 4, 0, 0, 7); ctx.fill();
      if (!wo.used) {
        ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2.4;   // a chest handle in the sand
        ctx.beginPath(); ctx.arc(x - 3, y - 4, 4.4, Math.PI, 0); ctx.stroke();
        ctx.fillStyle = hexA('#ffe9b0', 0.4 + Math.sin(t * 2.4) * 0.25);
        ctx.fillRect(x - 4 + Math.sin(t * 3) * 3, y - 9, 1.6, 1.6);
        if (wo.t > 0) {   // dig progress arc
          ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2.6;
          ctx.beginPath(); ctx.arc(x, y - 20, 9, -Math.PI / 2, -Math.PI / 2 + (wo.t / 2.2) * Math.PI * 2); ctx.stroke();
        }
      }
      break;
    }
    case 7: {   // resonant crystal: a humming amethyst monolith
      const hum = wo.used ? 0.15 : 0.5 + Math.sin(t * 4) * 0.3;
      ctx.fillStyle = hexA('#c28aff', 0.5 + hum * 0.4);
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 4); ctx.lineTo(x - 3, y - 24); ctx.lineTo(x + 2, y - 28);
      ctx.lineTo(x + 6, y - 20); ctx.lineTo(x + 8, y + 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = hexA('#f0e2ff', hum);
      ctx.fillRect(x - 1, y - 24, 2, 14);
      if (!wo.used) {
        ctx.strokeStyle = hexA('#ffd23a', hum * 0.8); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y - 10, 13 + Math.sin(t * 4) * 2, 0, 7); ctx.stroke();
      }
      break;
    }
    case 8: {   // heart of the garden: a great beating organ
      const beat = wo.used ? 0 : Math.max(0, Math.sin(t * 3.2)) * 2.2;
      ctx.fillStyle = wo.used ? '#4a2228' : '#8a2432';
      ctx.beginPath(); ctx.ellipse(x, y - 8, 11 + beat, 13 + beat, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3c1418'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 5, y - 20); ctx.quadraticCurveTo(x - 1, y - 8, x - 4, y + 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 18); ctx.quadraticCurveTo(x + 2, y - 8, x + 5, y + 2); ctx.stroke();
      if (!wo.used) {
        ctx.fillStyle = hexA('#ff8a9a', 0.4 + beat * 0.2);
        ctx.beginPath(); ctx.arc(x, y - 9, 3.6 + beat, 0, 7); ctx.fill();
      }
      break;
    }
    case 9: {   // void tear: a slit of starlight in the air
      const w2 = wo.used ? 2 : 5 + Math.sin(t * 2) * 1.5;
      ctx.fillStyle = '#000006';
      ctx.beginPath(); ctx.ellipse(x, y - 14, w2, 16, 0.3, 0, 7); ctx.fill();
      ctx.strokeStyle = hexA('#8a9aff', wo.used ? 0.25 : 0.8); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(x, y - 14, w2 + 1, 17, 0.3, 0, 7); ctx.stroke();
      if (!wo.used) {
        ctx.fillStyle = '#c8d2ff';
        ctx.fillRect(x + Math.sin(t * 2.8) * 3, y - 20, 1.6, 1.6);
        ctx.fillRect(x - 2, y - 8 + Math.sin(t * 3.3) * 4, 1.3, 1.3);
      }
      break;
    }
    case 10: {   // zephyr shrine: a marble bowl of swirling wind
      ctx.fillStyle = '#dde4ee';
      ctx.fillRect(x - 3, y - 10, 6, 12);
      ctx.fillStyle = '#f6f9fd';
      ctx.beginPath(); ctx.ellipse(x, y - 12, 11, 4, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(x - 11, y - 13, 22, 2);
      if (!wo.used) {
        ctx.strokeStyle = hexA('#bfe8ff', 0.7); ctx.lineWidth = 1.6;
        for (let k = 0; k < 2; k++) {
          ctx.beginPath(); ctx.arc(x, y - 17, 6 + k * 4, t * (2 + k), t * (2 + k) + 3.6); ctx.stroke();
        }
      }
      break;
    }
    case 11: {   // dormant turret: a stubby cannon on a tripod
      ctx.strokeStyle = '#343b46'; ctx.lineWidth = 2.6;   // tripod
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x - 8, y + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + 8, y + 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 6); ctx.stroke();
      const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0);
      g.addColorStop(0, '#3a424e'); g.addColorStop(0.5, '#6a7482'); g.addColorStop(1, '#3a424e');
      ctx.fillStyle = g;   // swivel head
      ctx.beginPath(); ctx.arc(x, y - 13, 6.5, 0, 7); ctx.fill();
      const aim = wo.zap ? Math.atan2(wo.zap.y - (y - 13), wo.zap.x - x) : Math.sin(t * 0.8) * 0.6;
      ctx.save();
      ctx.translate(x, y - 13); ctx.rotate(aim);
      ctx.fillStyle = '#262c34';
      ctx.fillRect(0, -2, 11, 4);
      ctx.restore();
      const lit = wo.on > 0;
      ctx.fillStyle = lit ? '#4affd4' : (Math.sin(t * 1.4) > 0.7 ? '#1a5a4c' : '#12252a');
      ctx.beginPath(); ctx.arc(x, y - 13, 2.2, 0, 7); ctx.fill();
      if (wo.zap) {   // the zap beam
        ctx.strokeStyle = hexA('#4affd4', 0.85); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(aim) * 11, y - 13 + Math.sin(aim) * 11);
        ctx.lineTo(wo.zap.x, wo.zap.y); ctx.stroke();
      }
      if (lit) {   // countdown ring
        ctx.strokeStyle = hexA('#4affd4', 0.5); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y - 13, 10, -Math.PI / 2, -Math.PI / 2 + (wo.on / 25) * Math.PI * 2); ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

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

function drawPortal(x, y) {
  const t = G.time;
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(x, y + 16, 14, 5, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 22);
  g.addColorStop(0, 'rgba(154,220,255,0.7)');
  g.addColorStop(0.6, 'rgba(90,176,255,0.35)');
  g.addColorStop(1, 'rgba(90,176,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y - 6, 16, 22, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#5ab0ff'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(x, y - 6, 12, 18, Math.sin(t * 1.5) * 0.15, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#bfe8ff'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.ellipse(x, y - 6, 7 + Math.sin(t * 3) * 1.5, 12 + Math.cos(t * 2.4) * 2, -Math.sin(t * 1.5) * 0.2, 0, 7); ctx.stroke();
  if (Math.random() < 0.3) G.parts.push({ x: x + rand(-8, 8), y: y - 6 + rand(-14, 14), vx: rand(-8, 8), vy: rand(-18, -6), r: rand(1, 2), color: '#9adcff', life: rand(0.3, 0.6), glow: true });
  ctx.font = '10px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#9adcff';
  ctx.fillText('portal', x, y - 34);
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

/* ---------------- scenery props ----------------
   Big world-themed set dressing — trees and their kin. Each prop sits on
   a wall-tile base (solid to movement and arrows) and is drawn among the
   y-sorted entities so heroes walk behind and in front of it. Variation
   comes from the prop's tile hash; sway and glow may use time. */
function drawProp(pr) {
  const x = pr.x, y = pr.y, t = G.time, hh = thash(pr.tx * 3 + 1, pr.ty * 5 + 2);
  const sway = Math.sin(t * 1.3 + pr.tx * 2) * 1.6;
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(x, y + 8, 15, 5.5, 0, 0, 7); ctx.fill();
  if (pr.w === 0) {
    if (pr.v === 0) {   /* old oak */
      ctx.strokeStyle = '#5a4226'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x + (hh - 0.5) * 6, y - 12, x + sway * 0.5, y - 22); ctx.stroke();
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x - 8, y - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x + 9, y - 25); ctx.stroke();
      for (const [lx, ly, lr, c] of [[-9 + sway, -28, 9, '#3d5f2c'], [9 + sway, -29, 10, '#466a33'], [0 + sway, -37, 11, '#518a3e'], [-2 + sway, -24, 8, '#3a5a2a']]) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x + lx, y + ly, lr, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#6aa64a55';
      ctx.beginPath(); ctx.arc(x - 4 + sway, y - 38, 5, 0, 7); ctx.fill();
    } else {            /* flowering bush */
      for (const [lx, ly, lr, c] of [[-7, -4, 7, '#3d5f2c'], [7, -4, 7, '#466a33'], [0, -9, 8.5, '#518a3e']]) {
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(x + lx + sway * 0.4, y + ly, lr, 0, 7); ctx.fill();
      }
      for (let k = 0; k < 5; k++) {
        const fh = thash(pr.tx + k, pr.ty * 7 + k);
        ctx.fillStyle = ['#d8b84a', '#c86a8a', '#e8e4da'][k % 3];
        ctx.fillRect(x - 9 + fh * 18 + sway * 0.4, y - 12 + thash(pr.tx * 9 + k, pr.ty) * 12, 2.4, 2.4);
      }
    }
  } else if (pr.w === 1) {
    if (pr.v === 0) {   /* snow-laden pine */
      ctx.fillStyle = '#4a3420';
      ctx.fillRect(x - 2.5, y - 4, 5, 10);
      for (let tier = 0; tier < 3; tier++) {
        const ty2 = y - 6 - tier * 12, w2 = 17 - tier * 4;
        ctx.fillStyle = '#2c4a3c';
        ctx.beginPath(); ctx.moveTo(x - w2, ty2); ctx.lineTo(x + sway * 0.3, ty2 - 15); ctx.lineTo(x + w2, ty2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8f2fa';
        ctx.beginPath(); ctx.moveTo(x - w2, ty2); ctx.quadraticCurveTo(x, ty2 - 4, x + w2, ty2); ctx.lineTo(x + w2 - 3, ty2 + 2.5); ctx.quadraticCurveTo(x, ty2 - 1, x - w2 + 3, ty2 + 2.5); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#e8f2fa';
      ctx.beginPath(); ctx.arc(x + sway * 0.3, y - 44, 3, 0, 7); ctx.fill();
    } else {            /* ice boulder */
      const g = ctx.createLinearGradient(x - 12, y - 20, x + 12, y + 4);
      g.addColorStop(0, '#b8d8ee'); g.addColorStop(1, '#6f9cc0');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 4); ctx.lineTo(x - 10, y - 12); ctx.lineTo(x - 2, y - 18);
      ctx.lineTo(x + 9, y - 14); ctx.lineTo(x + 14, y + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 2); ctx.lineTo(x + 2, y - 14); ctx.stroke();
      ctx.fillStyle = '#e8f2fa';
      ctx.fillRect(x - 12, y - 13, 9, 3);
    }
  } else if (pr.w === 2) {
    if (pr.v === 0) {   /* volcanic spire */
      ctx.fillStyle = '#241c1a';
      ctx.beginPath();
      ctx.moveTo(x - 13, y + 5); ctx.lineTo(x - 6, y - 18); ctx.lineTo(x - 1, y - 34);
      ctx.lineTo(x + 5, y - 16); ctx.lineTo(x + 12, y + 5); ctx.closePath(); ctx.fill();
      const glow = 0.5 + Math.sin(t * 2.2 + pr.tx) * 0.25;
      ctx.strokeStyle = hexA('#ff6a2a', glow); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 4, y + 2); ctx.lineTo(x - 1, y - 16); ctx.lineTo(x - 3, y - 28); ctx.stroke();
      ctx.fillStyle = hexA('#ffb03a', glow);
      ctx.beginPath(); ctx.arc(x - 1, y - 33, 2, 0, 7); ctx.fill();
    } else {            /* charred dead tree, embers at the tips */
      ctx.strokeStyle = '#181210'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + 1, y - 18); ctx.stroke();
      ctx.lineWidth = 2.4;
      for (const [ax, ay, bx2, by2] of [[1, -14, -11, -26], [1, -18, 10, -30], [1, -10, 8, -16]]) {
        ctx.beginPath(); ctx.moveTo(x + ax, y + ay); ctx.lineTo(x + bx2, y + by2); ctx.stroke();
      }
      const glow = 0.4 + Math.max(0, Math.sin(t * 3 + pr.ty)) * 0.5;
      ctx.fillStyle = hexA('#ff8a3a', glow);
      ctx.fillRect(x - 12, y - 27.5, 2.4, 2.4); ctx.fillRect(x + 9, y - 31.5, 2.4, 2.4);
    }
  } else if (pr.w === 3) {
    if (pr.v === 0) {   /* gnarled grave tree */
      ctx.strokeStyle = '#3a3442'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x - 6, y - 10, x + 2 + sway * 0.4, y - 22); ctx.stroke();
      ctx.lineWidth = 2.2;
      for (const [ax, ay, bx2, by2, cx3, cy3] of [[2, -20, -8, -26, -14, -24], [2, -22, 10, -30, 15, -27], [-2, -12, -10, -14, -13, -19]]) {
        ctx.beginPath(); ctx.moveTo(x + ax, y + ay); ctx.quadraticCurveTo(x + bx2, y + by2, x + cx3 + sway * 0.5, y + cy3); ctx.stroke();
      }
      ctx.fillStyle = '#9adc8a';   // a single watching wisp in the branches
      if (hh > 0.5) { ctx.beginPath(); ctx.arc(x + 10, y - 26 + Math.sin(t * 2) * 2, 1.8, 0, 7); ctx.fill(); }
    } else {            /* leaning crypt cross */
      ctx.save();
      ctx.translate(x, y + 4); ctx.rotate((hh - 0.5) * 0.25);
      ctx.fillStyle = '#6a6472';
      ctx.fillRect(-3, -30, 6, 34);
      ctx.fillRect(-11, -22, 22, 6);
      ctx.fillStyle = '#514b59';
      ctx.fillRect(-3, -30, 2.4, 34);
      ctx.restore();
      ctx.fillStyle = '#4a7a3466';   // moss at the foot
      ctx.beginPath(); ctx.ellipse(x + 4, y + 5, 6, 2.6, 0, 0, 7); ctx.fill();
    }
  } else if (pr.w === 4) {
    if (pr.v === 0) {   /* branching coral head */
      ctx.strokeStyle = '#e87a6a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      for (const [ax, bx2, by2] of [[-6, -14, -20], [-2, -4, -26], [4, 6, -24], [8, 15, -16]]) {
        ctx.beginPath(); ctx.moveTo(x + ax * 0.5, y + 4); ctx.quadraticCurveTo(x + ax, y - 8, x + bx2 + sway * 0.4, y + by2); ctx.stroke();
      }
      ctx.fillStyle = '#ffb0a0';
      for (const [cx3, cy3] of [[-14, -21], [-4, -27], [6, -25], [15, -17]]) {
        ctx.beginPath(); ctx.arc(x + cx3 + sway * 0.4, y + cy3, 2.6, 0, 7); ctx.fill();
      }
    } else {            /* towering kelp cluster */
      ctx.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        const kx = x - 7 + k * 7, ph = t * 1.6 + k * 1.3 + pr.tx;
        ctx.strokeStyle = ['#2e6a4a', '#3a7a56', '#276044'][k]; ctx.lineWidth = 3.4 - k * 0.5;
        ctx.beginPath();
        ctx.moveTo(kx, y + 6);
        ctx.quadraticCurveTo(kx + Math.sin(ph) * 5, y - 14, kx + Math.sin(ph + 1) * 8, y - 32 - k * 4);
        ctx.stroke();
        ctx.fillStyle = '#4a9a6a';
        ctx.beginPath(); ctx.ellipse(kx + Math.sin(ph + 1) * 8, y - 33 - k * 4, 3, 1.8, Math.sin(ph) * 0.6, 0, 7); ctx.fill();
      }
    }
  } else if (pr.w === 5) {
    if (pr.v === 0) {   /* giant lantern mushroom */
      const glow = 0.55 + Math.sin(t * 2 + pr.tx * 2) * 0.2;
      ctx.fillStyle = '#8a7a60';
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 6); ctx.quadraticCurveTo(x - 2, y - 12, x - 3, y - 20);
      ctx.lineTo(x + 3, y - 20); ctx.quadraticCurveTo(x + 4, y - 12, x + 4, y + 6);
      ctx.closePath(); ctx.fill();
      const g = ctx.createRadialGradient(x, y - 24, 0, x, y - 24, 24);
      g.addColorStop(0, hexA('#6adfb8', glow * 0.5)); g.addColorStop(1, hexA('#6adfb8', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y - 24, 24, 0, 7); ctx.fill();
      ctx.fillStyle = hexA('#5acaa4', 0.9);
      ctx.beginPath(); ctx.ellipse(x, y - 22, 17, 10, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = hexA('#bfffe4', glow);
      for (const [sx, sy] of [[-9, -25], [0, -29], [9, -25]]) { ctx.beginPath(); ctx.arc(x + sx, y + sy, 1.8, 0, 7); ctx.fill(); }
    } else {            /* puffball trio */
      for (const [bx2, by2, br] of [[-8, -2, 6], [6, -4, 8], [-1, -10, 5]]) {
        ctx.fillStyle = '#b8ab8f';
        ctx.beginPath(); ctx.arc(x + bx2, y + by2, br, 0, 7); ctx.fill();
        ctx.fillStyle = '#8a7a60';
        ctx.beginPath(); ctx.arc(x + bx2, y + by2 - br * 0.4, br * 0.35, 0, 7); ctx.fill();
      }
      if (Math.random() < 0.02) G.parts.push({ x: x + rand(-8, 8), y: y - 8, vx: rand(-4, 4), vy: rand(-10, -4), r: 1.4, color: '#c8bda4', life: 0.8, glow: true });
    }
  } else if (pr.w === 6) {
    if (pr.v === 0) {   /* saguaro cactus */
      ctx.strokeStyle = '#4a6a34'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.lineTo(x, y - 26); ctx.stroke();
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x - 1, y - 10); ctx.lineTo(x - 10, y - 12); ctx.lineTo(x - 10, y - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 1, y - 16); ctx.lineTo(x + 10, y - 18); ctx.lineTo(x + 10, y - 26); ctx.stroke();
      ctx.strokeStyle = '#374f27'; ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 2 + k * 2, y + 2); ctx.lineTo(x - 2 + k * 2, y - 24); ctx.stroke(); }
      if (hh > 0.6) { ctx.fillStyle = '#c86a8a'; ctx.beginPath(); ctx.arc(x, y - 28, 2.6, 0, 7); ctx.fill(); }
    } else {            /* toppled sandstone pillar */
      ctx.save();
      ctx.translate(x, y); ctx.rotate((hh - 0.5) * 0.2);
      ctx.fillStyle = '#6a5834';
      ctx.fillRect(-6, -26, 12, 30);
      ctx.fillStyle = '#74603a';
      ctx.fillRect(-8, -30, 16, 6);
      ctx.fillStyle = '#52442c';
      for (let k = 0; k < 3; k++) ctx.fillRect(-6, -22 + k * 8, 12, 2);
      ctx.restore();
      ctx.fillStyle = '#5a4c30';   // rubble
      ctx.beginPath(); ctx.arc(x + 11, y + 3, 3.4, 0, 7); ctx.fill();
    }
  } else if (pr.w === 7) {
    const glow = 0.5 + Math.sin(t * 2 + pr.tx * 3) * 0.25;
    if (pr.v === 0) {   /* great crystal cluster */
      for (const [bx2, tx3, ty3, s2, a] of [[-8, -13, -24, 5, 0.9], [8, 13, -20, 5, 0.7], [0, 0, -34, 6, 1]]) {
        ctx.fillStyle = hexA('#c28aff', glow * a);
        ctx.beginPath();
        ctx.moveTo(x + bx2 - s2, y + 4); ctx.lineTo(x + tx3, y + ty3); ctx.lineTo(x + bx2 + s2, y + 4);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#f0e2ff';
      ctx.fillRect(x - 1.2, y - 30, 2.4, 9);
    } else {            /* split geode boulder */
      ctx.fillStyle = '#2e2440';
      ctx.beginPath();
      ctx.moveTo(x - 14, y + 4); ctx.lineTo(x - 9, y - 14); ctx.lineTo(x + 4, y - 17); ctx.lineTo(x + 13, y + 3); ctx.closePath(); ctx.fill();
      ctx.fillStyle = hexA('#c28aff', glow);
      ctx.beginPath(); ctx.ellipse(x + 1, y - 4, 6.5, 4.5, 0.4, 0, 7); ctx.fill();
      ctx.fillStyle = '#f0e2ff';
      ctx.beginPath(); ctx.ellipse(x + 1, y - 4, 2.6, 1.8, 0.4, 0, 7); ctx.fill();
    }
  } else if (pr.w === 8) {
    const pulse = 0.35 + Math.max(0, Math.sin(t * 2.4 + pr.ty)) * 0.4;
    if (pr.v === 0) {   /* bloodthorn tree */
      ctx.strokeStyle = '#2c1418'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.quadraticCurveTo(x + 4, y - 12, x - 2 + sway * 0.4, y - 24); ctx.stroke();
      for (const [lx, ly, lr] of [[-8, -26, 8], [6, -29, 9], [-1, -35, 8]]) {
        ctx.fillStyle = '#6a1e2a';
        ctx.beginPath(); ctx.arc(x + lx + sway * 0.5, y + ly, lr, 0, 7); ctx.fill();
      }
      ctx.fillStyle = hexA('#ff5a6a', pulse);
      for (const [lx, ly] of [[-10, -24], [7, -31], [0, -38]]) {
        ctx.beginPath(); ctx.arc(x + lx + sway * 0.5, y + ly, 1.8, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#3c1418';   // thorn
      ctx.beginPath(); ctx.moveTo(x + 3, y - 8); ctx.lineTo(x + 9, y - 12); ctx.lineTo(x + 5, y - 5); ctx.closePath(); ctx.fill();
    } else {            /* great flesh pod */
      ctx.fillStyle = '#5a2830';
      ctx.beginPath(); ctx.ellipse(x, y - 8, 11, 14, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#3c1418'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 6, y - 18); ctx.quadraticCurveTo(x, y - 8, x - 4, y + 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 6, y - 17); ctx.quadraticCurveTo(x + 2, y - 8, x + 5, y + 2); ctx.stroke();
      ctx.fillStyle = hexA('#ff8a9a', pulse + 0.15);
      ctx.beginPath(); ctx.arc(x, y - 10, 3.4, 0, 7); ctx.fill();
    }
  } else if (pr.w === 10) {
    if (pr.v === 0) {   /* broken marble column, gold capital */
      ctx.fillStyle = '#dde4ee';
      ctx.fillRect(x - 6, y - 24, 12, 28);
      const g = ctx.createLinearGradient(x - 6, 0, x + 6, 0);
      g.addColorStop(0, '#aab4c8'); g.addColorStop(0.4, '#f6f9fd'); g.addColorStop(1, '#aab4c8');
      ctx.fillStyle = g;
      ctx.fillRect(x - 6, y - 24, 12, 28);
      ctx.fillStyle = '#ffd76a';   // gilded capital, snapped at an angle
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 24); ctx.lineTo(x + 8, y - 24); ctx.lineTo(x + 8, y - 28); ctx.lineTo(x - 8, y - 30);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a94ac';   // fallen drum beside it
      ctx.beginPath(); ctx.ellipse(x + 12, y + 2, 6, 3.4, 0.3, 0, 7); ctx.fill();
      // a cloud drifting through the ruin
      ctx.fillStyle = '#ffffffb0';
      const cdx = Math.sin(t * 0.8 + pr.tx) * 4;
      ctx.beginPath(); ctx.ellipse(x + cdx, y - 12, 9, 3.4, 0, 0, 7); ctx.fill();
    } else {            /* hovering cloud tuft raining gold motes */
      const hover = Math.sin(t * 1.4 + pr.tx) * 2.5;
      ctx.fillStyle = '#ffffffd8';
      for (const [bx2, by2, br] of [[-7, -18, 6], [3, -21, 7.5], [10, -17, 5], [-1, -15, 6.5]]) {
        ctx.beginPath(); ctx.arc(x + bx2, y + by2 + hover, br, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#c8d2e2aa';
      ctx.beginPath(); ctx.ellipse(x + 1, y - 14 + hover, 11, 3.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = hexA('#ffd76a', 0.5 + Math.sin(t * 2.4 + pr.ty) * 0.3);
      for (let k = 0; k < 3; k++) {
        const fy = (t * 8 + k * 9 + pr.tx * 3) % 16;
        ctx.fillRect(x - 6 + k * 6, y - 10 + hover + fy, 1.6, 1.6);
      }
    }
  } else if (pr.w === 11) {
    if (pr.v === 0) {   /* humming server obelisk */
      ctx.fillStyle = '#262c34';
      ctx.fillRect(x - 8, y - 30, 16, 36);
      ctx.strokeStyle = '#454d5a'; ctx.lineWidth = 1.2;
      ctx.strokeRect(x - 8, y - 30, 16, 36);
      for (let row = 0; row < 4; row++) {   // blinking light banks
        for (let col = 0; col < 3; col++) {
          const on = Math.sin(t * (2 + row) + col * 2.1 + pr.tx) > 0.3;
          ctx.fillStyle = on ? ['#4affd4', '#ff5a3a', '#ffd23a'][(row + col) % 3] : '#12151a';
          ctx.fillRect(x - 5 + col * 4.5, y - 26 + row * 7, 2.4, 2.4);
        }
      }
      ctx.strokeStyle = '#5a6472'; ctx.lineWidth = 1.6;   // antenna
      ctx.beginPath(); ctx.moveTo(x + 5, y - 30); ctx.lineTo(x + 8, y - 40); ctx.stroke();
      ctx.fillStyle = hexA('#ff5a3a', 0.4 + Math.max(0, Math.sin(t * 2)) * 0.5);
      ctx.beginPath(); ctx.arc(x + 8, y - 41, 1.8, 0, 7); ctx.fill();
    } else {            /* slumped derelict robot */
      ctx.fillStyle = '#343b46';   // tilted torso
      ctx.save();
      ctx.translate(x, y - 8); ctx.rotate(0.18);
      ctx.fillRect(-8, -10, 16, 18);
      ctx.strokeStyle = '#12151a'; ctx.lineWidth = 1;
      ctx.strokeRect(-8, -10, 16, 18);
      ctx.fillStyle = '#262c34';   // dented head
      ctx.fillRect(-5, -17, 10, 8);
      const flick = Math.sin(t * 7 + pr.ty) > 0.7;
      ctx.fillStyle = flick ? '#4affd4' : '#173a34';   // one eye still flickers
      ctx.fillRect(-2.6, -14.5, 3, 2.4);
      ctx.restore();
      ctx.strokeStyle = '#454d5a'; ctx.lineWidth = 3; ctx.lineCap = 'round';   // limp arm
      ctx.beginPath(); ctx.moveTo(x + 7, y - 6); ctx.quadraticCurveTo(x + 13, y, x + 12, y + 6); ctx.stroke();
      ctx.fillStyle = '#5a6472';   // scattered parts
      ctx.beginPath(); ctx.arc(x - 12, y + 4, 2.6, 0, 7); ctx.fill();
      if (Math.random() < 0.015) G.parts.push({ x: x + rand(-4, 4), y: y - 14, vx: rand(-14, 14), vy: rand(-20, -6), r: 1.2, color: '#8adfff', life: 0.4, glow: true });
    }
  } else {
    if (pr.v === 0) {   /* hovering void shard */
      const hover = Math.sin(t * 1.5 + pr.tx) * 2.5;
      ctx.fillStyle = '#0e0e16';
      ctx.strokeStyle = hexA('#8a9aff', 0.7); ctx.lineWidth = 1.2;
      ctx.save();
      ctx.translate(x, y - 20 + hover); ctx.rotate(0.12 + Math.sin(t * 0.8) * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, -14); ctx.lineTo(8, 0); ctx.lineTo(0, 16); ctx.lineTo(-8, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = hexA('#c8d2ff', 0.7);
      ctx.fillRect(-1, -6, 2, 8);
      ctx.restore();
      ctx.fillStyle = hexA('#8a9aff', 0.3);   // debris orbiting the base
      ctx.beginPath(); ctx.arc(x + Math.cos(t * 1.8) * 12, y + Math.sin(t * 1.8) * 3, 1.6, 0, 7); ctx.fill();
    } else {            /* null orb on a black pedestal */
      ctx.fillStyle = '#0e0e16';
      ctx.fillRect(x - 6, y - 10, 12, 15);
      ctx.strokeStyle = hexA('#8a9aff', 0.4); ctx.lineWidth = 1;
      ctx.strokeRect(x - 6, y - 10, 12, 15);
      const g = ctx.createRadialGradient(x, y - 18, 0, x, y - 18, 12);
      g.addColorStop(0, hexA('#8a9aff', 0.45)); g.addColorStop(1, hexA('#8a9aff', 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y - 18, 12, 0, 7); ctx.fill();
      ctx.fillStyle = '#05050a';
      ctx.beginPath(); ctx.arc(x, y - 18, 6, 0, 7); ctx.fill();
      ctx.strokeStyle = hexA('#c8d2ff', 0.8); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y - 18, 6, t % 7, (t % 7) + 1.2); ctx.stroke();
    }
  }
}

/* ---------------- world gates ----------------
   Each realm has its own archway. Locked gates hang with chains until
   the previous world's boss falls; open gates glow with the realm's
   colors and lead straight to that world's first floor. */
function drawWorldGate(x, y, w, unlocked, s, label) {
  s = s || 1;
  const wr = WORLDS[w], acc = wr.pal.acc, t = G.time;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // dark opening with a living glow when unlocked
  const glow = unlocked ? 0.35 + Math.sin(t * 2.4 + w) * 0.15 : 0;
  ctx.fillStyle = '#050308';
  ctx.beginPath();
  ctx.moveTo(-13, 10);
  ctx.lineTo(-13, -16);
  ctx.quadraticCurveTo(0, -30, 13, -16);
  ctx.lineTo(13, 10);
  ctx.closePath(); ctx.fill();
  if (unlocked) {
    const g = ctx.createRadialGradient(0, -6, 0, 0, -6, 22);
    g.addColorStop(0, hexA(acc, glow + 0.25));
    g.addColorStop(1, hexA(acc, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-12, 10); ctx.lineTo(-12, -15);
    ctx.quadraticCurveTo(0, -28, 12, -15); ctx.lineTo(12, 10);
    ctx.closePath(); ctx.fill();
    // drifting motes in the portal
    ctx.fillStyle = hexA(acc, 0.8);
    for (let k = 0; k < 3; k++) {
      const my = 8 - ((t * 9 + k * 13 + w * 7) % 30);
      ctx.fillRect(-6 + k * 6 + Math.sin(t * 2 + k) * 2, my, 1.8, 1.8);
    }
  }
  // per-realm arch dressing
  if (w === 0) {          // living archway: trunks and leaves
    ctx.strokeStyle = '#5a4226'; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 11); ctx.quadraticCurveTo(-16, -14, -4, -24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 11); ctx.quadraticCurveTo(16, -14, 4, -24); ctx.stroke();
    ctx.fillStyle = '#4a7a34';
    for (const [lx, ly, lr] of [[-13, -14, 5], [-8, -21, 5.5], [0, -25, 6], [8, -21, 5.5], [13, -14, 5]]) {
      ctx.beginPath(); ctx.arc(lx, ly, lr, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#d8b84a';
    ctx.fillRect(-9, -19, 2, 2); ctx.fillRect(7, -17, 2, 2); ctx.fillRect(-1, -23, 2, 2);
  } else if (w === 1) {   // ice arch with icicles
    ctx.strokeStyle = '#9cc4e0'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 11); ctx.lineTo(-14, -14); ctx.quadraticCurveTo(0, -28, 14, -14); ctx.lineTo(14, 11); ctx.stroke();
    ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-12, 6); ctx.lineTo(-12, -13); ctx.quadraticCurveTo(0, -25, 12, -13); ctx.stroke();
    ctx.fillStyle = '#cfe8f8';
    for (const [ix, iy, len] of [[-8, -18, 6], [0, -22, 8], [8, -18, 6]]) {
      ctx.beginPath(); ctx.moveTo(ix - 2, iy); ctx.lineTo(ix, iy + len); ctx.lineTo(ix + 2, iy); ctx.closePath(); ctx.fill();
    }
  } else if (w === 2) {   // obsidian gate, lava-lit
    ctx.fillStyle = '#241c1a';
    ctx.fillRect(-18, -16, 6, 27);
    ctx.fillRect(12, -16, 6, 27);
    ctx.beginPath(); ctx.moveTo(-18, -14); ctx.quadraticCurveTo(0, -32, 18, -14); ctx.lineTo(18, -8); ctx.quadraticCurveTo(0, -25, -18, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA('#ff6a2a', unlocked ? 0.8 : 0.3); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-15, 8); ctx.lineTo(-15, -12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(15, 8); ctx.lineTo(15, -12); ctx.stroke();
    ctx.fillStyle = '#ff8a3a';
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(-3, -24); ctx.lineTo(3, -24); ctx.closePath(); ctx.fill();
  } else if (w === 3) {   // arch of ribs with a skull keystone
    ctx.strokeStyle = '#b8ab8f'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(sd * 15, 11); ctx.quadraticCurveTo(sd * 17, -12, sd * 3, -22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sd * 12, 2); ctx.quadraticCurveTo(sd * 13, -8, sd * 5, -15); ctx.stroke();
    }
    ctx.fillStyle = '#d8cdb4';
    ctx.beginPath(); ctx.arc(0, -23, 5.5, 0, 7); ctx.fill();
    ctx.fillRect(-3, -19.5, 6, 3);
    ctx.fillStyle = '#181018';
    ctx.fillRect(-3.2, -25, 2.4, 2.6); ctx.fillRect(0.8, -25, 2.4, 2.6);
  } else if (w === 4) {   // coral arch, bubbling
    ctx.strokeStyle = '#3f7a70'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 11); ctx.quadraticCurveTo(-15, -16, 0, -25); ctx.quadraticCurveTo(15, -16, 14, 11); ctx.stroke();
    ctx.fillStyle = '#e87a6a';
    for (const [cx2, cy2] of [[-14, -6], [-10, -18], [0, -25], [10, -18], [14, -6]]) {
      ctx.beginPath(); ctx.arc(cx2, cy2, 3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(cx2 + 2.5, cy2 - 2, 1.8, 0, 7); ctx.fill();
    }
    if (unlocked) {
      ctx.strokeStyle = '#bfe8ff88'; ctx.lineWidth = 1;
      const by = 6 - ((t * 7 + w) % 26);
      ctx.beginPath(); ctx.arc(5, by, 2, 0, 7); ctx.stroke();
    }
  } else if (w === 5) {   // one colossal mushroom, hollowed
    ctx.fillStyle = '#7a6a50';
    ctx.fillRect(-15, -14, 5, 25);
    ctx.fillRect(10, -14, 5, 25);
    ctx.fillStyle = '#6adfb8';
    ctx.beginPath();
    ctx.moveTo(-20, -13);
    ctx.quadraticCurveTo(0, -34, 20, -13);
    ctx.quadraticCurveTo(0, -20, -20, -13);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8f4ee';
    for (const [sx, sy] of [[-10, -22], [2, -26], [12, -20]]) {
      ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, 7); ctx.fill();
    }
  } else if (w === 6) {   // wind-carved sandstone arch
    const bands = ['#74603a', '#5c4c2c', '#6a5834'];
    for (let b = 0; b < 3; b++) {
      ctx.strokeStyle = bands[b]; ctx.lineWidth = 6 - b * 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-15 + b, 11);
      ctx.quadraticCurveTo(-16 + b, -14, 0, -24 + b * 2);
      ctx.quadraticCurveTo(16 - b, -14, 15 - b, 11);
      ctx.stroke();
    }
    ctx.fillStyle = '#3a2e18';
    ctx.beginPath(); ctx.ellipse(-13, -4, 2, 3.4, 0.3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -8, 1.8, 3, -0.3, 0, 7); ctx.fill();
  } else if (w === 7) {   // jagged crystal arch
    const glow = unlocked ? 0.85 : 0.4;
    ctx.fillStyle = hexA('#c28aff', glow);
    for (const [bx, by, tx2, ty2, s2] of [[-16, 11, -12, -12, 5], [16, 11, 12, -12, 5], [-12, -12, -4, -22, 4], [12, -12, 4, -22, 4], [-4, -22, 0, -27, 3], [4, -22, 0, -27, 3]]) {
      ctx.beginPath();
      ctx.moveTo(bx - s2, by); ctx.lineTo(tx2, ty2); ctx.lineTo(bx + s2, by);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#f0e2ff';
    ctx.fillRect(-1, -26, 2, 5); ctx.fillRect(-13, -10, 1.6, 6); ctx.fillRect(11.5, -10, 1.6, 6);
  } else if (w === 8) {   // arch of thorned flesh
    ctx.strokeStyle = '#5a2830'; ctx.lineWidth = 5.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-14, 11); ctx.quadraticCurveTo(-16, -14, 0, -24); ctx.quadraticCurveTo(16, -14, 14, 11); ctx.stroke();
    ctx.strokeStyle = hexA('#ff5a6a', 0.4 + Math.max(0, Math.sin(t * 2.6)) * 0.4);
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-14, -12, 0, -21.5); ctx.quadraticCurveTo(14, -12, 13, 8); ctx.stroke();
    ctx.fillStyle = '#3c1418';
    for (const [thx, thy, a] of [[-14, -4, -0.6], [-10, -15, -0.3], [10, -15, 0.3], [14, -4, 0.6]]) {
      ctx.save(); ctx.translate(thx, thy); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(0, -7); ctx.lineTo(2, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  } else if (w === 10) {  // gilded marble arch wreathed in cloud
    ctx.fillStyle = '#dde4ee';   // marble pillars
    for (const sd of [-1, 1]) {
      const g2 = ctx.createLinearGradient(sd * 17 - 3, 0, sd * 17 + 3, 0);
      g2.addColorStop(0, '#aab4c8'); g2.addColorStop(0.5, '#f6f9fd'); g2.addColorStop(1, '#aab4c8');
      ctx.fillStyle = g2;
      ctx.fillRect(sd * 17 - 3, -16, 6, 27);
      ctx.fillStyle = '#ffd76a';   // gold capitals & bases
      ctx.fillRect(sd * 17 - 4, -18, 8, 3);
      ctx.fillRect(sd * 17 - 4, 8, 8, 3);
    }
    ctx.strokeStyle = '#f6f9fd'; ctx.lineWidth = 4; ctx.lineCap = 'round';   // marble arch
    ctx.beginPath(); ctx.moveTo(-16, -16); ctx.quadraticCurveTo(0, -30, 16, -16); ctx.stroke();
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.4;   // gilt trim
    ctx.beginPath(); ctx.moveTo(-15, -18); ctx.quadraticCurveTo(0, -31.5, 15, -18); ctx.stroke();
    ctx.fillStyle = '#ffd76a';   // sun-disc keystone
    ctx.beginPath(); ctx.arc(0, -26, 3.4, 0, 7); ctx.fill();
    ctx.strokeStyle = hexA('#ffd76a', 0.7); ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + t * 0.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * 4.4, -26 + Math.sin(a) * 4.4);
      ctx.lineTo(Math.cos(a) * 6.4, -26 + Math.sin(a) * 6.4); ctx.stroke();
    }
    ctx.fillStyle = '#ffffffcc';   // clouds drifting through the arch
    const cdx = Math.sin(t * 0.8 + w) * 3;
    ctx.beginPath(); ctx.ellipse(-11 + cdx, -8, 7, 3, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12 - cdx, 3, 6, 2.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(2 + cdx, -19, 5, 2.2, 0, 0, 7); ctx.fill();
  } else if (w === 11) {  // blast-door gantry, neon-lit
    ctx.fillStyle = '#343b46';   // steel uprights
    ctx.fillRect(-19, -16, 7, 27);
    ctx.fillRect(12, -16, 7, 27);
    ctx.strokeStyle = '#12151a'; ctx.lineWidth = 1;
    ctx.strokeRect(-19, -16, 7, 27); ctx.strokeRect(12, -16, 7, 27);
    ctx.fillStyle = '#5a6472';   // rivets
    for (const sd of [-1, 1]) for (let k = 0; k < 3; k++) {
      ctx.beginPath(); ctx.arc(sd * 15.5, -12 + k * 10, 1.3, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#262c34';   // lintel with hazard chevrons
    ctx.fillRect(-19, -25, 38, 9);
    ctx.strokeStyle = '#12151a'; ctx.strokeRect(-19, -25, 38, 9);
    ctx.fillStyle = '#e8c05a';
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.moveTo(-16 + k * 8, -17); ctx.lineTo(-12 + k * 8, -24);
      ctx.lineTo(-9 + k * 8, -24); ctx.lineTo(-13 + k * 8, -17);
      ctx.closePath(); ctx.fill();
    }
    const neon = unlocked ? 0.6 + Math.sin(t * 3) * 0.3 : 0.22;   // neon door frame
    ctx.strokeStyle = hexA('#4affd4', neon); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-11, 10); ctx.lineTo(-11, -15); ctx.lineTo(11, -15); ctx.lineTo(11, 10); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 4) > 0 ? '#ff5a3a' : '#4a1a12';   // warning beacons
    ctx.beginPath(); ctx.arc(-15.5, -20.5, 1.6, 0, 7); ctx.fill();
    ctx.fillStyle = Math.sin(t * 4) > 0 ? '#4a1a12' : '#ff5a3a';
    ctx.beginPath(); ctx.arc(15.5, -20.5, 1.6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#5a6472'; ctx.lineWidth = 1.4;   // antenna mast
    ctx.beginPath(); ctx.moveTo(16, -25); ctx.lineTo(18, -33); ctx.stroke();
    ctx.fillStyle = hexA('#4affd4', 0.4 + Math.max(0, Math.sin(t * 2.2)) * 0.5);
    ctx.beginPath(); ctx.arc(18, -34, 1.5, 0, 7); ctx.fill();
  } else {                // two floating void monoliths
    const hover = Math.sin(t * 1.4) * 1.5;
    ctx.fillStyle = '#0e0e16';
    ctx.strokeStyle = hexA('#8a9aff', unlocked ? 0.8 : 0.35); ctx.lineWidth = 1.2;
    ctx.fillRect(-17, -16 + hover, 6, 24); ctx.strokeRect(-17, -16 + hover, 6, 24);
    ctx.fillRect(11, -16 - hover, 6, 24); ctx.strokeRect(11, -16 - hover, 6, 24);
    ctx.fillRect(-6, -28 + hover * 0.5, 12, 5); ctx.strokeRect(-6, -28 + hover * 0.5, 12, 5);
    ctx.fillStyle = hexA('#c8d2ff', 0.6);
    ctx.fillRect(-14.5, -8 + hover, 1.4, 1.4); ctx.fillRect(13.5, -2 - hover, 1.4, 1.4);
  }
  // chains & lock over sealed gates
  if (!unlocked) {
    ctx.strokeStyle = '#6a6a72'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(14, 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 2); ctx.lineTo(14, -10); ctx.stroke();
    ctx.fillStyle = '#8a8a92';
    ctx.fillRect(-4, -8, 8, 7);
    ctx.strokeStyle = '#8a8a92'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -8, 3, Math.PI, 0); ctx.stroke();
    ctx.fillStyle = '#3a3a42';
    ctx.fillRect(-1, -6, 2, 3);
  }
  ctx.restore();
  if (label) {
    ctx.font = '10.5px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = unlocked ? '#c9b98a' : '#6a6a72';
    ctx.fillText((unlocked ? '' : '🔒 ') + WORLDS[w].name, x, y - 36 * s);
  }
}

function drawObelisk(o) {
  const t = G.time;
  const pulse = 0.5 + Math.sin(t * 2.2) * 0.25;
  ctx.fillStyle = '#00000060';
  ctx.beginPath(); ctx.ellipse(o.x, o.y + 8, 14, 5, 0, 0, 7); ctx.fill();
  // violet halo
  const g = ctx.createRadialGradient(o.x, o.y - 18, 0, o.x, o.y - 18, 32);
  g.addColorStop(0, hexA('#b86adf', 0.3 * pulse + 0.1));
  g.addColorStop(1, hexA('#b86adf', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(o.x, o.y - 18, 32, 0, 7); ctx.fill();
  // the monolith
  const mg = ctx.createLinearGradient(o.x - 8, 0, o.x + 8, 0);
  mg.addColorStop(0, '#241a30'); mg.addColorStop(0.5, '#4a3a5e'); mg.addColorStop(1, '#1a1224');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(o.x - 9, o.y + 8);
  ctx.lineTo(o.x - 6, o.y - 34);
  ctx.lineTo(o.x, o.y - 42);
  ctx.lineTo(o.x + 6, o.y - 34);
  ctx.lineTo(o.x + 9, o.y + 8);
  ctx.closePath(); ctx.fill();
  // glowing runes
  ctx.fillStyle = hexA('#d9a8ff', 0.5 + pulse * 0.5);
  for (const [rx, ry] of [[0, -32], [-2, -22], [2, -13], [-1, -4]]) {
    ctx.fillRect(o.x + rx - 1.5, o.y + ry, 3, 5);
  }
  if (Math.random() < 0.15) G.parts.push({ x: o.x + rand(-6, 6), y: o.y - rand(0, 34), vx: rand(-4, 4), vy: rand(-18, -8), r: rand(1, 2), color: '#b86adf', life: 0.5, glow: true });
  ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText('🌀 Rift Obelisk', o.x, o.y - 52);
}

function drawNpc(n) {
  const t = G.time, bob = Math.sin(t * 1.8 + (n.id === 'elder' ? 2 : 0)) * 0.8;
  ctx.fillStyle = '#00000066';
  ctx.beginPath(); ctx.ellipse(n.x, n.y + 12, 11, 4.5, 0, 0, 7); ctx.fill();
  if (n.id === 'elder') {
    /* Elder Maro: bent back, long white beard, cane and a heavy book */
    const g = ctx.createLinearGradient(n.x, n.y - 10, n.x, n.y + 12);
    g.addColorStop(0, '#5c5244'); g.addColorStop(1, '#38322a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(n.x - 8, n.y + 12);
    ctx.quadraticCurveTo(n.x - 9, n.y - 5 + bob, n.x + 1, n.y - 9 + bob);   // hunched forward
    ctx.quadraticCurveTo(n.x + 9, n.y - 5 + bob, n.x + 8, n.y + 12);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8b890';
    ctx.beginPath(); ctx.arc(n.x + 2.5, n.y - 12 + bob, 4.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(n.x + 1, n.y - 13 + bob, 1.4, 1.4); ctx.fillRect(n.x + 4, n.y - 13 + bob, 1.4, 1.4);
    ctx.fillStyle = '#e8e4da';   // the beard
    ctx.beginPath();
    ctx.moveTo(n.x - 1, n.y - 10 + bob);
    ctx.quadraticCurveTo(n.x + 2, n.y - 1 + bob, n.x + 1, n.y + 4 + bob);
    ctx.quadraticCurveTo(n.x + 5, n.y - 2 + bob, n.x + 6, n.y - 9 + bob);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8a8070';   // bald pate wisps
    ctx.beginPath(); ctx.arc(n.x - 0.5, n.y - 14.5 + bob, 2, Math.PI * 0.9, Math.PI * 1.9); ctx.fill();
    ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2;   // cane
    ctx.beginPath(); ctx.moveTo(n.x + 9, n.y - 6 + bob); ctx.lineTo(n.x + 11, n.y + 11); ctx.stroke();
    ctx.fillStyle = '#7a2c1a';   // tome under the other arm
    ctx.fillRect(n.x - 12, n.y - 4 + bob, 7, 9);
    ctx.fillStyle = '#c9a45a';
    ctx.fillRect(n.x - 12, n.y - 4 + bob, 7, 1.6);
    ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c9b98a';
    ctx.fillText('📜 Elder Maro', n.x, n.y - 28);
  } else {
    /* Sister Amara: pale robes, red sash, softly glowing censer */
    const g = ctx.createLinearGradient(n.x, n.y - 10, n.x, n.y + 12);
    g.addColorStop(0, '#d8d2c4'); g.addColorStop(1, '#a8a294');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(n.x - 8, n.y + 12);
    ctx.quadraticCurveTo(n.x - 9, n.y - 7 + bob, n.x, n.y - 10 + bob);
    ctx.quadraticCurveTo(n.x + 9, n.y - 7 + bob, n.x + 8, n.y + 12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a3130b'; ctx.lineWidth = 2;   // sash
    ctx.beginPath(); ctx.moveTo(n.x - 5, n.y - 2 + bob); ctx.quadraticCurveTo(n.x, n.y + bob, n.x + 5, n.y - 2 + bob); ctx.stroke();
    // wimple + face
    ctx.fillStyle = '#e8e4da';
    ctx.beginPath(); ctx.arc(n.x, n.y - 13 + bob, 5.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#d8b890';
    ctx.beginPath(); ctx.arc(n.x + 0.6, n.y - 12.4 + bob, 3.6, 0, 7); ctx.fill();
    ctx.fillStyle = '#20140a';
    ctx.fillRect(n.x - 1, n.y - 13 + bob, 1.3, 1.3); ctx.fillRect(n.x + 1.8, n.y - 13 + bob, 1.3, 1.3);
    // swinging censer sheds warm light
    const ca = Math.sin(t * 2.2) * 0.35;
    ctx.strokeStyle = '#c9a45a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(n.x + 8, n.y - 6 + bob); ctx.lineTo(n.x + 8 + Math.sin(ca) * 8, n.y + 2 + Math.cos(ca) * 4); ctx.stroke();
    const cx2 = n.x + 8 + Math.sin(ca) * 8, cy2 = n.y + 3 + Math.cos(ca) * 4;
    ctx.fillStyle = '#c9a45a';
    ctx.beginPath(); ctx.arc(cx2, cy2, 2.6, 0, 7); ctx.fill();
    ctx.fillStyle = hexA('#ffd76a', 0.5 + Math.sin(t * 5) * 0.2);
    ctx.beginPath(); ctx.arc(cx2, cy2, 4.5, 0, 7); ctx.fill();
    if (Math.random() < 0.08) G.parts.push({ x: cx2, y: cy2 - 2, vx: rand(-3, 3), vy: rand(-12, -6), r: rand(1, 1.8), color: '#ffd76a', life: 0.6, glow: true });
    ctx.font = '11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c9b98a';
    ctx.fillText('✚ Sister Amara', n.x, n.y - 28);
  }
}

function drawQuestNpc(n) {
  const t = G.time, bob = Math.sin(t * 2 + n.w) * 0.8;
  const q = QUESTS[n.w], st = questState(n.w);
  const acc = WORLDS[n.w].pal.acc;
  ctx.fillStyle = '#00000066';
  ctx.beginPath(); ctx.ellipse(n.x, n.y + 12, 11, 4.5, 0, 0, 7); ctx.fill();
  // travel-worn cloak trimmed in the realm's colors
  const g = ctx.createLinearGradient(n.x, n.y - 10, n.x, n.y + 12);
  g.addColorStop(0, '#6a5a44'); g.addColorStop(1, '#42382c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(n.x - 8, n.y + 12);
  ctx.quadraticCurveTo(n.x - 9, n.y - 7 + bob, n.x, n.y - 10 + bob);
  ctx.quadraticCurveTo(n.x + 9, n.y - 7 + bob, n.x + 8, n.y + 12);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = acc; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(n.x - 7.4, n.y + 10); ctx.quadraticCurveTo(n.x, n.y + 12, n.x + 7.4, n.y + 10); ctx.stroke();
  // bulging backpack
  ctx.fillStyle = '#5a4226';
  ctx.beginPath(); ctx.ellipse(n.x - 8.5, n.y - 3 + bob, 5, 7, 0.25, 0, 7); ctx.fill();
  ctx.strokeStyle = '#3c2c1a'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(n.x - 12, n.y - 7 + bob); ctx.lineTo(n.x - 5, n.y - 8 + bob); ctx.stroke();
  // hooded face
  ctx.fillStyle = '#57431f';
  ctx.beginPath(); ctx.arc(n.x - 0.5, n.y - 14 + bob, 5.7, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8b890';
  ctx.beginPath(); ctx.arc(n.x + 1.2, n.y - 13.3 + bob, 3.7, 0, 7); ctx.fill();
  ctx.fillStyle = '#20140a';
  ctx.fillRect(n.x - 0.5, n.y - 13.9 + bob, 1.5, 1.5); ctx.fillRect(n.x + 2.2, n.y - 13.9 + bob, 1.5, 1.5);
  // walking staff
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(n.x + 8.5, n.y + 11); ctx.lineTo(n.x + 10, n.y - 13 + bob); ctx.stroke();
  // quest indicator: gold ! when there's business, grey … while working
  ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!st || st.s === 'done') {
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('❗', n.x, n.y - 30 + Math.sin(t * 3.4) * 2);
  } else if (st.s === 'active') {
    ctx.fillStyle = '#9a8a68';
    ctx.fillText('…', n.x, n.y - 29);
  }
  ctx.font = '11px Georgia';
  ctx.fillStyle = '#c9b98a';
  ctx.fillText('🎒 ' + q.npc, n.x, n.y - 42);
}

function drawSatchel(s) {
  const t = G.time, bob = Math.sin(t * 2.6) * 1.5;
  ctx.fillStyle = '#00000055';
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 6, 10, 4, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(s.x, s.y - 6, 0, s.x, s.y - 6, 22);
  g.addColorStop(0, hexA('#e8d45a', 0.3 + Math.sin(t * 3) * 0.12));
  g.addColorStop(1, hexA('#e8d45a', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(s.x, s.y - 6, 22, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a4a26';
  ctx.beginPath();
  ctx.moveTo(s.x - 8, s.y + 4 + bob * 0.3);
  ctx.quadraticCurveTo(s.x - 9, s.y - 8 + bob * 0.3, s.x, s.y - 9 + bob * 0.3);
  ctx.quadraticCurveTo(s.x + 9, s.y - 8 + bob * 0.3, s.x + 8, s.y + 4 + bob * 0.3);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a6a3c';   // flap & buckle
  ctx.beginPath(); ctx.ellipse(s.x, s.y - 6 + bob * 0.3, 8, 4, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#c9a45a';
  ctx.fillRect(s.x - 1.5, s.y - 5 + bob * 0.3, 3, 5);
  ctx.font = '10.5px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8d45a';
  ctx.fillText('the lost satchel', s.x, s.y - 22);
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
  // high-rarity loot pings
  for (const dr of G.drops) {
    if (dr.kind !== 'item' || dr.item.g || dr.item.rarity === 'common' || dr.item.rarity === 'magic') continue;
    mmCtx.fillStyle = rarityColor(dr.item.rarity);
    mmCtx.fillRect(dr.x / TILE * s - 1.5, dr.y / TILE * s - 1.5, 3, 3);
  }
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
  $('charBadge').classList.toggle('hidden', !G || (G.p.statPts <= 0 && (G.p.skillPts || 0) <= 0));
}

/* panels */
function anyPanelOpen() {
  return ['charPanel', 'invPanel', 'pausePanel', 'wpPanel', 'shopPanel', 'stashPanel', 'riftPanel', 'stablePanel', 'stairsPanel', 'npcPanel', 'fusePanel'].some(id => !$(id).classList.contains('hidden')) || !$('itemPopup').classList.contains('hidden');
}
function closePanels() {
  ['charPanel', 'invPanel', 'pausePanel', 'wpPanel', 'shopPanel', 'stashPanel', 'riftPanel', 'stablePanel', 'stairsPanel', 'npcPanel', 'fusePanel', 'itemPopup'].forEach(id => $(id).classList.add('hidden'));
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
    if (id === 'riftPanel') renderRift();
    if (id === 'stablePanel') renderStable();
    if (id === 'stairsPanel') renderStairs();
    if (id === 'npcPanel') renderNpc(G.talkNpc);
    if (id === 'fusePanel') renderFuse();
    paused = true;
  }
}

function renderStairs() {
  const items = G.drops.filter(d => d.kind === 'item').length;
  const gold = G.drops.filter(d => d.kind === 'gold').length;
  const pots = G.drops.length - items - gold;
  const bits = [];
  if (items) bits.push(items + ' item' + (items > 1 ? 's' : ''));
  if (gold) bits.push(gold + ' gold pile' + (gold > 1 ? 's' : ''));
  if (pots) bits.push(pots + ' potion' + (pots > 1 ? 's' : ''));
  const leaving = G.cowLevel || G.rift || G.petLair;   // these stairs lead back to town
  const up = G.stairsDir === 'up';
  $('stairsPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">${leaving ? '🌀 Return to town?' : up ? '⬆ Climb back up?' : '⬇ Descend?'}</div>
    <div class="derived" style="text-align:center; font-size:14px">
      Still lying on this floor:<br><b style="color:#e8c14d">${bits.join(' · ')}</b><br>
      Loot left behind is lost forever.
    </div>
    <div class="invactions" style="margin-top:12px">
      <button class="smallbtn" data-stay>↩ Stay & collect</button>
      <button class="smallbtn" data-descend style="border-color:#d9c65a">${leaving ? '🌀 Leave anyway' : up ? '⬆ Climb anyway' : '⬇ Descend anyway'}</button>
    </div>`;
  const stay = () => {
    G.stairsHold = true;
    G.p.moveTo = null; G.p.path = null;
    closePanels();
  };
  $('stairsPanel').querySelector('[data-close]').addEventListener('click', stay);
  $('stairsPanel').querySelector('[data-stay]').addEventListener('click', stay);
  $('stairsPanel').querySelector('[data-descend]').addEventListener('click', () => {
    closePanels();
    enterLevel(G.cowLevel || G.rift || G.petLair ? 0 : up ? G.dlvl - 1 : G.dlvl + 1, false);
  });
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
      <button class="smallbtn" data-buypet="${i}" ${p.gold < stablePrice(pet) || p.pets.length >= 8 ? 'disabled' : ''}>${stablePrice(pet)}g${bestiaryTier >= 1 ? ' <small style="color:#7adf6a">−25%</small>' : ''}</button>
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
    if (!pet || p.gold < stablePrice(pet) || p.pets.length >= 8) return;
    p.gold -= stablePrice(pet);
    p.pets.push(pet);
    recordBestiary(pet);
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
    saveStash(s2); recalc(); saveDirty = true; sfx.pickup(); renderStash();
  }));
  $('stashPanel').querySelectorAll('[data-bg]').forEach(b => b.addEventListener('click', () => {
    const s2 = loadStash(), it = p.inv[+b.dataset.bg];
    if (!it || s2.length >= STASH_MAX) return;
    p.inv.splice(+b.dataset.bg, 1);
    s2.push(it);
    saveStash(s2); recalc(); saveDirty = true; sfx.pickup(); renderStash();
  }));
  $('stashPanel').querySelector('[data-all-in]').addEventListener('click', () => {
    const s2 = loadStash();
    while (p.inv.length && s2.length < STASH_MAX) s2.push(p.inv.shift());
    saveStash(s2); recalc(); saveDirty = true; sfx.gold(); renderStash();
  });
  $('stashPanel').querySelector('[data-all-out]').addEventListener('click', () => {
    const s2 = loadStash();
    while (s2.length && p.inv.length < p.bagSlots) p.inv.push(s2.shift());
    saveStash(s2); recalc(); saveDirty = true; sfx.gold(); renderStash();
  });
}

function renderNpc(id) {
  const p = G.p;
  if (id === 'quest') { renderQuestDialog(); return; }
  if (id === 'healer') {
    // Amara mends you the moment you approach
    const healed = p.hp < G.d.maxHp - 0.5 || p.mp < G.d.maxMp - 0.5;
    p.hp = G.d.maxHp; p.mp = G.d.maxMp;
    if (healed) { spark(p.x, p.y - 10, '#ffd76a', 14, 160); sfx.potion(); updateHUD(); }
    const cost = 150 + p.level * 30;
    $('npcPanel').innerHTML = `
      <button class="pclose" data-close>✕</button>
      <div class="ptitle">✚ Sister Amara</div>
      <div class="derived" style="text-align:center; font-size:14px">
        ${healed ? '“Be still — there. Whole again.”' : '“The light finds nothing to mend. Walk carefully anyway.”'}
      </div>
      <div class="invactions" style="flex-direction:column">
        <button class="smallbtn" data-bless ${p.gold < cost || G.blessPending ? 'disabled' : ''}>
          ✨ Blessing for the road (${cost}g)${G.blessPending ? ' — already blessed' : ''}</button>
      </div>
      <div class="derived" style="text-align:center">A blessing grants +40% damage and +50% armor for your first
      90 seconds beyond a gate.</div>`;
    $('npcPanel').querySelector('[data-close]').addEventListener('click', closePanels);
    const bb = $('npcPanel').querySelector('[data-bless]');
    bb.addEventListener('click', () => {
      if (p.gold < cost || G.blessPending) return;
      p.gold -= cost;
      G.blessPending = 90;
      banner('✨ Amara\'s blessing settles over you');
      sfx.level(); updateHUD(); saveDirty = true;
      renderNpc('healer');
    });
  } else {
    G.elderLine = (G.elderLine === undefined ? Math.floor(Math.random() * ELDER_LINES.length) : G.elderLine);
    $('npcPanel').innerHTML = `
      <button class="pclose" data-close>✕</button>
      <div class="ptitle">📜 Elder Maro</div>
      <div class="derived" style="text-align:center; font-size:14px; font-style:italic; line-height:1.6">
        “${ELDER_LINES[G.elderLine]}”
      </div>
      <div class="invactions">
        <button class="smallbtn" data-more>Ask for more</button>
        <button class="smallbtn" data-close>Farewell</button>
      </div>`;
    $('npcPanel').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
    $('npcPanel').querySelector('[data-more]').addEventListener('click', () => {
      G.elderLine = (G.elderLine + 1) % ELDER_LINES.length;
      renderNpc('elder');
    });
  }
}

function renderQuestDialog() {
  const p = G.p, w = worldOf(G.dlvl), q = QUESTS[w];
  G.quests = G.quests || {};
  const st = G.quests[w];
  let body = '', buttons = '';
  if (!st) {
    body = '“' + q.ask + '”';
    buttons = `<button class="smallbtn" data-accept>🤝 I\'ll do it</button>
               <button class="smallbtn" data-close>Not now</button>`;
  } else if (st.s === 'active') {
    if (q.type === 'cull') {
      body = '“How goes the hunt?”<br><b style="color:#e8d45a">' + (st.n || 0) + ' / ' + q.count + '</b> slain on these floors.';
    } else if (q.type === 'gems') {
      const have = questGems(q).length;
      body = '“Have you the ' + (q.quality === 2 ? 'Flawless ' : '') + 'gems?”<br>You carry <b style="color:#e8d45a">' +
        have + ' / ' + q.count + '</b> that would do.';
      if (have >= q.count) buttons = `<button class="smallbtn" data-gems>💎 Hand over ${q.count} gems</button>`;
    } else {
      body = '“My satchel lies on <b>floor ' + (WORLD_START(w) + q.floorOff) + '</b>. I can still hear it, faintly.”';
    }
    buttons += '<button class="smallbtn" data-close>Farewell</button>';
  } else if (st.s === 'done') {
    body = '“' + q.thanks + '”';
    buttons = `<button class="smallbtn" data-claim>🎁 Claim reward</button>`;
  } else {
    body = '“Safe roads, friend. I\'ll not forget what you did here.”';
    buttons = '<button class="smallbtn" data-close>Farewell</button>';
  }
  $('npcPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🎒 ${q.npc}</div>
    <div class="derived" style="text-align:center; font-size:14px; font-style:italic; line-height:1.6">${body}</div>
    <div class="invactions">${buttons}</div>`;
  $('npcPanel').querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closePanels));
  const acceptBtn = $('npcPanel').querySelector('[data-accept]');
  if (acceptBtn) acceptBtn.addEventListener('click', () => {
    G.quests[w] = { s: 'active', n: 0 };
    banner('📜 Quest accepted: ' + q.npc);
    if (q.type === 'satchel') ftext(p.x, p.y - 34, 'the satchel lies on floor ' + (WORLD_START(w) + q.floorOff), '#e8d45a', 12);
    sfx.pickup(); saveDirty = true;
    renderQuestDialog();
  });
  const gemsBtn = $('npcPanel').querySelector('[data-gems]');
  if (gemsBtn) gemsBtn.addEventListener('click', () => {
    const give = questGems(q).slice(0, q.count);
    if (give.length < q.count) return;
    for (const g of give) p.inv.splice(p.inv.indexOf(g), 1);
    G.quests[w].s = 'claimed';
    questReward(w);
    saveDirty = true; updateHUD();
    renderQuestDialog();
  });
  const claimBtn = $('npcPanel').querySelector('[data-claim]');
  if (claimBtn) claimBtn.addEventListener('click', () => {
    G.quests[w].s = 'claimed';
    questReward(w);
    saveDirty = true; updateHUD();
    renderQuestDialog();
  });
}

function renderFuse() {
  const p = G.p;
  const groups = fusableGroups(p.inv);
  const rows = groups.map((g, i) => `
    <button class="smallbtn" data-fuserow="${i}" style="width:100%">
      ${g.result.icon} 3× <span class="rc-${p.inv[g.idx[0]].rarity}">${g.from}</span>
      &nbsp;→&nbsp; <span class="rc-${g.result.rarity}">${g.result.name}</span>
    </button>`).join('');
  $('fusePanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">⚗ Gem Fusion</div>
    <div class="invactions" style="flex-direction:column">
      ${rows || '<div class="derived" style="text-align:center">Nothing left to fuse — gather three of a kind.</div>'}
    </div>
    ${groups.length ? '<div class="invactions"><button class="smallbtn" data-fuseall2>⚡ Fuse all</button></div>' : ''}
    <div class="derived" style="text-align:center">Three of a kind climb the ladder: Chipped → Gem → Flawless,<br>
    then Flawless grades ascend all the way to <span class="rc-exotic">Celestial</span>.</div>`;
  $('fusePanel').querySelector('[data-close]').addEventListener('click', closePanels);
  const fa = $('fusePanel').querySelector('[data-fuseall2]');
  if (fa) fa.addEventListener('click', () => {
    const { count, finest } = fuseAll(p);
    if (!count) return;
    banner('⚗ ' + count + ' fusion' + (count > 1 ? 's' : '') + ' — finest: ' + finest.name);
    spark(p.x, p.y - 10, fuseColor(finest), 16, 200);
    sfx.level(); recalc(); saveDirty = true;
    renderFuse();
  });
  $('fusePanel').querySelectorAll('[data-fuserow]').forEach(b => b.addEventListener('click', () => {
    const g = groups[+b.dataset.fuserow];
    if (!g) return;
    for (let k = g.idx.length - 1; k >= 0; k--) p.inv.splice(g.idx[k], 1);
    p.inv.push(g.result);
    banner('⚗ ' + g.result.name + ' — fused!');
    spark(p.x, p.y - 10, fuseColor(g.result), 14, 180);
    sfx.level(); recalc(); saveDirty = true; updateHUD();
    renderFuse();   // stay open for chain-fusing up the ladder
  }));
}

function renderRift() {
  const max = G.maxRiftTier || 1;
  const best = G.riftBest || {};
  const rows = [];
  for (let t = 1; t <= max; t++) {
    rows.push(`<button class="smallbtn" data-rift="${t}">🌀 Tier ${t} <small>· foes lvl ${riftDepth(t)}${best[t] ? ' · best ' + fmtTime(best[t]) : ''}</small></button>`);
  }
  $('riftPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🌀 Rift Obelisk</div>
    <div class="invactions" style="flex-direction:column">${rows.join('')}</div>
    <div class="derived" style="text-align:center">
      A rift is a single timed floor: slay enough denizens to summon the
      Rift Guardian, then fell it before ${fmtTime(RIFT_TIME)} runs out.<br>
      Conquer your highest tier to unlock the next.
    </div>`;
  $('riftPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('riftPanel').querySelectorAll('[data-rift]').forEach(b => b.addEventListener('click', () => {
    closePanels();
    enterRift(+b.dataset.rift);
  }));
}

function renderWp() {
  const dests = [0, ...G.waypoints.filter(w => w > 0).sort((a, b) => a - b)];
  const nameOf = d => d === 0 ? '⛺ Sanctuary Town'
    : WORLDS[worldOf(d)].name + ' · Floor ' + worldFloor(d) + '/25';
  const ret = G.anchor && G.anchor.dlvl !== G.dlvl
    ? `<button class="smallbtn" data-portal-return style="border-color:#5ab0ff">🌀 Return through portal — Floor ${G.anchor.dlvl}</button>`
    : (G.portalFloor && G.portalFloor !== G.dlvl && !dests.includes(G.portalFloor)
      ? `<button class="smallbtn" data-wp="${G.portalFloor}" style="border-color:#5ab0ff">🌀 Return to Floor ${G.portalFloor}</button>` : '');
  $('wpPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">🌀 Waypoint</div>
    <div class="invactions" style="flex-direction:column">
      ${ret}
      ${dests.map(d => `<button class="smallbtn" data-wp="${d}" ${d === G.dlvl ? 'disabled' : ''}>${nameOf(d)}${d === G.dlvl ? ' (here)' : ''}</button>`).join('')}
    </div>
    <div class="derived" style="text-align:center">A waypoint awakens on every 5th floor of a realm (5, 10, 15…).<br>Step on one to bind it forever.</div>`;
  $('wpPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  $('wpPanel').querySelectorAll('[data-wp]').forEach(b => b.addEventListener('click', () => {
    const d = +b.dataset.wp;
    closePanels();
    if (d !== G.dlvl) enterLevel(d, false);
  }));
  const prBtn = $('wpPanel').querySelector('[data-portal-return]');
  if (prBtn) prBtn.addEventListener('click', () => { closePanels(); returnThroughPortal(); });
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
  const mercHtml = !G.merc
    ? `<div class="invactions"><button class="smallbtn" data-hire ${p.gold < MERC_HIRE_COST ? 'disabled' : ''}>🛡 Hire Mercenary (${MERC_HIRE_COST}g)</button></div>`
    : `<div class="derived" style="text-align:center">🛡 Mercenary${G.merc.alive ? '' : ' — <span style="color:#ff8a7a">fallen</span>'}
        · ⚔ ${G.merc.weapon ? G.merc.weapon.name : 'bare hands'} · 🥋 ${G.merc.armor ? G.merc.armor.name : 'no armor'}<br>
        <small>Hand them weapons & armor from your inventory.</small></div>` +
      (!G.merc.alive ? `<div class="invactions"><button class="smallbtn" data-revive ${p.gold < mercReviveCost() ? 'disabled' : ''}>⛑ Revive Mercenary (${mercReviveCost()}g)</button></div>` : '');
  $('shopPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">⚖ Merchant · 🪙 ${p.gold}</div>
    <div class="invactions">
      <button class="smallbtn" data-pot="hp" ${p.gold < potCost || p.challenge === 'ascetic' ? 'disabled' : ''}>🧪 Potion (${potCost}g)</button>
      <button class="smallbtn" data-pot="mp" ${p.gold < potCost || p.challenge === 'ascetic' ? 'disabled' : ''}>🔮 Potion (${potCost}g)</button>
    </div>
    ${mercHtml}
    ${rows || '<div class="derived" style="text-align:center">Sold out — return after your next descent.</div>'}
    <div class="derived" style="text-align:center">Sell your loot from the inventory 🎒</div>`;
  $('shopPanel').querySelector('[data-close]').addEventListener('click', closePanels);
  const hireBtn = $('shopPanel').querySelector('[data-hire]');
  if (hireBtn) hireBtn.addEventListener('click', () => {
    if (p.gold < MERC_HIRE_COST || G.merc) return;
    p.gold -= MERC_HIRE_COST;
    G.merc = { alive: true, weapon: null, armor: null };
    G.minions.push(makeMercEntity());
    banner('🛡 A mercenary joins you!');
    sfx.level(); renderShop(); updateHUD(); saveDirty = true;
  });
  const revBtn = $('shopPanel').querySelector('[data-revive]');
  if (revBtn) revBtn.addEventListener('click', () => {
    if (!G.merc || G.merc.alive || p.gold < mercReviveCost()) return;
    p.gold -= mercReviveCost();
    G.merc.alive = true;
    G.minions.push(makeMercEntity());
    banner('⛑ Your mercenary stands again!');
    sfx.level(); renderShop(); updateHUD(); saveDirty = true;
  });
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
  const skillRow = (sk, i) => {
    const locked = p.level < (sk.lvl || 1);
    const rank = skillRank(p, i);
    return `<div class="statrow"><span class="sname">${sk.icon} ${sk.name}${locked ? ` <small>(lvl ${sk.lvl})</small>` : ''}</span>
      <span class="sval">${locked ? '—' : rank + '/' + SKILL_MAX}</span>
      <button class="statbtn" data-skill="${i}" ${p.skillPts <= 0 || locked || rank >= SKILL_MAX ? 'disabled' : ''}>+</button></div>`;
  };
  const passiveRow = (pa, i) => {
    const rank = (p.passives && p.passives[i]) || 0;
    return `<div class="statrow"><span class="sname">${pa.icon} ${pa.name} <small>· ${pa.desc}</small></span>
      <span class="sval">${rank}/${PASSIVE_MAX}</span>
      <button class="statbtn" data-passive="${i}" ${p.skillPts <= 0 || rank >= PASSIVE_MAX ? 'disabled' : ''}>+</button></div>`;
  };
  const spent = p.skillLvls.reduce((a, r) => a + (r - 1), 0) + p.passives.reduce((a, r) => a + r, 0);
  const respecCost = 100 * p.level;
  $('charPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">${c.icon} ${c.name} — Level ${p.level}</div>
    <div class="ptsleft">${p.statPts > 0 ? p.statPts + ' stat points to spend' : 'No stat points to spend'}</div>
    ${row('str', 'Strength')}${row('dex', 'Dexterity')}${row('vit', 'Vitality')}${row('ene', 'Energy')}
    <div class="ptsleft" style="margin-top:10px">${p.skillPts > 0 ? p.skillPts + ' skill points to spend' : 'No skill points to spend'}</div>
    ${c.skills.map(skillRow).join('')}
    ${PASSIVES[p.cls].map(passiveRow).join('')}
    ${spent > 0 ? `<div class="invactions"><button class="smallbtn" data-respec ${p.gold < respecCost ? 'disabled' : ''}>♻ Respec skills (${respecCost}g)</button></div>` : ''}
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
  $('charPanel').querySelectorAll('[data-stat]').forEach(b => b.addEventListener('click', () => {
    if (G.p.statPts <= 0) return;
    G.p.statPts--; G.p.stats[b.dataset.stat]++;
    recalc(); renderChar(); updateBadge(); updateHUD(); saveDirty = true;
  }));
  $('charPanel').querySelectorAll('[data-skill]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.skill, sk = c.skills[i];
    if (p.skillPts <= 0 || p.level < (sk.lvl || 1) || skillRank(p, i) >= SKILL_MAX) return;
    p.skillPts--; p.skillLvls[i]++;
    sfx.pickup(); recalc(); renderChar(); updateBadge(); updateHUD(); saveDirty = true;
  }));
  $('charPanel').querySelectorAll('[data-passive]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.passive;
    if (p.skillPts <= 0 || (p.passives[i] || 0) >= PASSIVE_MAX) return;
    p.skillPts--; p.passives[i] = (p.passives[i] || 0) + 1;
    sfx.pickup(); recalc(); renderChar(); updateBadge(); updateHUD(); saveDirty = true;
  }));
  const respecBtn = $('charPanel').querySelector('[data-respec]');
  if (respecBtn) respecBtn.addEventListener('click', () => {
    if (p.gold < respecCost) return;
    p.gold -= respecCost;
    p.skillPts += p.skillLvls.reduce((a, r) => a + (r - 1), 0) + p.passives.reduce((a, r) => a + r, 0);
    p.skillLvls = [1, 1, 1, 1]; p.passives = [0, 0];
    banner('Skills reset — points refunded');
    sfx.level(); recalc(); renderChar(); updateBadge(); updateHUD(); saveDirty = true;
  });
  $('charPanel').querySelector('[data-close]').addEventListener('click', closePanels);
}

const BAG_COSTS = [100, 200, 400, 800];   // 24 → 30 → 36 → 42 → 48 slots
const RARITY_ORDER = ['common', 'magic', 'rare', 'set', 'unique', 'exotic'];
// bulk-sellable: everything of the tier (gems included) except socketed
// gem hosts, charms (their power is live from the bag) and quest sigils
const sellListUpTo = (p, tier) =>
  p.inv.filter(i => !(i.sockets > 0) && i.slot !== 'charm' && i.slot !== 'sigil' && i.slot !== 'egg' &&
    RARITY_ORDER.indexOf(i.rarity) <= RARITY_ORDER.indexOf(tier));

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
      <button class="smallbtn" data-buy="hp" ${p.gold < potCost || p.challenge === 'ascetic' ? 'disabled' : ''}>🧪 Potion (${potCost}g)</button>
      <button class="smallbtn" data-buy="mp" ${p.gold < potCost || p.challenge === 'ascetic' ? 'disabled' : ''}>🔮 Potion (${potCost}g)</button>
      <button class="smallbtn" data-gamble ${p.gold < gambleCost ? 'disabled' : ''}>🎲 Gamble (${gambleCost}g)</button>
      <button class="smallbtn" data-fuse ${fusableGroups(p.inv).length ? '' : 'disabled'} title="Combine 3 matching gems into a finer one">⚗ Fuse gems${fusableGroups(p.inv).length ? ' (' + fusableGroups(p.inv).length + ')' : ''}</button>
      <button class="smallbtn" data-fuseall ${fusableGroups(p.inv).length ? '' : 'disabled'} title="Apply every possible fusion, cascading up the ladder">⚡ Fuse all</button>
      ${p.bagSlots < 48
        ? `<button class="smallbtn" data-bag ${p.gold < BAG_COSTS[(p.bagSlots - 24) / 6] ? 'disabled' : ''}>🎒 +6 slots (${BAG_COSTS[(p.bagSlots - 24) / 6]}g)</button>`
        : ''}
    </div>
    <div class="invactions" style="margin-top:-4px">
      ${['common', 'magic', 'rare', 'exotic'].map(tier => {
        const list = sellListUpTo(p, tier);
        const total = list.reduce((s, i) => s + sellPrice(i), 0);
        const label = tier === 'common' ? 'commons' : tier === 'exotic' ? 'everything' : '≤ ' + tier;
        return `<button class="smallbtn" data-sellup="${tier}" ${!list.length ? 'disabled' : ''}>💰 ${label} (${total}g)</button>`;
      }).join('')}
    </div>
    <div class="derived" style="text-align:center; margin:2px 0 8px">Bulk selling includes gems of that tier; socketed items, charms, sigils and eggs always stay.</div>
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
  $('invPanel').querySelectorAll('[data-sellup]').forEach(b => b.addEventListener('click', () => {
    const tier = b.dataset.sellup;
    const list = sellListUpTo(p, tier);
    if (!list.length) return;
    const total = list.reduce((s, i) => s + sellPrice(i), 0);
    const label = tier === 'exotic' ? 'every rarity' : 'rarities up to ' + tier;
    const gemCount = list.filter(i => i.g).length;
    if (!confirm('Sell ' + list.length + ' items (' + label + ') for ' + total + ' gold?'
      + (gemCount ? '\nIncludes ' + gemCount + ' gem' + (gemCount > 1 ? 's' : '') + '.' : '')
      + '\nSocketed items always stay.')) return;
    p.inv = p.inv.filter(i => !list.includes(i));
    p.gold += total;
    ftext(p.x, p.y - 30, '+' + total + 'g', '#e8c14d', 14);
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
  $('invPanel').querySelector('[data-fuse]').addEventListener('click', () => {
    if (!fusableGroups(p.inv).length) return;
    togglePanel('fusePanel');
  });
  $('invPanel').querySelector('[data-fuseall]').addEventListener('click', () => {
    const { count, finest } = fuseAll(p);
    if (!count) return;
    banner('⚗ ' + count + ' fusion' + (count > 1 ? 's' : '') + ' — finest: ' + finest.name);
    spark(p.x, p.y - 10, fuseColor(finest), 16, 200);
    sfx.level(); recalc(); saveDirty = true; renderInv(); updateHUD();
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
    ? '<div class="isock">' + Array.from({ length: it.sockets }, (_, i2) => {
      const g = it.gems && it.gems[i2];
      return g
        ? `<button class="sockbtn" data-unsock="${i2}" style="color:${GEMS[g.g].color}" title="Remove gem">◆</button>`
        : '<span class="sockbtn" style="color:#5a4c34">◇</span>';
    }).join('') + '</div>' +
    (it.gems && it.gems.length ? '<div class="ibase">tap a filled socket to pry its gem out</div>' : '')
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
    <div class="iname rc-${it.rarity}">${it.icon} ${it.name}</div>
    <div class="ibase">${it.base !== it.name && !it.g ? it.base + ' · ' : ''}${it.slot} · item level ${it.lvl}${it.grade ? ` · <span style="color:${rarityColor(it.grade)}">${it.grade} grade</span>` : ''}</div>
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
          : !SLOTS.includes(it.slot)
            ? `${it.slot === 'sigil' ? '<button class="smallbtn" data-act="cow">🐄 Use the sigil</button>' : ''}
               ${it.egg ? (eggReady(it) ? '<button class="smallbtn" data-act="lair" style="border-color:#d9c65a">🐣 Crack open the egg</button>' : `<button class="smallbtn" disabled style="opacity:.55">🕒 Hatches in ${fmtDur(it.egg.hatchAt - Date.now())}</button>`) : ''}
               <button class="smallbtn" data-act="sell">Sell ${sellPrice(it)}g</button>`
            : `<button class="smallbtn" data-act="equip">Equip</button>
             ${G.merc && (it.slot === 'weapon' || it.slot === 'armor') ? '<button class="smallbtn" data-act="merc">🛡 Give to merc</button>' : ''}
             <button class="smallbtn" data-act="sell">Sell ${sellPrice(it)}g</button>`}
      <button class="smallbtn" data-act="close">Close</button>
    </div>`;
  pop.classList.remove('hidden');
  pop.querySelectorAll('[data-unsock]').forEach(b => b.addEventListener('click', () => {
    const gi = +b.dataset.unsock;
    const g = it.gems && it.gems[gi];
    if (!g) return;
    if (p.inv.length >= p.bagSlots) { ftext(p.x, p.y - 30, 'Bag is full!', '#ff8a7a', 13); return; }
    it.gems.splice(gi, 1);
    p.inv.push({ slot: 'gem', g: g.g, v: g.v, icon: GEMS[g.g].icon, rarity: 'magic', mods: {}, name: GEMS[g.g].name, base: 'gem', lvl: it.lvl });
    recalc(); sfx.pickup();
    ftext(p.x, p.y - 30, GEMS[g.g].name + ' pried out', GEMS[g.g].color, 13);
    saveDirty = true;
    pop.classList.add('hidden');
    renderInv(); updateHUD();
    showItemPopup(it, ref, equipped);   // reopen with the freed socket
  }));
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
    } else if (act === 'lair') {
      if (G.rift || G.cowLevel || G.petLair) {
        ftext(p.x, p.y - 30, 'Not in here…', '#c9b98a', 12);
        pop.classList.add('hidden');
        return;
      }
      if (!eggReady(it)) { pop.classList.add('hidden'); return; }
      p.inv.splice(ref, 1);
      pop.classList.add('hidden');
      closePanels();
      spark(p.x, p.y, '#ffd76a', 30, 260);
      enterPetLair(it);
      saveDirty = true;
      updateHUD();
      return;
    } else if (act === 'cow') {
      if (G.dlvl !== 0) {
        ftext(p.x, p.y - 30, 'The sigil only stirs in town…', '#c9b98a', 12);
        pop.classList.add('hidden');
        return;
      }
      p.inv.splice(ref, 1);
      pop.classList.add('hidden');
      closePanels();
      spark(p.x, p.y, it.golden ? '#ffd76a' : '#c8281e', 30, 260);
      enterCowLevel(it.golden);
      saveDirty = true;
      updateHUD();
      return;
    } else if (act === 'merc') {
      const old = G.merc[it.slot];
      G.merc[it.slot] = it;
      p.inv.splice(ref, 1);
      if (old) p.inv.push(old);
      refreshMercEntity();
      ftext(p.x, p.y - 30, 'Mercenary takes ' + it.name, rarityColor(it.rarity), 12);
      sfx.pickup();
    } else if (act === 'sell') {
      p.gold += sellPrice(it);
      p.inv.splice(ref, 1);
      if (it.slot === 'charm') recalc();
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
      <button class="smallbtn" data-music>${musicOn ? '🎵 Music: ON' : '🎵 Music: OFF'}</button>
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
  $('pausePanel').querySelector('[data-music]').addEventListener('click', () => { musicOn = !musicOn; saveDirty = true; renderPause(); });
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
    const chIcon = s.challenge && challengeOf(s.challenge) ? challengeOf(s.challenge).icon + ' ' : '';
    row.innerHTML = `
      <button class="slotbtn">▶ ${s.hardcore ? '☠ ' : ''}${chIcon}${CLASSES[s.cls].icon} ${CLASSES[s.cls].name} Lv.${s.level}
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
  // trophies earned by finished challenge runs
  const badges = loadBadges();
  const tr = $('trophies');
  tr.classList.toggle('hidden', !badges.length);
  if (badges.length) {
    tr.innerHTML = '<div class="pick">— trophies —</div>' + badges.map(b => {
      const ch = challengeOf(b.challenge);
      return ch ? `<div class="graverow">🏆 ${ch.icon} ${ch.name} <small>· ${CLASSES[b.cls] ? CLASSES[b.cls].name : '?'} Lv.${b.level}${b.hardcore ? ' ☠' : ''}</small></div>` : '';
    }).join('');
  }
  // graveyard of fallen hardcore heroes
  const graves = loadGraves();
  const gy = $('graveyard');
  gy.classList.toggle('hidden', !graves.length);
  if (graves.length) {
    gy.innerHTML = '<div class="pick">— graveyard —</div>' + graves.slice(0, 6).map(g =>
      `<div class="graverow">🪦 ${CLASSES[g.cls] ? CLASSES[g.cls].icon + ' ' + CLASSES[g.cls].name : '?'} Lv.${g.level}
       <small>fell on floor ${g.dlvl}${g.ng ? ' · NG+' + g.ng : ''}</small></div>`).join('');
  }
}
/* ---- bestiary: the collection of every beast ever tamed ---- */
function renderBestiary() {
  const b = loadBestiary();
  const groups = [
    { title: 'Companions', hint: 'sold at the stable · roam the wild', idx: [0, 1, 2, 3, 4, 5] },
    { title: 'Realm Beasts', hint: 'egg-born, one per realm', idx: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] },
    { title: 'Tyrant Whelps', hint: 'from the rarest eggs of the tyrants themselves', idx: [18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29] },
  ];
  const tamed = Object.keys(b).length;
  const card = i => {
    const sp = PET_SPECIES[i];
    const got = b[i] !== undefined;
    const grade = got ? PET_RARITIES[b[i]] : null;
    const home = sp.world !== undefined ? WORLDS[sp.world].name : null;
    return `
      <div class="bst-card ${got ? '' : 'bst-unknown'}">
        <span class="bst-icon">${sp.icon}</span>
        <span class="bst-name">${got ? sp.name : '???'}</span>
        <span class="bst-sub">${got
          ? `<span class="rc-${grade}">${grade}</span>`
          : sp.whelp ? 'tyrant egg · ' + home : sp.eggOnly ? 'egg · ' + home : 'stable · wilds'}</span>
      </div>`;
  };
  const title = bestiaryTier >= 2 ? ' · 👑 Lord of Beasts' : bestiaryTier >= 1 ? ' · 🏅 Beastmaster' : '';
  $('bestiaryPanel').innerHTML = `
    <button class="pclose" data-close>✕</button>
    <div class="ptitle">📖 Bestiary — ${tamed}/${PET_SPECIES.length} tamed${title}</div>
    <div class="derived" style="text-align:center">Every beast any of your heroes has ever tamed, and the best grade caught.</div>
    <div class="bst-rewards">
      <div class="${tamed >= 15 ? 'bst-got' : ''}">🏅 <b>Beastmaster's Bond</b> (15 tamed): pets & minions +15% damage · stable −25% ${tamed >= 15 ? '— earned ✓' : `— ${tamed}/15`}</div>
      <div class="${tamed >= PET_SPECIES.length ? 'bst-got' : ''}">👑 <b>Lord of Beasts</b> (all ${PET_SPECIES.length}): +30% damage instead, and your companion wears a golden crown ${tamed >= PET_SPECIES.length ? '— earned ✓' : `— ${tamed}/${PET_SPECIES.length}`}</div>
    </div>
    ${groups.map(g => `
      <div class="bst-group"><b>${g.title}</b> <small>· ${g.hint}</small></div>
      <div class="bst-grid">${g.idx.map(card).join('')}</div>`).join('')}`;
  $('bestiaryPanel').classList.remove('hidden');
  $('bestiaryPanel').querySelector('[data-close]').addEventListener('click', () => $('bestiaryPanel').classList.add('hidden'));
}
$('btnBestiary').addEventListener('click', renderBestiary);

$('hcToggle').addEventListener('click', () => {
  hardcoreNext = !hardcoreNext;
  $('hcToggle').textContent = hardcoreNext ? '☠ Hardcore: ON — death is forever' : '☠ Hardcore: OFF';
  $('hcToggle').style.color = hardcoreNext ? '#ff8a7a' : '';
});
$('chToggle').addEventListener('click', () => {
  const i = CHALLENGES.findIndex(c => c.id === challengeNext);
  const next = i + 1 < CHALLENGES.length ? CHALLENGES[i + 1] : null;   // …last one wraps to OFF
  challengeNext = next ? next.id : null;
  $('chToggle').textContent = next ? `🏆 ${next.icon} ${next.name} — ${next.desc}` : '🏆 Challenge: OFF';
  $('chToggle').style.color = next ? '#e8d45a' : '';
});

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
  // rift obelisk?
  if (G.lvl.obelisk && dist(w.x, w.y, G.lvl.obelisk.x, G.lvl.obelisk.y - 16) < 48) {
    if (dist(p.x, p.y, G.lvl.obelisk.x, G.lvl.obelisk.y) < 95) togglePanel('riftPanel');
    else setMoveTarget(G.lvl.obelisk.x, G.lvl.obelisk.y + 34);
    return;
  }
  // stable?
  if (G.lvl.stable && dist(w.x, w.y, G.lvl.stable.x, G.lvl.stable.y) < 55) {
    if (dist(p.x, p.y, G.lvl.stable.x, G.lvl.stable.y) < 110) togglePanel('stablePanel');
    else setMoveTarget(G.lvl.stable.x, G.lvl.stable.y + 44);
    return;
  }
  // the wandering quest-giver?
  if (G.lvl.questNpc) {
    const n = G.lvl.questNpc;
    if (dist(w.x, w.y, n.x, n.y - 6) < 42) {
      if (dist(p.x, p.y, n.x, n.y) < 95) { G.talkNpc = 'quest'; togglePanel('npcPanel'); }
      else setMoveTarget(n.x, n.y + 34);
      return;
    }
  }
  // townsfolk?
  if (G.lvl.npcs) for (const n of G.lvl.npcs) {
    if (dist(w.x, w.y, n.x, n.y - 6) < 42) {
      if (dist(p.x, p.y, n.x, n.y) < 95) { G.talkNpc = n.id; togglePanel('npcPanel'); }
      else setMoveTarget(n.x, n.y + 34);
      return;
    }
  }
  // world gate?
  if (G.lvl.gates) for (const gt of G.lvl.gates) {
    if (dist(w.x, w.y, gt.x, gt.y - 12) < 42) {
      if (dist(p.x, p.y, gt.x, gt.y) < 100) {
        if (gateUnlocked(gt.w)) {
          spark(p.x, p.y, WORLDS[gt.w].pal.acc, 20, 220);
          enterLevel(WORLD_START(gt.w), false);
        } else {
          banner('🔒 Conquer ' + WORLDS[gt.w - 1].name + ' to open this gate');
          sfx.hurt();
        }
      } else setMoveTarget(gt.x, gt.y + 44);
      return;
    }
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
  if (G.dlvl === 0) {
    if (G.anchor) returnThroughPortal();
    else banner('You are already in town');
    return;
  }
  // anchor the portal to this exact spot; the whole floor is preserved
  G.portalFloor = G.dlvl;
  G.anchor = { dlvl: G.dlvl, x: G.p.x, y: G.p.y, lvl: G.lvl, drops: G.drops, world: G.world };
  spark(G.p.x, G.p.y, '#5ab0ff', 24, 220);
  sfx.stairs();
  enterLevel(0, false);
  G.lvl.portal = { x: G.p.x + 54, y: G.p.y };
  G.offPortal = true;
  banner('Town portal opened — step back through when ready');
});

function returnThroughPortal() {
  const a = G.anchor;
  if (!a) return;
  G.dlvl = a.dlvl;
  G.world = a.world;
  G.lvl = a.lvl;
  G.drops = a.drops;
  G.projs = []; G.parts = []; G.texts = []; G.rings = [];
  G.beams = []; G.meteors = []; G.clouds = [];
  G.minions = [];
  const act = G.p.pets && G.p.pets[G.p.activePet];
  G.pet = act ? spawnPet(act) : null;
  G.p.x = a.x; G.p.y = a.y;
  G.p.target = null; G.p.path = null; G.p.moveTo = null;
  G.onWp = false; G.offPortal = false;   // must step away before the portal triggers again
  const wname = WORLDS[G.world].name;
  $('floorLabel').textContent = wname + ' · ' + a.dlvl + (G.ng ? ' · NG+' + G.ng : '');
  banner('Back through the portal — ' + wname + ' ' + a.dlvl);
  spark(G.p.x, G.p.y, '#5ab0ff', 18, 200);
  sfx.stairs();
  saveDirty = true;
}
$('btnMenu').addEventListener('click', () => togglePanel('pausePanel'));
$('btnNgPlus').addEventListener('click', () => { audioInit(); newGamePlus(); });
$('btnKeepPlaying').addEventListener('click', () => $('victoryScreen').classList.add('hidden'));
$('btnRespawn').addEventListener('click', () => {
  if (G && G.hardcoreDead) { toMenu(); return; }
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
    musicTick();
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
window.__sanctuary = {
  get G() { return G; }, startGame, CLASSES, MTYPES,
  makeItem: (...a) => makeItem(...a), genLevel, enterLevel: d => enterLevel(d, false),
  enterRift, enterCowLevel, makeGem, gemItem, makeCharm, makeSigil,
  killMonster, hurtPlayer, recalc, derived, togglePanel, castSkill, PASSIVES,
  CHALLENGES, showVictory, loadBadges,
};
