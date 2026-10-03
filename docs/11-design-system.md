# 11 · Design system

Source: Figma file **"Link MVP • Editable screens"** — https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7. Start with the *Foundations* section ("00 • Start here", components, "States • Operational honesty", "Brand • Logo").

All names, counts and dates in the designs are **sample data**.

---

## 1. Tokens

Token names match the Figma local variables. In code they live in `packages/ui/tokens` and are exported as CSS custom properties and a TypeScript object (web and React Native).

### Colour

| Token | Hex | Use |
|---|---|---|
| `--color-blue` | `#00ADF7` | Brand, primary button fill, active indicators. **Not for text** (contrast 2.5:1 on white). |
| `--color-navy` | `#0A1824` | Ink: headings, body text, text on primary buttons (7.1:1 on blue), dark surfaces (ops nav) |
| `--color-bg` | `#FAFDFF` | Page background |
| `--color-soft` | `#F1F6FB` | Subtle surfaces, table headers, secondary fills |
| `--color-border` | `#DCE5EC` | Borders, dividers |
| `--color-muted` | `#526575` | Secondary text (5.9:1 on bg) |
| `--color-white` | `#FFFFFF` | Cards |
| `--color-blueSoft` | `#E8F7FE` | Info background, selected rows |
| `--color-blueText` | `#006FA3` | Links and info text (5.5:1 on white) |
| `--color-amber` / `--color-amberSoft` | `#946000` / `#FFF4D6` | Warning text / background (4.9:1) |
| `--color-green` / `--color-greenSoft` | `#187447` / `#E6F5EC` | Success text / background (5.1:1) |
| `--color-red` / `--color-redSoft` | `#BB3340` / `#FFF0F1` | Error text / background (5.2:1) |

Semantic aliases (code only): `primary = blue`, `text = navy`, `textMuted = muted`, `info = blueText on blueSoft`, `warning = amber on amberSoft`, `success = green on greenSoft`, `error = red on redSoft`.

### Spacing, radius, elevation

| Token | Value |
|---|---|
| `--space-4`, `--space-8`, `--space-12`, `--space-16`, `--space-20`, `--space-24`, `--space-32`, `--space-40`, `--space-48` | 4, 8, 12, 16, 20, 24, 32, 40, 48 px — Figma `space/*` |
| `--radius-8`, `--radius-12`, `--radius-16`, `--radius-24` | 8 px (small chips, inputs), 12 px (controls, chips), 16 px (cards, sheets), 24 px (large web cards) — Figma `radius/*` |
| `Link/Elevation/Subtle` | `0 1px 2px #0A18240D` |
| `Link/Elevation/Card` | `0 1px 3px #0A18240A, 0 8px 24px -4px #0A18240F` |
| `Link/Elevation/Glow` | `0 6px 16px -2px #00ADF747` (primary button) |

## 2. Typography

| Style | English — Plus Jakarta Sans | Arabic — Cairo |
|---|---|---|
| Display | 32 / Bold 700 / line-height 1.45 | 32 / Bold 700 / 1.55 (`Link/AR/Display`) |
| Metric (KPI numbers) | 30 / Bold 700 / 1.45 | 30 / Bold 700 / 1.55 (`Link/AR/Metric`) |
| Title | 24 / Bold 700 / 1.45 | 24 / Bold 700 / 1.55 (`Link/AR/Title`) |
| Heading | 18 / Bold 700 / 1.45 | 18 / Bold 700 / 1.55 (`Link/AR/Heading`) |
| Body | 14 / Regular 400 / 1.45 | 14 / Regular 400 / 1.55 (`Link/AR/Body`) |
| Label | 14 / SemiBold 600 / 1.45 | 14 / SemiBold 600 / 1.55 (`Link/AR/Label`) |
| Caption | 12 / Regular 400 / 1.45 | 12 / Regular 400 / 1.55 (`Link/AR/Caption`) |

All styles are Figma text styles: `Link/EN/*` and `Link/AR/*` (Arabic always at 155% line height).

### Website styles — `Link/Web/*` (landing page, public site)

| Style | Font / weight | Size | Line height | Letter-spacing (Figma) |
|---|---|---|---|---|
| Hero | Plus Jakarta Sans ExtraBold 800 | 64 | 1.04 | −3 |
| H2 | Plus Jakarta Sans ExtraBold 800 | 46 | 1.12 | −2.5 |
| H3 | Plus Jakarta Sans Bold 700 | 22 | 1.32 | −1 |
| Lead | Plus Jakarta Sans Medium 500 | 20 | 1.6 | 0 |
| Body | Plus Jakarta Sans Regular 400 | 16 | 1.62 | 0 |
| Small | Plus Jakarta Sans Medium 500 | 14 | 1.5 | 0 |
| Eyebrow (upper-case labels) | Plus Jakarta Sans Bold 700 | 13 | 1.4 | 12 |
| Button | Plus Jakarta Sans Bold 700 | 16 | 1.2 | 0 |
| AR Body | Cairo SemiBold 600 | 16 | 1.70 | 0 |
| AR Small | Cairo Regular 400 | 14 | 1.65 | 0 |

Values for Hero, H2, H3, Lead, Small, Eyebrow, Button and AR Small were read from the landing frame (`68:616`). Body (16 / 1.62) and AR Body (Cairo SemiBold 16 / 1.70) come from the docs review. The Arabic Title style, `space/8`, `space/48`, `radius/8` and `radius/24` exist in Figma (per the docs review) but are not bound in any frame the Figma MCP could read; check them in Figma when building. Figma letter-spacing values are exported as the designer set them (percent of the font size); convert them when generating tokens.

Font stacks: Arabic UI `"Cairo", "Plus Jakarta Sans", system-ui, sans-serif`. English UI `"Plus Jakarta Sans", "Cairo", system-ui, sans-serif`. Cairo covers Arabic words inside English text, and the other way round. Load both fonts as self-hosted subsets.

## 3. Components (from Figma)

| Component | Variants | Rules |
|---|---|---|
| **Link / Button** | `Primary` (blue fill, navy label, Glow), `Secondary` (white, border), `Quiet` (text only), `Disabled` (soft fill, muted label) | One primary action per screen. Destructive actions use Secondary with red text plus a confirmation. |
| **Link / Status** | `Info`, `Warning`, `Success`, `Error`, `Neutral` — a dot + label on the soft background | Statuses describe facts ("Auto from Link", "Due 5 Oct", "Needs decision"). Message delivery statuses come only from the provider (BR-APR-11). |
| **Link / Mastery band** | `Strong` (green), `Developing` (info blue), `Needs work` (amber), `Not enough data` (neutral) | Parents see only the band. The designs never use red for a student's band; keep it that way. |
| **Link / Logo** | Lockup light, lockup dark, mark, mark with halo | The orb is the brand and the face of the Link Assistant. Lockup in navigation and headers; the mark alone for the assistant and app icons; the halo version only at hero sizes (sign-in, voice capture). Clear space = half the orb's width. |
| **Link Web / Button** (`69:629`) | Style: `Primary`, `On dark`, `Outline`, `Dark` × State: `Default`, `Hover` | Website buttons only (landing page, public pages). Label uses `Link/Web/Button`. |
| **Link Web / FAQ item** (`76:657`) | State: `Closed`, `Open` | Accordion on the landing page; one open at a time. |

### Patterns used across screens

| Pattern | Where | Notes |
|---|---|---|
| Side navigation | Owner web (A-, C-screens), ops (L-) | Owner: workspace switcher, Today, Follow-ups, Students, Sessions, Parent communication; *Marketplace*: Public profile, Room schedule, Reviews, Rooms & requests, Rent income; *Workspace*: Rules & settings, Activity history. Fix the layer named "Market / undefined" (CF-16). |
| Bottom tab bar | Teacher app, parent PWA | Teacher: Today · My groups · Records (Phase 2); marketplace tabs: My groups · Rooms · Earnings. Parent: Search · My children · Account. |
| KPI card | A01, C07, AN07 | Metric style number + label + one-line context |
| List row with initials avatar | Rosters, requests, reviews | Initials from the name (two letters; Arabic initials in AR) |
| Stepper | T02–T05 ("Step 1 of 4"), P06–P07 ("Step 1 of 2") | |
| Bottom sheet | T11 / AR05 note sheet | |
| Evidence list | A03, A06, AN01, AN05 | Every claim lists its source record and who confirmed it |
| Timeline | A03, A10, A17, L03 | Append-only history |
| Pipeline / kanban | C06, L01 | Stages as columns |
| Week grid | C03, C05, J02 | Day × hour; Taken / Free / Booked states |
| Charts | AN01 (bars vs class average), AN02 (trend lines), AN07 (heatmap) | Follow `dataviz` rules; heatmap cells show numbers to teachers and owners only |

## 4. States — "operational honesty"

Copy patterns from the Foundations frame. Use them as written (localised):

| Situation | Tone | Message pattern |
|---|---|---|
| No flags | Info | "No confirmed records currently meet an active rule. This does not prove that all students are doing well." |
| Records missing | Warning | "Two sessions have no confirmed record. Complete the records before assessing a pattern." |
| Delivery failed | Error | "Delivery failed. Check the recipient and connection, then retry. The case remains open." |
| Invalid value | Error | "24 exceeds the maximum of 20. Ask the teacher to correct it; never cap it silently." |
| Dismissed with reason | Neutral | Quote the reason; "The flag stays in the activity history and can be reopened." |
| Missing data | Info | "Missing data is not absence." |
| Demo / prototype | Neutral | Remove all "Prototype — nothing is sent" banners in production builds. |

Empty, loading, offline and error states are required for every list and every form.

## 5. RTL and bilingual rules

| # | Rule |
|---|---|
| RTL-01 | Arabic is the default. Set `<html lang="ar" dir="rtl">`; switch `lang` and `dir` with the language. React Native: `I18nManager` plus a reload when the direction changes. |
| RTL-02 | Use **logical** CSS properties only (`margin-inline-start`, `padding-inline`, `inset-inline-end`, `text-align: start`). A lint rule bans `left` and `right` in styles. |
| RTL-03 | Mirror directional icons (back/forward chevrons, arrows, steppers, progress). Do **not** mirror logos, media controls, check marks, clocks or brand marks. |
| RTL-04 | Arabic UI shows Arabic-Indic digits (as in AR01–AR05) via `Intl` with `ar-EG`. Phone numbers, reference codes and IDs show in Western digits inside an LTR isolate (`<bdi dir="ltr">`) in both languages. Inputs accept both digit sets and normalise them. |
| RTL-05 | Wrap mixed-direction text (an English name inside Arabic copy, and vice versa) in `<bdi>` or Unicode isolates. |
| RTL-06 | Money: EN "EGP 550"; AR "٥٥٠ ج.م". Format with `Intl.NumberFormat` from piasters; hide `.00` for whole amounts. |
| RTL-07 | Dates and times: `Intl.DateTimeFormat` in `Africa/Cairo`; Arabic month names in AR. |
| RTL-08 | Arabic plurals have six forms (zero, one, two, few, many, other). Use ICU MessageFormat plural rules for every count ("٢٠ طالبًا", "ملاحظتان"). |
| RTL-09 | Don't truncate Arabic names to one line; allow two lines. |
| RTL-10 | Charts: put labels and legends on the start side. Whether the time axis runs right-to-left in Arabic is a design question — confirm with the designer before building AN01/AN02. |
| RTL-11 | Every screen ships in both languages. CI fails on missing translation keys. |

## 6. Accessibility

- WCAG 2.1 AA on parent and public surfaces (NFR-05). The token pairs above meet 4.5:1 for normal text, except `--color-blue` text, which is not allowed.
- Touch targets ≥ 44 × 44 pt in mobile apps.
- Every icon-only button has a label in both languages.
- Status is never shown by colour alone (dot + text).
- Voice features always have a typed alternative (FUP-VOI-06).

## 7. Screen inventory

Figma links: `https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=<node with ":" replaced by "-">`.

The file has **two pages**: "Link MVP • Editable screens" (`0:1`, all app screens below) and "Landing page · Website" (`68:605`). The Figma MCP's page list shows only the first page, which is why an earlier read missed the second (CF-08).

### Landing page (page `68:605`) — website, desktop 1440
| ID | Name | Phase | Node |
|---|---|---|---|
| W00 | Link — Landing page · Desktop 1440 (whole page, 10,747 px tall) | 1 | [68:616](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=68-616) |
| W01 | Link Web / Button (component set) | 1 | [69:629](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=69-629) |
| W02 | Link Web / FAQ item (component set) | 1 | [76:657](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=76-657) |
| W03 | Note · Content to confirm (9 items to clear before go-live) | 1 | [80:691](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=80-691) |

Sections inside `68:616`, top to bottom. The MCP does not expose them as separate layers, so link to `68:616` and find them by order:

| # | Section | Content | Phase of the features it shows |
|---|---|---|---|
| 1 | Navigation | Logo; How it works, Features, Marketplace, Pricing, FAQ; عربي; Log in; Join Link | 1 |
| 2 | Hero | "Speak after class. Link does the follow-up."; Join for free / See how it works; animated cards (voice note → record → WhatsApp → flag) | 2 (OD-48) |
| 3 | Trust strip | Arabic-first · People decide · Rules you can read · WhatsApp-native | 2 |
| 4 | The problem | "A concern is noticed. Then nobody follows up." + Omar's month timeline | 2 |
| 5 | How it works | Speak → Confirm → Flag → Follow up (4 steps) | 2 |
| 6 | The product | Tabs: Owner dashboard · Teacher app · Parent updates | 2 |
| 7 | Features | Readable rules, voice notes, records, follow-up with an owner, owner dashboard, approved parent updates, Arabic and English | 2 |
| 8 | Marketplace | "Parents find teachers. Teachers find rooms." Map + for parents / teachers / centres; payment methods | 1 |
| 9 | Trust & control | AI drafts → teacher confirms → staff approve → parent receives; data separate per centre; logged; opt-in | 1–2 |
| 10 | Pricing | Free for centres, teachers and parents; Link's fee examples (5–10% of rent; commission on bookings) | 1 (OD-01, OD-02, OD-05) |
| 11 | FAQ | 6 questions (FAQ item component) | 1–2 |
| 12 | Join Link | "Give every concern an owner…" + "Get started" form → `POST /v1/leads` | 1 |
| 13 | Footer | Product, Company, Legal (Privacy, Terms, Data & consent); EN / عربي; social links | 1 |

### Foundations (section `14:82`)
| ID | Name | Phase | Node |
|---|---|---|---|
| F00 | 00 • Start here | all | [4:22](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=4-22) |
| F01 | Link / Button | all | [4:6](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=4-6) |
| F02 | Link / Status | all | [4:16](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=4-16) |
| F03 | States • Operational honesty | all | [8:166](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-166) |
| F04 | Brand • Logo | all | [65:385](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=65-385) |
| F05 | Link / Mastery band | 3 | [85:618](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=85-618) |
| F06 | Definitions · transcript, record, flag, topic score | 2–3 | [85:619](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=85-619) |

### Parent app (section `33:238`) — mobile PWA
| ID | Name | Phase | Node |
|---|---|---|---|
| P01 | Welcome & sign up (choose your role) | 1 | [39:260](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=39-260) |
| P02 | Search home | 1 | [39:334](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=39-334) |
| P03 | Map & results | 1 | [40:261](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=40-261) |
| P04 | Centre profile | 1 | [40:374](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=40-374) |
| P05 | Teacher profile | 1 | [42:262](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=42-262) |
| P06 | Choose a group & start date | 1 | [42:357](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=42-357) |
| P07 | Reserve & pay | 1 | [43:264](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=43-264) |
| P08 | Place reserved (confirmation) | 1 | [43:372](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=43-372) |
| P09 | My children (enrolments & updates) | 1 (updates feed: 2) | [44:268](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=44-268) |
| P10 | Leave feedback (public review or private note) | 1 | [44:362](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=44-362) |

### Centre marketplace (section `33:239`) — owner web
| ID | Name | Phase | Node |
|---|---|---|---|
| C01 | Public page — "Add my centre to Link" | 1 | [45:273](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=45-273) |
| C02 | Public profile editor (with live preview) | 1 | [46:274](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=46-274) |
| C03 | Room schedule | 1 | [56:375](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=56-375) |
| C04 | Reviews & private feedback | 1 | [48:295](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=48-295) |
| C05 | Rooms & rent | 1 | [57:364](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=57-364) |
| C06 | Room requests from teachers (pipeline) | 1 | [49:307](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=49-307) |
| C07 | Rent income from teachers | 1 | [58:358](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=58-358) |

### Teacher marketplace (section `33:240`) — teacher app
| ID | Name | Phase | Node |
|---|---|---|---|
| J01 | Find a room to rent (map + list) | 1 | [59:358](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=59-358) |
| J02 | Request a room slot (rent estimate) | 1 | [59:462](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=59-462) |
| J03 | My room requests | 1 | [51:341](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=51-341) |
| J04 | My teacher profile | 1 | [51:447](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=51-447) |
| J05 | My groups & fees | 1 | [60:358](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=60-358) |
| J06 | Enrolment requests (confirm seats) | 1 | [60:452](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=60-452) |
| J07 | Earnings | 1 | [61:373](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=61-373) |

### Link ops (section `33:241`) — ops console
| ID | Name | Phase | Node |
|---|---|---|---|
| L01 | Centre join requests & verification | 1 | [52:344](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=52-344) |
| L02 | Review moderation queue | 1 | [53:355](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=53-355) |
| L03 | Refunds & disputes | 1 | [53:445](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=53-445) |

### Centre admin (section `14:79`) — owner web, desktop (EN)
| ID | Name | Phase | Node |
|---|---|---|---|
| A01 | Today | 2 | [5:2](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-2) |
| A02 | Follow-ups list | 2 | [5:83](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-83) |
| A03 | Follow-up case | 2 | [5:153](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-153) |
| A04 | Student profile | 2 | [5:229](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-229) |
| A05 | Sessions | 2 | [5:302](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-302) |
| A06 | Review parent message | 2 | [5:367](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-367) |
| A07 | Rules & settings | 2 | [5:423](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=5-423) |
| A08 | Record outcome | 2 | [7:47](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-47) |
| A09 | Approved message preview | 2 | [7:103](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-103) |
| A10 | Outcome recorded | 2 | [7:143](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-143) |
| A11 | Parent communication | 2 | [15:79](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=15-79) |
| A12 | اليوم — Owner Today (AR, RTL) | 2 | [16:90](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=16-90) |
| A13 | Students | 2 | [25:168](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=25-168) |
| A14 | Session record detail | 2 | [26:178](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=26-178) |
| A15 | Import students (setup step 3) | 2 — blocked (OD-21) | [27:197](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=27-197) |
| A16 | Staff & access | 1 (subset), 2 | [29:215](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=29-215) |
| A17 | Activity history | 2 | [30:230](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=30-230) |
| A18 | Owner sign-in | 1 (OTP version, CF-02) | [31:233](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=31-233) |
| A19 | Centre setup — groups & teachers (step 2) | 2 — blocked (OD-21) | [32:235](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=32-235) |

### Teacher mobile (section `14:80`) — EN
| ID | Name | Phase | Node |
|---|---|---|---|
| T01 | Today | 2 | [7:183](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-183) |
| T02 | Confirm attendance | 2 | [7:209](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-209) |
| T03 | Scores (optional) | 2 | [7:242](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-242) |
| T04 | Observation (voice or text) | 2 | [7:272](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-272) |
| T05 | Review before saving | 2 | [7:294](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-294) |
| T06 | Record saved | 2 | [7:317](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=7-317) |
| T07 | Clarify student identity | 2 | [8:130](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-130) |
| T08 | Save failed | 2 | [8:152](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-152) |
| T09 | My groups | 2 | [18:146](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=18-146) |
| T10 | Group roster | 2 | [19:152](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=19-152) |
| T11 | Add a note about a student (sheet) | 2 | [21:152](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=21-152) |
| T12 | Student detail (teacher view) | 2 | [22:154](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=22-154) |
| T13 | Records history | 2 | [23:156](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=23-156) |
| T14 | Sign in (phone + code) | 1 | [23:237](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=23-237) |

### Teacher mobile — Arabic RTL (section `14:81`)
| ID | Name | Phase | Node |
|---|---|---|---|
| AR01 | اليوم (Today) | 2 | [8:71](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-71) |
| AR02 | مراجعة قبل الحفظ (Review) | 2 | [8:93](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-93) |
| AR03 | تم الحفظ (Saved) | 2 | [8:115](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=8-115) |
| AR04 | قائمة الطلاب (Roster) | 2 | [24:166](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=24-166) |
| AR05 | ملاحظة عن طالب (Note sheet) | 2 | [24:309](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=24-309) |

### Voice & AI assistant (section `33:237`)
| ID | Name | Phase | Node |
|---|---|---|---|
| V01 | Voice note — recording | 2 | [34:237](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=34-237) |
| V02 | What the AI understood — review | 2 | [34:327](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=34-327) |
| V03 | Ask Link by voice — assistant drafts a parent message | 2 | [35:243](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=35-243) |
| V04 | Review & approve the parent message | 2 | [35:335](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=35-335) |
| V05 | Parent's phone — message arrives (illustrative) | 2 | [36:248](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=36-248) |
| V06 | Parent replied — Link suggests the next step | 2 | [36:284](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=36-284) |
| V07 | Owner Today with Link Assistant open | 2 | [38:250](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=38-250) |

### Student analytics (section `85:605`)
| ID | Name | Phase | Node |
|---|---|---|---|
| AN01 | Teacher — decline alert | 3 (Figma says 2; CF-07) | [86:605](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=86-605) |
| AN02 | Teacher — student subject report | 3 | [86:726](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=86-726) |
| AN03 | Teacher — topic map | 3 | [88:627](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=88-627) |
| AN04 | Teacher — tag a quiz to topics + marks by voice | 3 | [88:764](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=88-764) |
| AN05 | Teacher — approve weekly focus plan | 3 | [89:636](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=89-636) |
| AN06 | Parent — where to focus this week | 3 | [89:724](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=89-724) |
| AN07 | Owner — class analytics | 3 | [90:661](https://www.figma.com/design/3TteHvTvk9JrvUthg2AyE7/?node-id=90-661) |

### Missing designs
| Needed for | Status |
|---|---|
| Teacher shortfall payment, payout account, eKYC flow | Not designed. Reuse P07 / J04 patterns. |
| Ops: teacher verification queue, reconciliation issues, commission rules, reference data, data-subject requests, ledger adjustments, payout retry | Not designed. Reuse L01–L03 patterns. |
| Waitlist offer and accept, cancellation and refund-status flow for parents | Partly in P06 / P09; needs screens |
| "Did not take place" action on a session (teacher, centre) | Not designed. Add to the session calendar and C03. |
| Mobile and Arabic versions of the landing page | Only the desktop English frame exists (`68:616`). Build from `Link/Web/*` styles and RTL rules; review with the designer. |
| Arabic versions of parent, centre, teacher-marketplace and ops screens | Only A12 and AR01–AR05 exist in Arabic. Build from tokens + RTL rules and review with the designer. |
