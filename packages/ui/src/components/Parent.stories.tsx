import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { formatCountdown, formatMoney } from '@link/i18n';
import { Avatar } from './Avatar';
import { Chip, FilterChip } from './Chip';
import { RadioCards } from './RadioCards';
import { Callout } from './Callout';
import { Rating, StarInput, Stars } from './Rating';
import { Segmented, Tabs } from './Tabs';
import { Checkbox } from './Checkbox';
import { Textarea } from './Textarea';
import { Timeline } from './Timeline';
import { Sheet } from './Sheet';
import { ToastProvider, useToast } from './Toast';
import { PhoneField } from './PhoneField';
import { ProgressBar, SectionHeader, StatTile, SummaryRow } from './Misc';
import { MobileShell, PageTitle } from './MobileShell';
import { MapView } from './MapView';
import { Countdown } from './Countdown';
import { Select } from './Select';
import { Logo } from './Logo';
import { Button } from './Button';
import { BottomNav } from './BottomNav';
import { localeOf, tFor } from '../stories/helpers';

/** Components added for Batch 1 (parent PWA). Use the toolbar to switch Arabic RTL / English LTR. */
const meta: Meta = { title: 'Parent PWA/Components' };
export default meta;
type S = StoryObj;

export const LogoVariants: S = {
  render: () => (
    <div className="flex flex-wrap items-center gap-6">
      <Logo variant="mark-halo" />
      <Logo variant="mark" />
      <Logo variant="lockup-light" />
      <span className="rounded-16 bg-navy px-5 py-4">
        <Logo variant="lockup-dark" />
      </span>
    </div>
  ),
};

export const Avatars: S = {
  render: (_a, ctx) => {
    const ar = localeOf(ctx.globals) === 'ar';
    return (
      <div className="flex items-center gap-3">
        <Avatar name={ar ? 'أ. سلمى فتحي' : 'Ms Salma Fathy'} />
        <Avatar name={ar ? 'مريم حسن' : 'Mariam Hassan'} tone="green" size="sm" />
        <Avatar name={ar ? 'أحمد سامي' : 'Ahmed Samy'} tone="amber" size="lg" />
        <Avatar name={ar ? 'مركز النور' : 'Al Nour Centre'} tone="navy" square />
      </div>
    );
  },
};

export const Chips: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [on, setOn] = useState(true);
    const [tag, setTag] = useState(false);
    return (
      <div className="flex flex-wrap gap-2">
        <Chip tone="info">{t('parent.results.within', { km: 5 })}</Chip>
        <Chip>{t('parent.child.add')}</Chip>
        <FilterChip variant="solid" pressed={on} onPressedChange={setOn}>
          {t('parent.tag.explains_clearly')}
        </FilterChip>
        <FilterChip pressed={tag} onPressedChange={setTag}>
          {t('parent.tag.patient')}
        </FilterChip>
      </div>
    );
  },
};

export const RadioCardsPlans: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [v, setV] = useState('monthly');
    return (
      <div className="max-w-sm">
        <RadioCards
          label={t('parent.pay.howToPay')}
          value={v}
          onValueChange={setV}
          options={[
            {
              value: 'monthly',
              title: t('parent.pay.plan.monthly', { name: 'Salma' }),
              description: t('parent.pay.plan.monthlyDesc', { day: 3 }),
            },
            {
              value: 'single',
              title: t('parent.pay.plan.single'),
              description: t('parent.pay.methods.cardDesc'),
            },
            { value: 'off', title: t('parent.pay.methods.wallet'), disabled: true },
          ]}
        />
      </div>
    );
  },
};

export const Callouts: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="flex max-w-sm flex-col gap-2">
        <Callout tone="info">{t('parent.search.ratingsNote')}</Callout>
        <Callout tone="success">{t('parent.reserve.perSessionTip', { fee: 'EGP 150' })}</Callout>
        <Callout tone="warning" title={t('parent.pay.expiredTitle')}>
          {t('parent.pay.expiredBody')}
        </Callout>
        <Callout tone="error" title={t('parent.pay.failedTitle')}>
          {t('parent.pay.failedBody')}
        </Callout>
        <Callout tone="neutral">{t('states.missingData')}</Callout>
      </div>
    );
  },
};

export const RatingsAndStars: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [n, setN] = useState(4);
    return (
      <div className="flex flex-col gap-3">
        <Rating
          value="4.7"
          count="(126)"
          label={t('parent.rating.label', { avg: '4.7', count: 126 })}
        />
        <Stars value={4} label={t('parent.review.stars', { count: 4 })} />
        <StarInput
          label="Rate"
          value={n}
          onValueChange={setN}
          starLabel={(k) => t('parent.review.stars', { count: k })}
        />
      </div>
    );
  },
};

export const TabsAndSegmented: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [v, setV] = useState('map');
    return (
      <div className="flex max-w-sm flex-col gap-4">
        <Tabs
          label={t('parent.centre.tabsLabel')}
          items={(['overview', 'teachers', 'timetable', 'reviews'] as const).map((k) => ({
            value: k,
            label: t(`parent.centre.tab.${k}`),
            content: <p className="text-body">{t(`parent.centre.tab.${k}`)}</p>,
          }))}
        />
        <Segmented
          label={t('parent.results.viewLabel')}
          value={v}
          onValueChange={setV}
          options={[
            { value: 'map', label: t('parent.results.map') },
            { value: 'list', label: t('parent.results.list') },
          ]}
        />
      </div>
    );
  },
};

export const FormControls: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [c, setC] = useState(false);
    const [text, setText] = useState('');
    const [phone, setPhone] = useState('');
    const [year, setYear] = useState('');
    return (
      <div className="flex max-w-sm flex-col gap-4">
        <PhoneField
          label={t('auth.phone.label')}
          value={phone}
          onChange={setPhone}
          placeholder={t('auth.phone.placeholder')}
          help={t('auth.phone.help')}
        />
        <Select
          label={t('parent.child.year')}
          value={year}
          placeholder={t('parent.child.choose')}
          onChange={(e) => setYear(e.target.value)}
          options={[
            { value: 'sec1', label: 'Secondary 1' },
            { value: 'sec2', label: 'Secondary 2' },
          ]}
        />
        <Checkbox checked={c} onCheckedChange={setC} description={t('parent.pay.sharePhoneHelp')}>
          {t('parent.pay.sharePhone', { teacher: 'Ms Salma', centre: 'Al Nour' })}
        </Checkbox>
        <Textarea
          label={t('parent.feedback.textLabel')}
          value={text}
          maxLength={600}
          onChange={(e) => setText(e.target.value)}
          counter={(n, max) => t('common.counter', { n, max })}
        />
      </div>
    );
  },
};

export const SummaryAndTimeline: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const locale = localeOf(ctx.globals);
    return (
      <div className="flex max-w-sm flex-col gap-4">
        <dl className="flex flex-col gap-2 rounded-16 border border-border bg-white p-4">
          <SummaryRow label={t('parent.pay.bookingFee')} value={formatMoney(0, locale)} />
          <SummaryRow
            strong
            label={t('parent.pay.totalToday')}
            value={formatMoney(55000, locale)}
          />
        </dl>
        <Timeline
          steps={[
            {
              id: '1',
              state: 'done',
              stateLabel: t('parent.done.state.done'),
              title: t('parent.done.step.paid'),
            },
            {
              id: '2',
              state: 'current',
              stateLabel: t('parent.done.state.current'),
              title: t('parent.done.step.teacherConfirms', { name: 'Ms Salma' }),
            },
            {
              id: '3',
              state: 'upcoming',
              stateLabel: t('parent.done.state.next'),
              title: t('parent.done.step.first'),
            },
          ]}
        />
        <div className="flex gap-2">
          <StatTile tone="amber" value="★ 4.8" label={t('parent.reviewsCount', { count: 64 })} />
          <StatTile value="2" label={t('parent.teacher.centres', { count: 2 })} />
        </div>
        <ProgressBar value={96} max={126} label="5 stars" />
        <SectionHeader
          title={t('parent.search.topTeachers', { subject: 'Maths' })}
          action={<a className="text-label text-blueText">{t('parent.search.seeAll')}</a>}
        />
        <p className="text-body">
          {t('parent.pay.heldFor')}{' '}
          <Countdown
            seconds={582}
            format={(s) => formatCountdown(s, locale)}
            label={t('parent.pay.holdTimer')}
          />
        </p>
      </div>
    );
  },
};

export const SheetDialog: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>{t('parent.children.manage')}</Button>
        <Sheet
          open={open}
          onOpenChange={setOpen}
          title={t('parent.children.manage')}
          closeLabel={t('common.close')}
        >
          <Button variant="secondary">{t('parent.manage.stopPlan')}</Button>
          <Button variant="secondary" danger>
            {t('parent.manage.cancel')}
          </Button>
        </Sheet>
      </>
    );
  },
};

function ToastDemo({ label }: { label: string }) {
  const toast = useToast();
  return <Button onClick={() => toast(label)}>{label}</Button>;
}
export const ToastStory: S = {
  name: 'Toast',
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <ToastProvider label={t('common.notifications')}>
        <ToastDemo label={t('parent.fawry.copied')} />
      </ToastProvider>
    );
  },
};

export const MapViewDev: S = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="max-w-sm">
        <MapView
          label={t('parent.results.mapLabel', { count: 3 })}
          centre={{ lat: 29.958, lng: 31.259 }}
          pins={[
            {
              id: 'a',
              lat: 29.9602,
              lng: 31.2569,
              label: t('parent.results.teachersCount', { count: 2 }),
              state: 'open',
              selected: true,
            },
            {
              id: 'b',
              lat: 29.9665,
              lng: 31.2761,
              label: t('parent.results.teachersCount', { count: 1 }),
              state: 'open',
            },
            {
              id: 'c',
              lat: 29.9531,
              lng: 31.2498,
              label: t('parent.results.pinWaitlist'),
              state: 'waitlist',
            },
          ]}
        />
      </div>
    );
  },
};

export const MobileFrame: S = {
  parameters: { layout: 'fullscreen' },
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <MobileShell
        logo={<Logo size={25} />}
        eyebrow={t('parent.shell.eyebrow')}
        footer={
          <BottomNav
            label={t('parent.nav.label')}
            activeId="search"
            items={[
              { id: 'search', label: t('parent.nav.search'), href: '#' },
              { id: 'children', label: t('parent.nav.children'), href: '#' },
              { id: 'account', label: t('parent.nav.account'), href: '#' },
            ]}
          />
        }
      >
        <PageTitle
          context={t('parent.search.area')}
          title={t('parent.search.titleVisitor')}
          subtitle={t('parent.search.needHelpGeneric')}
        />
      </MobileShell>
    );
  },
};
