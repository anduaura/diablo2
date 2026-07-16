# User research: most-loved Diablo features

Quick research pass (July 2026) on what players of Diablo 1/2/3/4 consistently
name as the features they love most, mapped against what Sanctuary already
has, with a prioritized list of what to add next.

## What the community loves, and why

### 1. The loot "slot machine" — rare chase items and jackpot moments
The single most-cited reason people play. Diablo's designers describe the
core loop as a slot machine: every kill is a lever pull that might pay out
nothing, a small win, or a jackpot ([Kotaku interview with the D2 creators](https://kotaku.com/why-video-game-loot-is-so-addictive-according-to-the-c-1846695147),
[TheGamer](https://www.thegamer.com/diablo-2-loot-interview/)).
Two things make the payout land:

- **Genuinely rare chase items.** D2 itemization is loved *because* the best
  items have very low drop rates — a high rune or a top unique dropping is a
  memorable event, sometimes months apart ([Dexerto on why D4 players say it
  lacks D2's "magic"](https://www.dexerto.com/diablo/diablo-4-players-claim-it-cant-compare-to-the-magic-of-diablo-2-2172691/)).
- **Drop ceremony.** Sound, color, light beams, screen feedback — the
  presentation of the drop is doing psychological work
  ([dotesports on loot psychology](https://dotesports.com/general/guides/why-are-loot-systems-so-addictive)).

### 2. Build identity — items and skills that change *how* you play
Players talk less about raw power and more about drops/skills that transform
a playstyle ("one Legendary can change your whole strategy"). D4's recent
skill-tree overhaul was pitched entirely on this: builds should feel
*personal*, "your own version shaped by the paths you chose"
([Xbox Wire](https://news.xbox.com/en-us/2026/04/22/diablo-4-skill-tree-overhaul/)).
D2's skill trees with synergies, respec scarcity, and stat allocation are the
franchise touchstone here.

### 3. Runewords & sockets — deterministic crafting on top of random loot
Consistently named the thing that "separates Diablo II from all existing
loot-based ARPGs": random drops (bases, runes) feed a *deterministic* recipe
you work toward, so every farming session makes progress even when RNG is
cold. Nearly every D2 endgame build uses at least one runeword
([Maxroll](https://maxroll.gg/d2/items/runewords), [diablowiki](https://diablo2.diablowiki.net/Runewords)).

### 4. A repeatable, scaling endgame
D3's Greater Rifts are its most-praised system: short, dense, *timed* runs
with an infinitely scaling difficulty knob and leaderboards, so there's
always a clear next goal ([FullCleared](https://fullcleared.com/reviews/diablo-iii-season-29-review/),
[GamesRadar on D3's final seasons](https://www.gamesradar.com/diablo-3s-final-season-goes-all-out-with-a-new-single-player-mode-and-quality-of-life-changes-fans-have-always-wanted/)).
Seasons (fresh-start ladders with a theme) are the other big D3 legacy;
Blizzard made the most-loved season mechanics permanent when D3 wound down
([PCGamesN](https://www.pcgamesn.com/diablo-3/season-30)).

### 5. Difficulty that bites, and the option to make it permanent
Old-school fans cite D2's real difficulty on normal as part of the appeal,
and Hardcore (permadeath) + Solo Self Found are the modes the community kept
asking D3 to add ([GamesRadar](https://www.gamesradar.com/diablo-3s-final-season-goes-all-out-with-a-new-single-player-mode-and-quality-of-life-changes-fans-have-always-wanted/)).

### 6. Atmosphere: gothic gloom and *music*
D2's coherent dark look and its soundtrack come up unprompted in every
D2-vs-D4 thread ([Steam discussion](https://steamcommunity.com/app/2344520/discussions/0/4513254345530703793/)).
Tristram's guitar theme is arguably the most-loved single asset in the series.

### 7. The Secret Cow Level — jokes players can farm
Started as a joke, became "one of the most recognizable pieces of Diablo
history" — and it endures because it's also a *great farming zone*: dense
packs, fast clears, real rewards ([Wikipedia](https://en.wikipedia.org/wiki/Cow_level),
[Maxroll](https://maxroll.gg/d2/resources/the-secret-cow-level)). D4 finally
added one in 2026 and it made news ([TweakTown](https://www.tweaktown.com/news/111443/diablo-4s-secret-cow-level-has-been-discovered-and-the-cow-king-drops-a-new-mythic-item/index.html)).

### 8. Companions you invest in
D2 mercenaries (gear them up, keep them alive) and D3 followers are
frequently mentioned; they give solo players a party feel — the "forced
solo" feel of D4 is a common complaint ([Dexerto](https://www.dexerto.com/diablo/diablo-4-players-claim-it-cant-compare-to-the-magic-of-diablo-2-2172691/)).

### 9. Small beloved systems that keep coming up
- **Charms** — power that costs inventory space (a loved trade-off).
- **Gambling** — loot slot machine with gold as the coin. ✅ already in game.
- **Horadric Cube recipes** — 3 chipped gems → 1 better; upcycling junk.
- **Unlimited potions / generous sustain** — D2's belt vs D4's rationing.
- **Stash & inventory Tetris** — ✅ largely in game already.

## Where Sanctuary stands

Already covered (✅): loot rarities & affixes, exotic/unique items, wearable
sets with bonuses, sockets + gems + 2-gem runewords, gambling, shrines,
stash, bag expansions, NG+, five themed worlds, bosses every 5 floors,
magic find, auto-QoL (auto-equip/sell/skills), town portal, pets, auto-save.

Notably missing vs. the loved list: **skill points/trees (skills only
unlock by level — no player choice)**, charms, a hireable mercenary,
a rift-style timed endgame, hardcore mode, gem-upcycling recipes, music,
drop ceremony for top rarities, and a secret cow level.

## Recommendations (prioritized for a solo mobile web ARPG)

1. **Skill points & mini skill trees** — the biggest gap. Let levels grant
   skill points to rank up the existing 4 skills per class (damage/cost/cd
   scaling) plus 1–2 passives per class; add a cheap respec. This converts
   "unlock at level 6/12" into build identity, the #2 loved feature.
2. **Timed challenge dungeon ("Rifts")** — reuse the existing dungeon
   generator: a portal in town opens a 1-floor timed run at a chosen
   difficulty tier; beating the timer raises your max tier and drops better
   loot. Local personal-best board. Gives the endless game a goal ladder.
3. **Charms** — small items that grant their mods from inside the bag.
   Very cheap to build on the existing item/mod system, instantly deepens
   inventory decisions.
4. **Drop ceremony** — distinct sound + colored light beam + minimap ping
   for rare/exotic/set drops. Tiny effort, outsized dopamine payoff.
5. **Secret cow level** — a hidden portal recipe (e.g. sell/combine specific
   junk in town) opening a dense bovine floor with a Cow King boss. Iconic,
   meme-friendly, and a good gem/gold farm.
6. **Hardcore mode** — a character-creation toggle: death deletes the save
   (with a hall-of-fame tombstone list). Cheap; huge replay value for the
   players most likely to stick around.
7. **Mercenary hireling** — hire in town, give them a weapon + armor slot,
   they fight and can be revived for gold. Builds on the existing pet/minion
   AI (necromancer skeletons already exist).
8. **Gem upcycling (mini Horadric Cube)** — 3 gems of a tier combine into 1
   of the next tier; makes gem shrines and low drops always worth grabbing
   and feeds the runeword hunt.
9. **Music** — one or two looping procedural/synth ambient tracks (the
   WebAudio synth is already there). Atmosphere is a top-cited D2 love.
10. **Seasonal challenge runs** (later) — fresh-start character slot with a
    modifier ("all monsters champion", "no potions") and a completion badge.
    Captures the seasons appeal without servers.

Skipped deliberately: trading/economy and leaderboards-with-friends — both
top community features but they need a server; not a fit for a
zero-dependency client-only game.
