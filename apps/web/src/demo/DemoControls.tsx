'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { demoApi } from '@link/api-client/demo';
import { Button, Sheet } from '@link/ui';
import { DEMO_CONTROLS } from '../api-mode';
import { refreshDemoState, useDemoState } from './demo-state';

/**
 * Demo controls (dev only: APP_ENV=local + NEXT_PUBLIC_DEMO_CONTROLS=1, never in production).
 * They stand in for the outside world during a demo: the WhatsApp provider, the parent's phone and
 * the network. English only on purpose: a presenter tool, not a product screen.
 */
export function DemoControls({ showButton = true }: { showButton?: boolean }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'center' | 'end'>('center');
  const [note, setNote] = useState<string | null>(null);
  const s = useDemoState();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  // The connected story (Step 2B): where it is, for the labels below.
  const story = useQuery({
    queryKey: ['demo-story'],
    queryFn: demoApi.story,
    enabled: open,
    refetchInterval: open ? 3000 : false,
  });
  // The dev index (`/{lang}/dev`) opens the panel with a `link:demo-controls` event.
  useEffect(() => {
    // The demo banner's "Demo tools" link opens them as a side panel (local demo only).
    const show = (e: Event) => {
      setSide((e as CustomEvent<{ side?: 'end' }>).detail?.side === 'end' ? 'end' : 'center');
      setOpen(true);
    };
    window.addEventListener('link:demo-controls', show);
    return () => window.removeEventListener('link:demo-controls', show);
  }, []);

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
      {showButton ? (
        <button
          type="button"
          onClick={() => {
            setSide('center');
            setOpen(true);
          }}
          lang="en"
          className="fixed bottom-40 start-3 z-50 min-h-11 rounded-full border border-amber bg-amberSoft px-4 text-caption font-semibold text-amber"
        >
          Demo controls
        </button>
      ) : null}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Demo controls"
        closeLabel="Close"
        side={side}
      >
        <div lang="en" dir="ltr" className="flex flex-col gap-4 text-body">
          <section
            aria-labelledby="story-title"
            className="flex flex-col gap-2 rounded-16 bg-soft p-3"
            data-testid="story-controls"
          >
            <h3 id="story-title" className="text-label text-navy">
              Connected story (docs/testing/walkthrough.md)
            </h3>
            <p className="text-caption text-muted" data-testid="story-state">
              {story.data
                ? `Request ${story.data.stage ?? '—'} · group ${story.data.groupId ? 'open' : '—'} · ` +
                  `sessions done ${story.data.sessionsDone} · Follow-up extra ${story.data.followupExtra ? 'on' : 'off'}`
                : '…'}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <Button
                variant="secondary"
                danger
                data-testid="story-reset"
                onClick={() => run('Reset story', demoApi.storyReset)}
              >
                Reset story
              </Button>
              <label className="flex flex-col gap-1 text-caption text-muted">
                Jump to step
                <select
                  value={step}
                  onChange={(e) => setStep(Number(e.target.value))}
                  data-testid="story-step"
                  className="min-h-11 rounded-12 border border-border bg-white px-3 text-body text-navy"
                >
                  {Array.from({ length: 9 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                data-testid="story-jump"
                onClick={() => run(`Jump to step ${step}`, () => demoApi.storyJump(step))}
              >
                Jump to step {step}
              </Button>
              <Button
                variant="secondary"
                data-testid="story-session-done"
                disabled={!story.data?.groupId}
                onClick={() => run('Session done', demoApi.storySessionDone)}
              >
                {story.data?.sessionsDone
                  ? 'Simulate next session done'
                  : 'Simulate first session done'}
              </Button>
              <Button
                variant="secondary"
                aria-pressed={!!story.data?.followupExtra}
                data-testid="story-extra"
                onClick={() =>
                  run('Follow-up extra', () => demoApi.storyExtra(!story.data?.followupExtra))
                }
              >
                Follow-up extra: {story.data?.followupExtra ? 'on' : 'off'}
              </Button>
            </div>
          </section>
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
              aria-pressed={!!s?.demo.realStt}
              data-testid="demo-real-stt"
              onClick={() =>
                run('Speech-to-text', () => demoApi.settings({ realStt: !s?.demo.realStt }))
              }
            >
              Speech-to-text: {s?.demo.realStt ? 'local Whisper (real)' : 'fixture'}
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
