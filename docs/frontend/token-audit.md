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
