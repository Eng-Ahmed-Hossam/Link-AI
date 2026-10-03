import { useEffect } from 'react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { dirOf, type Locale } from '@link/i18n';
import { LinkProvider } from '../src';
import '../src/styles.css';

/** Toolbar toggle: language AND direction (Arabic RTL default, English LTR). */
const withLocale: Decorator = (Story, ctx) => {
  const locale = (ctx.globals.locale ?? 'ar') as Locale;
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dirOf(locale);
  }, [locale]);
  return (
    <LinkProvider locale={locale}>
      <div lang={locale} dir={dirOf(locale)} className="min-h-24 bg-bg p-4 text-navy">
        <Story />
      </div>
    </LinkProvider>
  );
};

const preview: Preview = {
  decorators: [withLocale],
  globalTypes: {
    locale: {
      description: 'Language and direction',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'ar', title: 'العربية (RTL)' },
          { value: 'en', title: 'English (LTR)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'ar' },
  parameters: { layout: 'fullscreen', controls: { expanded: true } },
};

export default preview;
