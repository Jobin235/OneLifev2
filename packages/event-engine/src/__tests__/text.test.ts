import { describe, expect, it } from 'vitest';
import { interpolate } from '../text.js';
import type { LifeState } from '@lineage/shared-types';

/** The writing rules the engine enforces so authors do not have to remember them. */

const state = {
  character: { firstName: 'Alex', lastName: 'Rivera', age: 31, cityId: 'portland' },
  relationships: [{ npcId: 'n1', kind: 'partner' }],
  npcs: [{ id: 'n1', firstName: 'Emma', lastName: 'Chen', sex: 'female', occupation: 'lawyer' }],
  businesses: [],
  career: { current: null },
  education: { current: null },
} as unknown as LifeState;

const bindings = { partner: 'n1' };

describe('interpolation', () => {
  it('resolves a role to the actual person', () => {
    expect(interpolate('{partner} called.', state, bindings)).toBe('Emma called.');
  });

  it('resolves pronouns from the person, not the template', () => {
    expect(interpolate('You told {partner.them} {partner.they} was right.', state, bindings)).toBe(
      'You told her she was right.',
    );
  });

  it('capitalises a pronoun that opens a sentence', () => {
    // Without this, "{partner.they} said yes" renders as "she said yes" on the card.
    expect(interpolate('{partner.they} said yes.', state, bindings)).toBe('She said yes.');
  });

  it('capitalises after sentence-ending punctuation too', () => {
    expect(
      interpolate('You waited. {partner.they} did not. {partner.they} left.', state, bindings),
    ).toBe('You waited. She did not. She left.');
  });

  it('leaves the rest of the prose alone', () => {
    const written = 'You took it. Emma said she would visit. She visited twice.';
    expect(interpolate(written, state, bindings)).toBe(written);
  });

  it('handles an opening quote', () => {
    expect(interpolate('"{partner.they} is fine," you said.', state, bindings)).toBe(
      '"She is fine," you said.',
    );
  });

  it('falls back rather than showing a raw token', () => {
    const out = interpolate('{friend} asked you for money.', state, {});
    expect(out).not.toMatch(/\{/);
    expect(out).toBe('Someone you know asked you for money.');
  });
});
