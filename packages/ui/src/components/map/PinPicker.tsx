'use client';

import { lazy, Suspense, useRef, useState, type PointerEvent } from 'react';
import { cn } from '../../cn';
import { useMapConfig } from './config';

const LibreMap = lazy(() => import('./LibreMap').then((m) => ({ default: m.LibreMap })));

export interface PinPickerProps {
  /** The pin. */
  value: { lat: number; lng: number };
  onChange?: (p: { lat: number; lng: number }) => void;
  /** Where the drawn map is framed (the pin when editing started). */
  origin: { lat: number; lng: number };
  editable: boolean;
  label: string;
  className?: string;
}

/** The drawn map spans about 1 km each way around its origin (provider `dev`). */
const SPAN = 0.01;

/**
 * PinPicker — the C02 location picker's map: one pin the owner drags to the exact door, or
 * places with a tap (Part B). With provider `maplibre` it is a real map; with `dev` (the local
 * fake, tests, the pilot) a drawn frame with the same behaviour and no network. Keyboard users
 * move the pin with the nudge buttons next to it (C02).
 */
export function PinPicker(props: PinPickerProps) {
  const cfg = useMapConfig();
  if (cfg.provider === 'maplibre')
    return (
      <Suspense fallback={<div className={cn('rounded-12 bg-soft', props.className)} />}>
        <LibreMap
          config={cfg}
          centre={props.value}
          zoom={16}
          interactive={props.editable}
          label={props.label}
          className={cn(
            'overflow-hidden rounded-12',
            props.className,
            props.editable && 'ring-2 ring-blue',
          )}
          testId="location-map"
          draggable={
            props.editable && props.onChange
              ? { ...props.value, onChange: props.onChange }
              : undefined
          }
          pins={
            props.editable
              ? []
              : [{ id: 'pin', lat: props.value.lat, lng: props.value.lng, label: '' }]
          }
        />
      </Suspense>
    );
  return <DrawnPicker {...props} />;
}

function DrawnPicker({ value, onChange, origin, editable, label, className }: PinPickerProps) {
  const frame = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  // Pin position in the frame, as a percentage (start = west, so the drawing mirrors in RTL).
  const x = Math.min(95, Math.max(5, 50 + ((value.lng - origin.lng) / SPAN) * 50));
  const y = Math.min(95, Math.max(5, 50 - ((value.lat - origin.lat) / SPAN) * 50));
  const at = (clientX: number, clientY: number) => {
    const r = frame.current!.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
    const east = document.documentElement.dir === 'rtl' ? 1 - fx : fx;
    return { lat: origin.lat + (0.5 - fy) * 2 * SPAN, lng: origin.lng + (east - 0.5) * 2 * SPAN };
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!editable || !onChange) return;
    frame.current!.setPointerCapture?.(e.pointerId);
    setDragging(true);
    onChange(at(e.clientX, e.clientY));
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging && onChange) onChange(at(e.clientX, e.clientY));
  };
  const up = () => setDragging(false);

  return (
    <div
      ref={frame}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="group"
      aria-label={label}
      className={cn(
        'relative h-40 w-full touch-none overflow-hidden rounded-12 bg-soft select-none',
        editable && 'cursor-crosshair ring-2 ring-blue',
        className,
      )}
      data-testid="location-map"
    >
      <span aria-hidden className="absolute inset-y-0 start-1/3 w-2 bg-white" />
      <span aria-hidden className="absolute inset-x-0 top-1/2 h-2 bg-white" />
      <span aria-hidden className="absolute inset-y-0 end-12 w-10 -skew-x-12 bg-blueSoft" />
      <span
        aria-hidden
        data-testid="picker-pin"
        className={cn(
          'absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue shadow-card rtl:translate-x-1/2',
          editable && 'cursor-grab',
          dragging && 'cursor-grabbing',
        )}
        style={{ insetInlineStart: `${x}%`, top: `${y}%` }}
      />
    </div>
  );
}
