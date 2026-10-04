'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { demoApi } from '@link/api-client';
import { Button, Sheet } from '@link/ui';
import { DEMO_CONTROLS } from './api-mode';
import { refreshDemoState, useDemoState } from './demo-state';

/**
 * Demo controls (dev only: APP_ENV=local + NEXT_PUBLIC_DEMO_CONTROLS=1, never in production).
 * They stand in for the outside world during a demo: the WhatsApp provider, the parent's phone and
 * the network. English only on purpose: a presenter tool, not a product screen.
 */
export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const s = useDemoState();
  const qc = useQueryClient();

  if (!DEMO_CONTROLS) return null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setNote(`${label}: done`);
    } catch (e) {
      setNote(`${label}: ${(e as Error).message}`);
    }
    await refreshDemoState();
    await qc.invalidateQueries();
  };
  const latest = s?.messages.at(-1);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        lang="en"
        className="fixed bottom-40 start-3 z-50 min-h-11 rounded-full border border-amber bg-amberSoft px-4 text-caption font-semibold text-amber"
      >
        Demo controls
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Demo controls"
        closeLabel="Close"
        side="center"
      >
        <div lang="en" dir="ltr" className="flex flex-col gap-4 text-body">
          <p className="text-caption text-muted">
            Scenario demo-followup · {s?.records.confirmed ?? '–'} confirmed records ·{' '}
            {s?.signals.length ?? '–'} flag(s) · {s?.cases.length ?? '–'} case(s)
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" danger onClick={() => run('Reset', demoApi.reset)}>
              Reset scenario
            </Button>
            <Button
              variant="secondary"
              aria-pressed={!!s?.demo.phase2}
              onClick={() => run('Phase 2', () => demoApi.settings({ phase2: !s?.demo.phase2 }))}
            >
              Phase 2 flag: {s?.demo.phase2 ? 'on' : 'off'}
            </Button>
            <Button
              variant="secondary"
              aria-pressed={s?.demo.marketplace !== false}
              data-testid="demo-marketplace"
              onClick={() =>
                run('Marketplace', () =>
                  demoApi.settings({ marketplace: s?.demo.marketplace === false }),
                )
              }
            >
              Marketplace flag: {s?.demo.marketplace === false ? 'off' : 'on'}
            </Button>
            <Button
              variant="secondary"
              data-testid="demo-new-day"
              onClick={() => run('New day', demoApi.newDay)}
            >
              Simulate a new day
            </Button>
            <Button
              variant="secondary"
              aria-pressed={!!s?.demo.offline}
              onClick={() => run('Offline', () => demoApi.settings({ offline: !s?.demo.offline }))}
            >
              Offline: {s?.demo.offline ? 'on' : 'off'}
            </Button>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label">WhatsApp provider (mock)</legend>
            <p className="text-caption text-muted">
              Latest message:{' '}
              {latest
                ? `${latest.student} — ${latest.status}${latest.channel ? ` (${latest.channel})` : ''}`
                : 'none yet'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => run('Provider', () => demoApi.provider('advance'))}
              >
                Advance: Sent → Delivered
              </Button>
              <Button
                variant="secondary"
                onClick={() => run('Provider', () => demoApi.provider('fail'))}
              >
                Fail delivery
              </Button>
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-label">Parent's phone (mock)</legend>
            <Button variant="secondary" onClick={() => run('Reply', () => demoApi.reply())}>
              <span>
                Deliver reply “
                <bdi lang="ar" dir="rtl">
                  عندها درس تاني الأربع
                </bdi>
                ”
              </span>
            </Button>
          </fieldset>
          {note ? (
            <p role="status" className="text-caption">
              {note}
            </p>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
