/* ---------------- Sanctuary versioning ----------------
   Bump SANCTUARY_VERSION and prepend a SANCTUARY_CHANGELOG entry with
   every feature PR (minor for features, patch for fixes).
   SANCTUARY_BUILD is stamped by the deploy workflow at publish time —
   it stays 'dev' when the game runs from a local checkout. */
const SANCTUARY_VERSION = '1.30.0';
const SANCTUARY_BUILD = 'dev';

/* newest first · v/date/title/notes */
const SANCTUARY_CHANGELOG = [
  {
    v: '1.30.0', date: '2026-07-17', title: 'No more bricks in the wild',
    notes: [
      'Open-world walls stop being masonry: the fields are edged by a forest treeline with sunlit crowns, the caldera by jagged basalt crags rimmed in ember light, the tundra by snowdrifts spiked with glacier shards, the sands by wind-smoothed dune crests, the gardens by ragged thorn hedges, and the sky isles by banks of sunlit cumulus',
      'Canopies, crags and cloud-crowns rise above the tile line, so boundaries read as living horizon instead of brickwork',
      'The true dungeons keep their bones, coral, fungus, crystal, runes and rivets — walls belong down there',
    ],
  },
  {
    v: '1.29.0', date: '2026-07-17', title: 'The hordes arrive',
    notes: [
      'Monster packs are three times as thick everywhere — the first field now swarms with sixty foes, deep realms muster nearly two hundred',
      'The harder the realm, the bigger the horde: later worlds and every New Game+ lap pack still more monsters per stage',
      'The secret pasture herd more than doubles, and rift guardians demand up to 60 kills before they emerge',
      'Boss arenas stay clear — the tyrant meets you alone',
    ],
  },
  {
    v: '1.28.0', date: '2026-07-17', title: 'Terrain, not architecture',
    notes: [
      'Open-air realms are now truly open ground: meadows, tundra, dunes, lava ridges, blood gardens and sky isles spread as one rolling expanse with scattered outcrops — no more rooms and corridors under the open sky',
      'The map edge is the horizon: an isle\'s rim, the forest line, a dune crest',
      'Roughly three times the walkable ground per stage in open realms; the crypts, caverns and the void keep their winding halls',
    ],
  },
  {
    v: '1.27.0', date: '2026-07-17', title: 'Worlds, not dungeons',
    notes: [
      'Open-air realms now sit in their own light: sunlit meadows, glaring dunes, blinding sky isles, ember-lit lava ridges — only the true underworlds keep their torch-lit gloom (town enjoys the fields\' daylight too)',
      'You no longer "descend floors" everywhere: you press on across fields, leap between isles, cross ridges, breach sectors — every door, banner and waypoint speaks the world\'s own language',
      'The top bar and waypoint list now name the leg of the journey: "Skyreach Isles · Isle 3/25", not "Floor 253"',
    ],
  },
  {
    v: '1.26.0', date: '2026-07-17', title: 'The boss aegis',
    notes: [
      'Bosses can no longer be burst down: an aegis limits their life loss to ~5% per second (after a 10% opening strike), so every boss fight lasts long enough to be a fight — whatever your build',
      'Deep-world monsters now resist flat elemental damage, up to 70% in the furthest realms — the first world barely notices',
      'Ordinary monsters and champions are untouched: clearing trash keeps its rhythm',
    ],
  },
  {
    v: '1.25.0', date: '2026-07-17', title: 'Gold & purple sets',
    notes: [
      'Sets now come in three tiers: the green classics, rarer gold sets (Dragonfell Regalia, Sanctum of the Dawn) and the rarest purple sets (Void Tyrant\'s Dominion, Weave of Eternity)',
      'Higher tiers hit harder — stronger pieces, bigger set bonuses — and still roll grades: a Celestial purple piece is the mightiest gear in the game',
      'Tier shows everywhere: item names, bag borders, drop labels and beams glow gold or purple',
    ],
  },
  {
    v: '1.24.0', date: '2026-07-17', title: 'Bosses fight back',
    notes: [
      'Only your 6 mightiest charms now act from the bag — the rest sleep (marked 💤); a bottomless bag is storage, not a stat stick',
      'Primary stat and +damage% taper at the top end — power keeps growing, it just stops going vertical',
      'Bosses bulk up with depth: mini-bosses, tyrants and guardians carry real health pools in the later worlds instead of melting in a hit or two',
      'New +% damage affixes roll up to +120% instead of scaling forever',
    ],
  },
  {
    v: '1.23.0', date: '2026-07-17', title: 'Death rejoins the game',
    notes: [
      'Life steal now caps at 15% total and heals at most a fifth of your life per hit — it sustains you, it no longer makes you unkillable',
      'Monsters grow meaner with depth: later worlds scale harder, monster damage climbs faster, and New Game+ toughens every world more the deeper you go instead of a flat bonus',
      'Challenge runs mean it: any active challenge hardens every monster (+25% life, +35% damage) on top of its own twist',
      'The first world is untouched — new heroes feel no difference',
    ],
  },
  {
    v: '1.22.0', date: '2026-07-17', title: 'Exit seals',
    notes: [
      'Every ordinary floor now locks its end door behind a small puzzle — solve it to forge the exit key',
      'Four seals to meet: wake the rune stones in pip order, echo the singing crystals\' song, set the linked ancient levers upright, or hunt down the gold-marked Key Warden',
      'Discovered puzzle pieces glow cyan on the minimap; the door and its map marker burn red until the seal breaks',
      'Boss floors are untouched — their guardian is the lock, as ever',
    ],
  },
  {
    v: '1.21.0', date: '2026-07-17', title: 'No beast left behind by accident',
    notes: [
      'Leaving a beast lair while the beast still lives now asks for confirmation — the egg is already spent, so abandoning the lair loses the beast forever',
      'The town portal button inside a lair shows the same warning instead of silently whisking you home',
    ],
  },
  {
    v: '1.20.0', date: '2026-07-17', title: 'The long way down',
    notes: [
      'The end door now sits in the room that takes the longest walk from the entrance — measured on foot, not as the crow flies — so it can\'t be stumbled on early',
    ],
  },
  {
    v: '1.19.0', date: '2026-07-17', title: 'A minimap that keeps secrets',
    notes: [
      'The minimap is now a scrolling window around your hero instead of a view of the whole level — its frame no longer betrays where the map ends or which way is left to explore',
      'Landmarks you\'ve already found (stairs, waypoints) cling to the window\'s edge as colored markers so you can still navigate back',
      'Level footprints drift further off-center and ovals roll at random tilts — even less square, even less predictable',
    ],
  },
  {
    v: '1.18.0', date: '2026-07-16', title: 'A tidier bag & livelier pets',
    notes: [
      'The inventory slims down: potions and gambling now live with the town merchant, and 💰 everything, 🗂 Reorg and ⚡ Fuse all share one row',
      'Fixed tamed beasts rendering as dark shadows while wandering the town green — and the stable pen no longer shows frozen copies of them',
    ],
  },
  {
    v: '1.17.0', date: '2026-07-16', title: 'Lighter on your battery',
    notes: [
      'Big performance pass: tiles now render once into an offscreen cache and blit like sprites, and the lighting layer runs at half resolution — about a third less CPU per frame, same visuals',
    ],
  },
  {
    v: '1.16.0', date: '2026-07-16', title: 'No two floors alike',
    notes: [
      'Dungeon floors no longer fill a predictable square — each one takes its own silhouette: ovals, drifting blobs, diagonal canyons, rings, crossroads and edge-hugging Ls',
      'Rooms come in new shapes too — ovals, diamonds and rounded halls alongside the classic rectangles',
      'Corridors now link neighbouring rooms naturally (with the occasional loop) instead of zig-zagging across the whole map',
    ],
  },
  {
    v: '1.15.0', date: '2026-07-16', title: 'Tidy bags',
    notes: [
      'A new 🗂 Reorg button in the bag sorts everything by item type, most valuable first within each group',
    ],
  },
  {
    v: '1.14.0', date: '2026-07-16', title: 'Doors answer to a tap',
    notes: [
      'Stairs and doors now activate only when you tap them — walking over them never whisks you away mid-fight',
      'Climbing back up lands you beside the previous floor\'s down-door, not back at its entrance',
    ],
  },
  {
    v: '1.13.0', date: '2026-07-16', title: 'Set grades, visible & fusable',
    notes: [
      'Set pieces join the fusion ladder: three copies of the same piece at the same grade forge the next grade, Fine through Celestial (socketed gems must come out first)',
      'Graded set items now show their grade at a glance — a colored ✦ star on the drop label and on bag, equipment and trunk slots',
    ],
  },
  {
    v: '1.12.0', date: '2026-07-16', title: 'Bottomless bags & trunks',
    notes: [
      'Bag and trunk can now grow all the way to 1,000 slots — a flat 100 gold per +6, every time',
      'The trunk gains its own +6 slots button (upgrades are shared by all heroes, like the trunk itself)',
    ],
  },
  {
    v: '1.11.1', date: '2026-07-16', title: 'Roomier bags',
    notes: [
      'Bag upgrades are far cheaper: +6 slots now starts at just 100 gold (then 200, 400, 800 up to 48 slots)',
    ],
  },
  {
    v: '1.11.0', date: '2026-07-16', title: 'Beastmaster & Lord of Beasts',
    notes: [
      'Bestiary rewards: tame 15 species for the Beastmaster\'s Bond — pets & minions +15% damage and stable prices −25%, for every hero',
      'Tame all 30 to become Lord of Beasts: +30% damage instead, and your companion wears a golden crown',
    ],
  },
  {
    v: '1.10.0', date: '2026-07-16', title: 'Two-way stairs & a livelier town',
    notes: [
      'Stairs go both ways — step on the up-stairs to climb back a floor (with the same loot warning before you leave things behind)',
      'Your tamed beasts now wander the town green instead of standing frozen at the stable',
      'Waypoints move to every realm\'s floors 5, 10, 15, 20 and 25 — the town gates already cover each realm\'s first floor',
    ],
  },
  {
    v: '1.9.0', date: '2026-07-16', title: 'Charm & sigil fusion',
    notes: [
      'Charms join the fusion ladder: three Smalls make a Grand, three Grands make an Exalted Charm — a new fusion-only tier with three affixes',
      'Three Bovine Sigils fuse into a Golden Bovine Sigil: its Gilded Pasture is an all-champion herd with double gems and a mightier, richer Cow King',
      'Fuse all handles gems, charms and sigils together',
    ],
  },
  {
    v: '1.8.0', date: '2026-07-16', title: 'The Bestiary',
    notes: [
      'A 📖 Bestiary on the main menu tracks all 30 species across every hero — tamed beasts show their best grade, the rest stay as silhouettes with a hint of where they live',
    ],
  },
  {
    v: '1.7.0', date: '2026-07-16', title: 'Fuse all',
    notes: [
      'A new ⚡ Fuse all button in the bag (and the fusion picker) applies every possible gem fusion in one tap, cascading up the ladder',
    ],
  },
  {
    v: '1.6.1', date: '2026-07-16', title: 'A touch of Pokémon',
    notes: [
      'The main menu now says it proudly: a Diablo II–inspired action RPG with a touch of Pokémon',
    ],
  },
  {
    v: '1.6.0', date: '2026-07-16', title: 'Pet eggs & beast lairs',
    notes: [
      'Monsters now drop pet eggs — each realm lays its own species, from the Fae Fox to the Warden Orb, 24 new beasts in all',
      'Eggs incubate in real time (rarer eggs brood longer), then crack open a beast lair: best the beast inside to tame it',
      'Tyrant whelps — miniature dragon tyrants, the mightiest companions — hatch only from the rarest eggs of the tyrants themselves',
      'Rarer eggs come from rarer foes, and hold fiercer, higher-grade beasts',
    ],
  },
  {
    v: '1.5.1', date: '2026-07-16', title: 'Menu polish',
    notes: [
      'The version tag no longer overlaps the controls hint on the main menu — it sits on its own line beneath it',
    ],
  },
  {
    v: '1.5.0', date: '2026-07-16', title: 'Wild beasts',
    notes: [
      'Wild pets now prowl their home realms — hounds in the meadows, wolves in the tundra, drakes in the caldera, dragons above the void',
      'Subdue one in battle and it joins your stable, rarity and buffs intact — gotta tame them all',
    ],
  },
  {
    v: '1.4.0', date: '2026-07-16', title: 'Relics & hidden vaults',
    notes: [
      'Realm relics: every world hoards one signature unique that drops only there — twelve chase items from Thornwing\'s Verdant Edge to the Omega Core',
      'Secret vaults: some floors hide a treasure chamber behind a cracked, faintly glowing wall — linger beside it and it crumbles open',
    ],
  },
  {
    v: '1.3.0', date: '2026-07-16', title: 'Cursed floors & bandit shrines',
    notes: [
      'Roughly one floor in eight is cursed: The Withering, The Frenzy, The Legion or The Unstable — meaner monsters, richer rewards',
      'A new golden shrine releases a scatter of Gilded Imps — catch them before they portal away',
    ],
  },
  {
    v: '1.2.0', date: '2026-07-16', title: 'Every realm breathes',
    notes: [
      'Per-world weather: petals, snowfall, rising embers, grave-fog, bubbles, drifting spores, sandstorms, crystal glints, crimson mist, void motes, passing clouds and data-rain',
    ],
  },
  {
    v: '1.1.0', date: '2026-07-16', title: 'Versioned at last',
    notes: [
      'Version number and this changelog on the main menu',
      'The game now tells you when an update is ready — tap the toast to reload',
      'Offline cache is cleaned up automatically on every new version',
    ],
  },
  {
    v: '1.0.0', date: '2026-07-16', title: 'Sanctuary leaves the forge',
    notes: [
      'Four classes with ranked skills, passives and respecs',
      'Twelve themed worlds of 25 floors — mini-bosses, dragon tyrants, themed exits and gates',
      'A living town: merchant, stash trunk, stable, rift obelisk, townsfolk and twelve world gates',
      'World wonders in every realm and the treasure-dripping Gilded Imp',
      'Side quests from stranded wanderers on every realm\'s first floor',
      'Full loot game: sockets & gems with a fusion ladder, runewords, sets, exotics, charms, gambling',
      'Pets up to a dragon, necromancer minions, a hireable mercenary',
      'Timed rifts, hardcore mode, challenge runs, New Game+, a secret pasture (moo)',
      'Auto-target, auto-skills, auto-potion, auto-equip, auto-sell, auto socket-swap',
      'Offline play as an installable app with three save slots',
    ],
  },
];

/* ---- menu wiring: version tag, changelog panel, update toast ---- */
addEventListener('DOMContentLoaded', () => {
  const tag = document.getElementById('versionTag');
  const panel = document.getElementById('changelogPanel');
  if (!tag || !panel) return;

  const SEEN_KEY = 'sanctuary_seen_version';
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); } catch (e) { }
  tag.innerHTML = 'v' + SANCTUARY_VERSION +
    (seen && seen !== SANCTUARY_VERSION ? ' <span class="vnew">NEW</span>' : '');
  if (!seen) { try { localStorage.setItem(SEEN_KEY, SANCTUARY_VERSION); } catch (e) { } }

  tag.addEventListener('click', () => {
    panel.innerHTML = `
      <button class="pclose" data-close>✕</button>
      <div class="ptitle">📜 What's New</div>
      <div class="derived" style="text-align:center">Sanctuary v${SANCTUARY_VERSION} · build ${SANCTUARY_BUILD}</div>
      <div class="clog">` +
      SANCTUARY_CHANGELOG.map(e => `
        <div class="clog-entry">
          <div class="clog-head"><b>v${e.v}</b> — ${e.title} <span class="clog-date">${e.date}</span></div>
          <ul>${e.notes.map(n => '<li>' + n + '</li>').join('')}</ul>
        </div>`).join('') +
      `</div>`;
    panel.classList.remove('hidden');
    panel.querySelector('[data-close]').addEventListener('click', () => panel.classList.add('hidden'));
    try { localStorage.setItem(SEEN_KEY, SANCTUARY_VERSION); } catch (e) { }
    tag.innerHTML = 'v' + SANCTUARY_VERSION;
  });
});
