# ⚔ Sanctuary — a Diablo II–style web ARPG

A dark, gothic hack-and-slash action RPG that runs entirely in your browser —
**designed for phones first**. No installs, no build step, no dependencies:
one HTML file, one stylesheet, one script. All art is drawn procedurally on a
`<canvas>`; this is an original fan homage inspired by Diablo II and uses no
Blizzard assets, names, or code.

## 🎮 Play now

**▶ https://anduaura.github.io/diablo2/**

Open it on your phone and play. For a fullscreen, app-like experience use
your browser's **Add to Home Screen** — the game ships a web-app manifest.
Progress auto-saves on your device.

Every push to `main` redeploys the game automatically via the included
GitHub Pages workflow (`.github/workflows/deploy.yml`) — no manual setup
needed.

To run locally instead:

```bash
cd diablo2
python3 -m http.server 8000
# open http://localhost:8000  (or your computer's LAN IP from your phone)
```

## ✋ Controls

**Touch (primary):**
- **Tap** the ground to walk there (pathfinds around walls)
- **Tap** a monster to attack it (auto-chases and keeps swinging)
- **Hold & drag** anywhere to run continuously
- On-screen buttons: two class **skills**, **health** & **mana** potions
- Top bar: character sheet 🧍 (spend stat points), inventory 🎒, menu ☰

**Keyboard (desktop):** WASD/arrows move · click to move/attack ·
`1` `2` skills · `Q`/`E` potions · `I` inventory · `C` character · `Esc` menu

## 🗡️ The game

- **4 classes** — Warrior (melee bruiser), Sorceress (fire & frost),
  Huntress (bow volleys), Necromancer (skeletal army), each with four
  skills, two passives, and skill points to rank them up (respec for gold)
- **Endless procedurally generated dungeon** — five themed worlds, rooms,
  corridors, torch-lit darkness, fog-of-war minimap; every 5th floor holds
  a **boss** who seals the stairs until slain
- **Diablo-style loot** — common/magic/rare/set/unique/exotic items with
  random affixes, 6 equipment slots, sockets & gems, runewords, charms
  that work from your bag, gambling, potions, gold — and rare drops land
  with a chime and a beam of light
- **Timed rifts** — a town obelisk opens single-floor challenges: summon
  and slay the Rift Guardian before the clock dies to unlock higher tiers
- **A mercenary** — hire a man-at-arms, hand him weapons & armor, revive
  him when he falls
- **Hardcore mode** — optional permadeath; fallen heroes rest in the menu
  graveyard
- **Challenge runs** — forge a hero under a modifier (Champion's Gauntlet,
  Ascetic, Glass Cannon, Swift Death); slay Malgoroth under it to earn a
  permanent trophy on the main menu
- **A secret pasture** — floor bosses sometimes drop a strange bovine
  sigil… use it in town. Moo.
- **Gem crafting** — fuse three matching gems into the next quality tier
- **Character building** — levels grant stat points for Strength, Dexterity,
  Vitality and Energy; crits, life steal, magic find
- **Procedural ambient music** — a WebAudio drone & bells score, per world
- **Auto-save** — progress is stored in `localStorage`; close the tab and
  continue later
- Red/blue **globes**, floating damage numbers, champions, stuns, chills,
  and plenty of gothic gloom

## 🧱 Tech

- Plain JavaScript + Canvas 2D, zero dependencies
- A* pathfinding on the dungeon grid, simple LOS-based monster AI
- Dynamic lighting via an offscreen darkness layer with punched light holes
- Tiny WebAudio synth for sound effects
- Mobile viewport/safe-area aware UI, works portrait or landscape
