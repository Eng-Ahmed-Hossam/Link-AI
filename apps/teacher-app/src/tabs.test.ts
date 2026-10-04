// CF-29 (decided): teacher tabs follow the flags.
import { describe, expect, it } from 'vitest';
import { tabsFor } from './tabs';

describe('CF-29 tabs follow the flags', () => {
  it('Phase 2 only (the MVP pilot): Today · My groups · Records', () => {
    expect(tabsFor(true, false)).toEqual(['today', 'groups', 'records']);
  });
  it('Phase 1 only: My groups · Rooms · Earnings', () => {
    expect(tabsFor(false, true)).toEqual(['groups', 'rooms', 'earnings']);
  });
  it('both: Today · My groups · Rooms · Earnings (Records reached from My groups and Today)', () => {
    expect(tabsFor(true, true)).toEqual(['today', 'groups', 'rooms', 'earnings']);
  });
});
