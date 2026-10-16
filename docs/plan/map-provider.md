# Map provider (Part B, 2026-10-16)

What Link needs: map tiles on the web (C02 picker, P02 search, P05 centre page, J01 find a room), address search (address → point) and reverse lookup (point → address), for **Egypt, Arabic first**. The volume is small: tens of centres and a few thousand map views a month in the pilot. Every provider sits behind one `MapProvider` adapter (`packages/maps`), and the drawn dev map stays the local fake, so switching provider is a setting.

The owner **drags the pin** to the exact door. So the stored point is the owner's own placement, and search only moves the map near it. That makes geocoding quality less critical than tiles and Arabic labels.

Public docs only, read 2026-10-16. "Verify" marks a point the docs did not settle.

## Comparison

| | **MapLibre GL + OpenFreeMap** (tiles) + **Nominatim** (search) | **Google Maps Platform** | **Mapbox** | MapTiler Cloud (free) |
|---|---|---|---|---|
| Card needed | **No** (no key, no sign-up) | **Yes**: a billing account with a payment method is required, even inside the free usage ([Use API keys](https://developers.google.com/maps/documentation/javascript/get-api-key)) | Not stated on the pricing page (third parties disagree; verify) | No ("No credit card needed") |
| Free limits | Tiles: no limits ([openfreemap.org](https://openfreemap.org/)). Nominatim: max 1 request/s, **no autocomplete** ([policy](https://operations.osmfoundation.org/policies/nominatim/)) | Per SKU each month: Dynamic Maps 10,000, Geocoding 10,000, Autocomplete 10,000; **Maps Embed unlimited** ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing)) | 50,000 web map loads; 100,000 *temporary* geocoding requests ([pricing](https://www.mapbox.com/pricing)) | 100k requests, 5k map sessions, 1k search sessions; service pauses over quota ([pricing](https://www.maptiler.com/cloud/pricing/)) |
| Commercial use | Yes (OpenFreeMap FAQ); Nominatim allowed, but may be withdrawn | Yes | Yes | **No**: the free plan is for testing, prototypes or non-commercial use |
| Arabic labels in Egypt | From OpenStreetMap's `name:ar` (the OpenMapTiles schema); good in Cairo and Giza, thinner elsewhere | Best: native Arabic labels (`language=ar`) | Good: `name_ar` field in its styles | Same OSM data as OpenFreeMap |
| Egyptian address search | Fair: streets and districts yes, building numbers rarely | Best | Good in cities | Fair (OSM) |
| Storing results | Allowed (OSM data, ODbL) | Coordinates from the Geocoding API may be cached for 30 days only (verify in the Service Specific Terms); the owner's own pin is not a geocoding result | **Temporary** geocoding results may not be stored; storing needs **Permanent** geocoding ($5 per 1,000, no free tier) | Per terms |
| Attribution | "© OpenMapTiles © OpenStreetMap contributors" (MapLibre shows it) | Google logo and terms on the map | Mapbox logo and attribution | MapTiler logo on the map |
| Reliability | **No SLA** (donation-run) | SLA | SLA | Pauses over quota |

## Recommendation

**Staging and the pilot: MapLibre GL JS with OpenFreeMap tiles, and Nominatim for search on submit (not per keystroke).**

- No key, no card, no sign-up, commercial use allowed. Nothing for Ahmed to create.
- Arabic labels come from OSM `name:ar`, falling back to the local name.
- The pin, not the geocoder, decides the stored point, so Nominatim's weaker street search is acceptable.
- Search runs only when the owner presses Search (Nominatim forbids autocomplete), at most 1 request per second, with an identifying User-Agent, through core-api (never from the browser straight to Nominatim), and cached.

**Before real users: decide whether to switch search to Google Geocoding** (best Egyptian addresses and Arabic). It needs a Google billing account with a card, so it needs your OK. It fits in the free 10,000 lookups a month. The switch is the `MAP_PROVIDER` / `GEOCODER_PROVIDER` settings, and no screen changes.

**P05's "Open in Google Maps"** is a plain link (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`). It needs no key and no account.

Not recommended: **MapTiler's free plan** (non-commercial only). **Mapbox** works, but storing a searched address needs paid Permanent geocoding, and its card requirement is unclear.

## Settings

| Name | Values | Default |
|---|---|---|
| `MAP_PROVIDER` (core-api) / `NEXT_PUBLIC_MAP_PROVIDER` (web) | `dev` (the drawn map, local fake) \| `openfreemap` \| `google` | `dev` locally; `openfreemap` on staging |
| `NEXT_PUBLIC_MAP_STYLE_URL` | the MapLibre style URL | `https://tiles.openfreemap.org/styles/liberty` |
| `GEOCODER_PROVIDER` | `dev` \| `nominatim` \| `google` | `dev` locally; `nominatim` on staging |
| `GEOCODER_USER_AGENT` | identifies Link to Nominatim (required by its policy) | `Link-staging (contact: <Link's contact address>)` |
| `GOOGLE_MAPS_API_KEY` | only if `google` is chosen later | empty |

## If you choose Google later: creating the key (needs a card: your OK first)

1. console.cloud.google.com → select or create the project `link-staging`.
2. Billing → link a billing account. This is the step that needs a card; the free usage still applies.
3. APIs & Services → Library → enable **Geocoding API** (and **Maps JavaScript API** only if Google tiles are wanted).
4. APIs & Services → Credentials → Create credentials → API key → **Edit**:
   - Application restrictions → **Websites**: `https://link-ai-web-sigma.vercel.app/*`, `http://localhost:3000/*` (for a browser key);
   - for the server-side geocoding key, a second key with **IP addresses** restriction instead (Railway's outbound IP is not fixed, so use API restrictions only and keep it secret on the server);
   - API restrictions → **Restrict key** → only the APIs from step 3.
5. Billing → Budgets & alerts → a budget of **USD 1** with alerts at 50% and 100%, so any charge is noticed at once.
6. Put the key in Railway `core-api-l9aa` → Variables → `GOOGLE_MAPS_API_KEY`, and set `GEOCODER_PROVIDER=google`.
