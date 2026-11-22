# The Picture That Tastes of One Ingredient — One Perfect Mango

[![Competition](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
[![Rank](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/aam110/makefun-picture-tastes-one/rank.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
[![Reward](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/aam110/makefun-picture-tastes-one/reward.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)

One picture of food, built on exactly **one ingredient**: a single perfect mango.

A mango half, fanned in precise slices, glistening with juice — honey drizzled
over the flesh, juice droplets beading and hanging mid-air, a mint sprig tucked
at its side, all resting on dark slate under warm golden-hour light against deep
teal shadows. Painterly, rich and dense: every quadrant carries texture — slate
grain, honey gloss, mint veins, soft bokeh and warm dust motes in the light.

## How it is made

`main.ts` (Node 22, standard library only) is a small software renderer. It
paints the picture pixel by pixel — background glow and bokeh, slate slab, the
mango dome with its fanned slices, honey drizzle, mint leaves and droplets —
then writes a 1024×1024 PNG with its own encoder (zlib deflate, adaptive
per-row PNG filters). No assets, no fonts, no network, no randomness: every run
produces byte-identical output.

```sh
node main.ts            # writes ./output/entry.png
```

## Entry

- Competition: [The picture that tastes of one ingredient](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047)
- Program: `main.ts` → `entry.png` (1024×1024, deterministic)
- License: MIT
