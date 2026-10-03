import type { ReactNode } from 'react';
import { cn } from '../cn';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** `open` (seats) or `waitlist` (every matching group is full; CF-28). */
  state: 'open' | 'waitlist';
  selected?: boolean;
  onSelect?: () => void;
}

export interface MapViewProps {
  pins: MapPin[];
  /** Map centre, e.g. the parent's chosen area. Shown as the "you are here" marker. */
  centre: { lat: number; lng: number };
  /** Accessible summary ("Map of 3 centres near Maadi"). The list view is the full alternative. */
  label: string;
  className?: string;
  children?: ReactNode;
}

const dot: Record<MapPin['state'], string> = { open: 'bg-blue', waitlist: 'bg-amber' };

/**
 * MapView — development implementation (OD-46: provider not chosen). Plots pins from fixture
 * coordinates on a stylised background; no tiles, no network. The real provider replaces the
 * body of this component, not its props.
 *
 * Maps are not mirrored in RTL (north stays up, east stays right): the canvas is an LTR isolate.
 */
export function MapView({ pins, centre, label, className, children }: MapViewProps) {
  // Fit all pins plus the centre into the box with a margin.
  const pts = [...pins, { ...centre }];
  const lats = pts.map((p) => p.lat);
  const lngs = pts.map((p) => p.lng);
  const pad = 0.004;
  const minLat = Math.min(...lats) - pad;
  const maxLat = Math.max(...lats) + pad;
  const minLng = Math.min(...lngs) - pad;
  const maxLng = Math.max(...lngs) + pad;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng || 1)) * 80 + 10; // %
  const y = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat || 1)) * 80 + 10; // %

  return (
    <div
      role="group"
      aria-label={label}
      dir="ltr"
      className={cn('relative h-80 w-full overflow-hidden rounded-16 bg-greenSoft', className)}
    >
      {/* Stylised streets and the river (decorative). */}
      <div aria-hidden className="absolute inset-0">
        <div className="absolute -top-10 bottom-[-40px] start-[45%] w-16 rotate-12 rounded-full bg-blueSoft" />
        <div className="absolute inset-x-0 top-[30%] h-2 -rotate-3 bg-white" />
        <div className="absolute inset-x-0 top-[50%] h-1.5 bg-white" />
        <div className="absolute inset-x-0 top-[66%] h-2 rotate-2 bg-white" />
        <div className="absolute inset-y-0 start-[12%] w-2 rotate-6 bg-white" />
        <div className="absolute inset-y-0 start-[58%] w-1.5 -rotate-6 bg-white" />
      </div>
      <span
        aria-hidden
        className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-blue/20"
        style={{ insetInlineStart: `${x(centre.lng)}%`, top: `${y(centre.lat)}%` }}
      >
        <span className="size-3.5 rounded-full border-2 border-white bg-blue" />
      </span>
      {pins.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={p.onSelect}
          aria-pressed={p.selected}
          className={cn(
            'absolute flex min-h-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-caption shadow-card',
            p.selected ? 'bg-navy text-white' : 'bg-white text-navy',
          )}
          style={{ insetInlineStart: `${x(p.lng)}%`, top: `${y(p.lat)}%` }}
        >
          <span aria-hidden className={cn('size-2 rounded-full', dot[p.state])} />
          {p.label}
        </button>
      ))}
      {children}
    </div>
  );
}
