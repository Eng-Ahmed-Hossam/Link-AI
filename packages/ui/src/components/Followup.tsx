import type { ReactNode } from 'react';
import { cn } from '../cn';

/** KPI card (11 §3): metric number + label + one-line context. */
export function KpiCard({
  value,
  label,
  context,
  tone = 'navy',
  className,
  testId,
}: {
  value: ReactNode;
  label: ReactNode;
  context?: ReactNode;
  tone?: 'navy' | 'red' | 'amber';
  className?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={cn(
        'flex flex-col gap-2 rounded-16 border border-border bg-white p-5 shadow-card',
        className,
      )}
    >
      <span
        className={cn(
          'text-metric',
          tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber' : 'text-navy',
        )}
      >
        {value}
      </span>
      <span className="text-label text-navy">{label}</span>
      {context ? <span className="text-caption text-muted">{context}</span> : null}
    </div>
  );
}

export interface EvidenceItem {
  id: string;
  /** The fact ("Attendance • 24 September • Absent"). */
  fact: ReactNode;
  /** Where it comes from ("Session record • confirmed by Ms Salma"). */
  source: ReactNode;
}

/** Evidence list (11 §3): every claim lists its source record and who confirmed it. */
export function EvidenceList({
  items,
  label,
  className,
}: {
  items: EvidenceItem[];
  label: string;
  className?: string;
}) {
  return (
    <ul aria-label={label} className={cn('flex flex-col gap-3', className)}>
      {items.map((i) => (
        <li key={i.id} className="flex gap-3">
          <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-green" />
          <div className="flex flex-col">
            <span className="text-label text-navy">{i.fact}</span>
            <span className="text-caption text-muted">{i.source}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * V05 · WhatsApp preview — STORYBOOK ONLY. The parent's own WhatsApp is not an app screen; this shows
 * how an approved utility template reads on a phone, for demos. Never rendered in the product.
 */
export function WhatsAppPreview({
  sender,
  text,
  time,
  status,
}: {
  sender: string;
  text: string;
  time: string;
  /** Provider-reported status, shown as ticks. */
  status: 'sent' | 'delivered' | 'read';
}) {
  return (
    <div className="flex w-[360px] flex-col overflow-hidden rounded-24 border border-border bg-soft">
      <div className="bg-navy px-4 py-3 text-label text-white">{sender}</div>
      <div className="flex flex-col gap-2 p-4">
        <div
          dir="rtl"
          lang="ar"
          className="max-w-[85%] self-start rounded-16 bg-white p-3 text-body text-navy shadow-subtle"
        >
          <p>{text}</p>
          <p className="mt-1 text-caption text-muted" dir="ltr">
            {time} {status === 'sent' ? '✓' : status === 'delivered' ? '✓✓' : '✓✓ read'}
          </p>
        </div>
      </div>
    </div>
  );
}
