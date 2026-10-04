'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mockSettings, resetMockDb, setMockSettings, type Scenario } from '@link/mocks';
import { Button, Sheet } from '@link/ui';
import { FLAG_DEFAULTS, setFlagOverride, useFlags, type FlagKey } from '../flags';
import { useSession } from '../session';

/**
 * Dev-only panel (never rendered in production builds). English only on purpose: it is a tool for
 * the team, not a product screen, so its strings are not translated.
 */
export function DevPanel() {
  const [open, setOpen] = useState(false);
  const flags = useFlags();
  const qc = useQueryClient();
  const { signIn, signOut, session } = useSession();
  const [settings, setSettings] = useState(() => mockSettings());

  const update = (patch: Parameters<typeof setMockSettings>[0]) => {
    setMockSettings(patch);
    setSettings(mockSettings());
    qc.invalidateQueries();
  };

  if (process.env.NODE_ENV === 'production') return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        lang="en"
        className="fixed bottom-28 start-3 z-50 min-h-8 rounded-full bg-navy px-3 text-caption font-semibold text-white opacity-90"
      >
        Dev
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Dev panel (mock mode)"
        closeLabel="Close"
        side="center"
      >
        <div lang="en" dir="ltr" className="flex flex-col gap-4 text-body">
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label">Mock scenario (read endpoints)</legend>
            <select
              aria-label="Mock scenario"
              className="min-h-11 rounded-12 border border-border px-3"
              value={settings.scenario}
              onChange={(e) => update({ scenario: e.target.value as Scenario })}
            >
              {['default', 'empty', 'error', 'offline', 'slow'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </fieldset>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.holdSeconds < 600}
              onChange={(e) => update({ holdSeconds: e.target.checked ? 30 : 600 })}
            />
            Short seat hold (30 s instead of 10 min) to see the expired state
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!settings.reviewEachEnrolment['tch-salma']}
              onChange={(e) =>
                update({
                  reviewEachEnrolment: {
                    ...settings.reviewEachEnrolment,
                    'tch-salma': e.target.checked,
                  },
                })
              }
            />
            Ms Salma reviews each enrolment (OD-08)
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label">Feature flags</legend>
            {(Object.keys(FLAG_DEFAULTS) as FlagKey[]).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={flags[k]}
                  onChange={(e) => setFlagOverride(k, e.target.checked)}
                />
                <code>{k}</code>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                signIn({ accessToken: 'mock.usr-parent', userId: 'usr-parent', roles: ['parent'] })
              }
            >
              Sign in as sample parent
            </Button>
            {session ? (
              <Button variant="secondary" onClick={signOut}>
                Sign out
              </Button>
            ) : null}
            <Button
              variant="secondary"
              danger
              onClick={() => {
                resetMockDb();
                setSettings(mockSettings());
                qc.invalidateQueries();
              }}
            >
              Reset mock data
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
