import { describe, expect, it } from 'vitest';
import { isPhrase } from '../extract.ts';

/**
 * The guarantee this whole tool rests on: prose cannot get through.
 *
 * If `isPhrase` ever starts accepting sentences, the reference index becomes a
 * pile of someone else's CC-BY-SA text sitting in our repo, and the temptation to
 * paste from it becomes real. That is the failure mode worth a test.
 */

describe('the extractor keeps labels and drops prose', () => {
  const labels = [
    'Military Officer',
    'Flight Attendant',
    'Card fraud',
    'Go to rehab',
    'Bank Robbery',
    'Plastic Surgery',
    'Emigrate',
  ];

  const prose = [
    'You can join the military at 18 if your fitness is high enough',
    'This is a sentence about what the player can do when they are older.',
    'The salary is higher if you have a degree',
    'When you commit a crime, there is a chance you will be caught.',
    'Your happiness will drop if you do this too often',
    'After you graduate, new careers become available',
  ];

  it('accepts short labels', () => {
    for (const label of labels) {
      expect(isPhrase(label), label).toBe(true);
    }
  });

  it('rejects anything that reads like a sentence', () => {
    for (const sentence of prose) {
      expect(isPhrase(sentence), sentence).toBe(false);
    }
  });

  it('rejects on length even without a giveaway verb', () => {
    expect(isPhrase('one two three four five six seven')).toBe(false);
    expect(
      isPhrase('a very long label that nobody would ever actually use as a title'),
    ).toBe(false);
  });

  it('rejects anything ending in sentence punctuation', () => {
    expect(isPhrase('Military Officer.')).toBe(false);
    expect(isPhrase('Really?')).toBe(false);
  });

  it('rejects empty and whitespace input', () => {
    expect(isPhrase('')).toBe(false);
    expect(isPhrase('   ')).toBe(false);
  });
});
