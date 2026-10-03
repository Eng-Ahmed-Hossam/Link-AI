import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Button';
import { tFor } from '../stories/helpers';

const meta: Meta<typeof Button> = { title: 'Primitives/Button', component: Button };
export default meta;
type S = StoryObj<typeof Button>;

const row = (ctx: { globals: Record<string, unknown> }) => {
  const t = tFor(ctx.globals);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button>{t('common.continue')}</Button>
      <Button variant="secondary">{t('common.cancel')}</Button>
      <Button variant="quiet">{t('common.back')}</Button>
      <Button disabled>{t('common.next')}</Button>
      <Button variant="secondary" danger>
        {t('common.close')}
      </Button>
    </div>
  );
};

export const AllVariants: S = { render: (_a, ctx) => row(ctx) };
export const Block: S = {
  render: (_a, ctx) => <Button block>{tFor(ctx.globals)('common.continue')}</Button>,
};
