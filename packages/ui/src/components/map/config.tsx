'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Which map draws the tiles (docs/plan/map-provider.md, `MapProvider` adapter, web half):
 *   dev      — the drawn map: no tiles, no network (the local fake; tests and the pilot use it);
 *   maplibre — MapLibre GL with a hosted style (OpenFreeMap by default; no key).
 * The app reads its settings (`NEXT_PUBLIC_MAP_PROVIDER`, `NEXT_PUBLIC_MAP_STYLE_URL`) and passes
 * them down; the components never read the environment.
 */
export interface MapConfig {
  provider: 'dev' | 'maplibre';
  /** MapLibre style URL. */
  styleUrl: string;
  /** Where the right-to-left text plugin is served from (our own origin, for Arabic labels). */
  rtlPluginUrl: string;
  /** MapLibre's worker, served from our own origin (the bundler can't follow its URL). */
  workerUrl: string;
  /** Label language on the map tiles. */
  lang: 'ar' | 'en';
}

export const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const Ctx = createContext<MapConfig>({
  provider: 'dev',
  styleUrl: DEFAULT_MAP_STYLE,
  rtlPluginUrl: '/maplibre/mapbox-gl-rtl-text.js',
  workerUrl: '/maplibre/maplibre-gl-worker.mjs',
  lang: 'ar',
});

export function MapConfigProvider({ value, children }: { value: MapConfig; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMapConfig = () => useContext(Ctx);
