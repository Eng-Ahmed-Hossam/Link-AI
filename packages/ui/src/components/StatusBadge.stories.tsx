import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatusBadge, type StatusTone } from './StatusBadge';
import { tFor } from '../stories/helpers';

const meta: Meta<typeof StatusBadge> = { title: 'Primitives/StatusBadge', component: StatusBadge };
export default meta;

const tones: StatusTone[] = ['info', 'warning', 'success', 'error', 'neutral'];

export const AllTones: StoryObj<typeof StatusBadge> = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="flex flex-wrap gap-3">
        {tones.map((tone) => (
          <StatusBadge key={tone} tone={tone}>
            {t(`common.status.${tone}`)}
          </StatusBadge>
        ))}
      </div>
    );
  },
};
