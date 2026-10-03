import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState, ErrorState, LoadingState, OfflineState } from './states';
import { Button } from './Button';
import { tFor } from '../stories/helpers';

const meta: Meta = { title: 'Primitives/States' };
export default meta;

export const Empty: StoryObj = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return <EmptyState title={t('states.empty.title')} body={t('states.empty.body')} />;
  },
};

export const Error: StoryObj = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <ErrorState
        title={t('states.error.title')}
        body={t('states.error.body')}
        action={<Button variant="secondary">{t('common.retry')}</Button>}
      />
    );
  },
};

export const Offline: StoryObj = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return <OfflineState title={t('states.offline.title')} body={t('states.offline.body')} />;
  },
};

export const Loading: StoryObj = {
  render: (_a, ctx) => <LoadingState label={tFor(ctx.globals)('states.loading.label')} />,
};
