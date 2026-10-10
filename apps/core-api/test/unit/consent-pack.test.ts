// OD-60 consent pack: version labels per text, drafts until approved (BR-DAT-03).
import { describe, expect, it } from 'vitest';
import {
  consentVersion,
  draftConsentTexts,
  isDraftVersion,
  parseConsentVersions,
} from '../../src/identity/consent-pack';

describe('OD-60 consent pack labels', () => {
  it('defaults to the draft labels the sample data uses', () => {
    expect(consentVersion('child_data_processing', {})).toBe('draft-2026-10');
    expect(consentVersion('contact', {})).toBe('c01-draft-2026-10');
    expect(draftConsentTexts({})).toContain('terms');
  });

  it('CONSENT_VERSIONS sets the approved labels; unlisted texts stay drafts', () => {
    const env = { CONSENT_VERSIONS: 'terms=2026-11-v1, privacy = 2026-11-v1' };
    expect(consentVersion('terms', env)).toBe('2026-11-v1');
    expect(consentVersion('privacy', env)).toBe('2026-11-v1');
    expect(draftConsentTexts(env)).not.toContain('terms');
    expect(draftConsentTexts(env)).toContain('child_data_processing');
  });

  it('refuses an unknown text or a bad label, naming it', () => {
    expect(() => parseConsentVersions('cookies=v1')).toThrow(/unknown text "cookies"/);
    expect(() => parseConsentVersions('terms=')).toThrow(/"terms" needs a label/);
    expect(() => parseConsentVersions('terms=has space')).toThrow(/"terms"/);
  });

  it('a draft is any label with a "draft" part', () => {
    expect(isDraftVersion('draft-2026-10')).toBe(true);
    expect(isDraftVersion('c01-draft-2026-10')).toBe(true);
    expect(isDraftVersion('2026-11-v1')).toBe(false);
    expect(isDraftVersion('drafty')).toBe(false);
  });
});
