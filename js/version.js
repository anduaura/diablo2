/* ---------------- Sanctuary versioning ----------------
   Bump SANCTUARY_VERSION and prepend a SANCTUARY_CHANGELOG entry with
   every feature PR (minor for features, patch for fixes).
   SANCTUARY_BUILD is stamped by the deploy workflow at publish time —
   it stays 'dev' when the game runs from a local checkout. */
const SANCTUARY_VERSION = '1.6.1';
const SANCTUARY_BUILD = 'dev';

/* newest first · v/date/title/notes */
const SANCTUARY_CHANGELOG = [
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
