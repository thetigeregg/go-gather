import { getEventTypeColor } from './calendar-event-type-info.util';

describe('getEventTypeColor', () => {
  it('resolves a known event type color', () => {
    expect(getEventTypeColor('community-day')).toBe('#1660a9');
  });

  it('falls back to a neutral color for an unrecognized event type', () => {
    expect(getEventTypeColor('some-new-event-type')).toBe('#666666');
  });
});
