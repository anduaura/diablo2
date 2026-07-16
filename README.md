# ⚔ Sanctuary — a Diablo II–style web ARPG

A dark, gothic hack-and-slash action RPG that runs entirely in your browser —
**designed for phones first**. No installs, no build step, no dependencies:
one HTML file, one stylesheet, one script. All art is drawn procedurally on a
`<canvas>`; this is an original fan homage inspired by Diablo II and uses no
Blizzard assets, names, or code.

## 🎮 Play it on your phone

The easiest way is GitHub Pages (a deploy workflow is included):

1. Merge this branch into `main` (or `master`).
2. In the repo: **Settings → Pages → Source → GitHub Actions**.
3. Push (or re-run the *Deploy to GitHub Pages* workflow). Your game will be
   live at `https://<user>.github.io/diablo2/`.
4. Open that URL on your phone. For fullscreen, use your browser's
   **Add to Home Screen** — the game ships a web-app manifest.

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

- **3 classes** — Warrior (melee bruiser), Sorceress (fire & frost),
  Huntress (bow volleys), each with two skills
- **Endless procedurally generated dungeon** — rooms, corridors, torch-lit
  darkness, fog-of-war minimap; every 5th floor holds a **boss** who seals
  the stairs until slain
- **Diablo-style loot** — common/magic/rare/unique items with random
  affixes, 6 equipment slots, gambling, potions, gold
- **Character building** — levels grant stat points for Strength, Dexterity,
  Vitality and Energy; crits, life steal, magic find
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
