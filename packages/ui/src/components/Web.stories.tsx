import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FaqItem, WebButton } from './Web';
import { tFor } from '../stories/helpers';

const meta: Meta<typeof WebButton> = { title: 'Website/Link Web', component: WebButton };
export default meta;
type S = StoryObj<typeof WebButton>;

/** Figma `Link Web / Button` (69:629): Primary, On dark, Outline, Dark; hover in the browser. */
export const Buttons: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-3">
          <WebButton>{t('landing.cta.try')}</WebButton>
          <WebButton style="outline" arrow={false}>
            {t('landing.cta.pilot')}
          </WebButton>
          <WebButton style="dark">{t('landing.cta.pilot')}</WebButton>
        </div>
        <div className="flex flex-wrap gap-3 rounded-24 bg-navy p-6">
          <WebButton>{t('landing.cta.try')}</WebButton>
          <WebButton style="onDark" arrow={false}>
            {t('landing.cta.pilot')}
          </WebButton>
        </div>
      </div>
    );
  },
};

/** Figma `Link Web / FAQ item` (76:657): one open at a time. */
export const Faq: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const Demo = () => {
      const [open, setOpen] = useState(0);
      return (
        <div className="flex max-w-[700px] flex-col gap-3">
          {(
            [
              ['landing.faq.q1', 'landing.faq.a1'],
              ['landing.faq.q2', 'landing.faq.a2'],
              ['landing.faq.q3', 'landing.faq.a3'],
            ] as const
          ).map(([q, a], i) => (
            <FaqItem
              key={q}
              question={t(q)}
              answer={t(a)}
              open={open === i}
              onToggle={() => setOpen(open === i ? -1 : i)}
            />
          ))}
        </div>
      );
    };
    return <Demo />;
  },
};
