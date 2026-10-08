// CF-29 / OD-58 / 2A.6: teacher tabs follow the flags and the centre's Follow-up extra.
import { describe, expect, it } from 'vitest';
import { tabsFor } from './tabs';

describe('CF-29 tabs follow the flags', () => {
  it('the pilot (follow-up only): Today · My groups · Records', () => {
    expect(tabsFor(true, false)).toEqual(['today', 'groups', 'records']);
  });
  it('marketplace without the extra: My groups · Rooms · Earnings', () => {
    expect(tabsFor(false, true)).toEqual(['groups', 'rooms', 'earnings']);
  });
  it('OD-58: with the Follow-up extra the fourth tab is Follow-up', () => {
    expect(tabsFor(true, true)).toEqual(['groups', 'rooms', 'earnings', 'today']);
  });
  it('neither: My groups', () => {
    expect(tabsFor(false, false)).toEqual(['groups']);
  });
});
