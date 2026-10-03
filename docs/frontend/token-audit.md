# Token audit — Figma vs docs/11 §1–2

Checked 2026-10-03 with `get_variable_defs` on nodes 4:22, 4:6, 4:16, 8:166, 16:90 (AR) and 39:260 (P01).
Rule (task owner): where they disagree, build doc 11, keep going, list both values.

| Token | Doc 11 | Figma | Status |
|---|---|---|---|
| All 15 colours | §1 | identical | match |
| `space/4,12,16,20,24,32,40` | §1 | identical | match |
| `radius/12,16` | §1 | identical | match |
| `Link/Elevation/Subtle`, `Glow`, `Card` | §1 | identical (Card read from 16:90) | match — Card is now confirmed |
| EN Display/Heading/Body/Label/Caption/Title | §2 | identical (1.45) | match |
| AR Display/Metric/Heading/Body/Label/Caption | §2 | identical (Cairo, 1.55) | match |
| `Link/Elevation/Raised` | not in doc 11 | `0 2 6 #0A18240F, 0 24 48 -8 #0A18241F` (seen on P01) | **new in Figma** — added as `elevation.raised`, doc 11 needs a row |
| `space/8`, `space/48` | §1 | not bound in any frame read | unverified |
| `radius/8`, `radius/24` | §1 | not bound in any frame read | unverified |
| `Link/AR/Title` | §2 | not bound in any frame read | unverified |
| EN Metric | §2 | not seen yet | unverified |

## Batch 1 · parent frames (P01–P10)

The parent frames use the same variables (`color/*`, `space/16`, `space/20`, `radius/12`, `radius/16`) and text styles, plus a number of off-token values. They were snapped to the nearest token:

| Figma value | Where | Built as |
|---|---|---|
| radius 14, 22, 10, 9, 18, 5 | rows, hero card, chips, tabs, sticky CTA, checkbox | `radius-12`, `radius-24`, `radius-8`, `radius-8`, `radius-16`, `radius-8` |
| padding/gap 14, 18, 13, 10, 6, 3 | cards, rows, chips | `space-12`/`space-16`, `space-16`, `space-12`, `space-8`/`space-12`, `space-4`/`space-8`, `space-4` |
| font 18.72 + tracking −0.37 | header logo lockup (scaled 0.78) | `Logo` at orb 25 px (wordmark scales with it) |
| font 13, 10, 8 | avatar initials | Caption (12) / Label (14) |
| font 30 | star input | Metric (30) |
| `#ecf1ec`, `#c7e3f7`, `#d6edd9` | P03 map | `greenSoft`, `blueSoft` (dev `MapView` only) |
| `#3399e5`, `#1a7359`, `#734db2` → `#0a1824` gradients | centre covers | token gradients `blue/green/blueText/amber → navy` |
| `rgba(224,244,254,0.9)` | header wash | `blueSoft` → transparent `bg` |
| `rgba(255,255,255,0.08/0.75/0.8)` | P01 assistant card | `white/10`, `white/75`, `white/80` (opacity of a token) |
| `rgba(10,23,36,0.18)` pin shadow | P03 pins | `Link/Elevation/Card` |
| `--color-blue` text on navy | P01 tiles, P04/P07 avatars | white text (11 §1: blue is never text) |

No new token mismatches against doc 11. The logo orb in Figma is a raster image fill (192 × 191 PNG), not a vector: `packages/ui/src/brand/*.svg` embed the PNG exports. Ask design for a vector source.
