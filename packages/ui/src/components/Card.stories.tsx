import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';
import { tFor, localeOf } from '../stories/helpers';
import { formatMoney } from '@link/i18n';

const meta: Meta<typeof Card> = { title: 'Primitives/Card', component: Card };
export default meta;

export const Raised: StoryObj<typeof Card> = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const locale = localeOf(ctx.globals);
    return (
      <Card className="max-w-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-heading">{t('parent.shell.title')}</h3>
            <p className="text-body text-muted">{t('common.seatsLeft', { count: 2 })}</p>
          </div>
          <StatusBadge tone="success">{t('common.status.success')}</StatusBadge>
        </div>
        <p className="mt-3 text-label">{formatMoney(55000, locale)}</p>
      </Card>
    );
  },
};

export const Flat: StoryObj<typeof Card> = {
  render: (_a, ctx) => (
    <Card elevation="flat" className="max-w-sm">
      {tFor(ctx.globals)('states.empty.body')}
    </Card>
  ),
};
