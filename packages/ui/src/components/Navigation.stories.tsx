import type { Meta, StoryObj } from '@storybook/react-vite';
import { Baby, Search, UserRound } from 'lucide-react';
import { AppBar } from './AppBar';
import { BottomNav } from './BottomNav';
import { MockBadge } from './MockBadge';
import { Button } from './Button';
import { tFor } from '../stories/helpers';

const meta: Meta = { title: 'Primitives/Navigation' };
export default meta;

export const AppBarWithBack: StoryObj = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <AppBar
        title={t('parent.shell.title')}
        onBack={() => {}}
        backLabel={t('common.back')}
        trailing={<Button variant="quiet">{t('common.close')}</Button>}
      />
    );
  },
};

export const BottomNavParent: StoryObj = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="relative h-64">
        <div className="absolute inset-x-0 bottom-0">
          <BottomNav
            label={t('parent.nav.label')}
            activeId="search"
            items={[
              { id: 'search', label: t('parent.nav.search'), icon: <Search />, href: '#' },
              { id: 'children', label: t('parent.nav.children'), icon: <Baby />, href: '#' },
              { id: 'account', label: t('parent.nav.account'), icon: <UserRound />, href: '#' },
            ]}
          />
        </div>
        <MockBadge label={t('common.mockBadge')} />
      </div>
    );
  },
};
