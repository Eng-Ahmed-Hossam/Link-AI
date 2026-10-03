import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from './Input';
import { OtpInput } from './OtpInput';
import { tFor } from '../stories/helpers';

const meta: Meta<typeof Input> = { title: 'Primitives/Input', component: Input };
export default meta;

export const Phone: StoryObj<typeof Input> = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="max-w-sm">
        <Input
          label={t('auth.phone.label')}
          help={t('auth.phone.help')}
          prefix="+20"
          ltr
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={t('auth.phone.placeholder')}
        />
      </div>
    );
  },
};

export const WithError: StoryObj<typeof Input> = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="max-w-sm">
        <Input
          label={t('auth.phone.label')}
          prefix="+20"
          ltr
          defaultValue="12345"
          error={t('auth.otp.invalid', { remaining: 4 })}
        />
      </div>
    );
  },
};

export const Otp: StoryObj<typeof OtpInput> = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    const [v, setV] = useState('');
    return (
      <div className="max-w-sm">
        <OtpInput
          value={v}
          onChange={setV}
          label={t('auth.otp.label')}
          digitLabel={(index, total) => t('auth.otp.digit', { index, total })}
        />
      </div>
    );
  },
};

export const OtpError: StoryObj<typeof OtpInput> = {
  render: (_a, ctx) => {
    const t = tFor(ctx.globals);
    return (
      <div className="max-w-sm">
        <OtpInput
          value="123456"
          onChange={() => {}}
          label={t('auth.otp.label')}
          digitLabel={(index, total) => t('auth.otp.digit', { index, total })}
          error={t('auth.otp.invalid', { remaining: 4 })}
        />
      </div>
    );
  },
};
