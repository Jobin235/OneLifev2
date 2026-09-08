import { z } from 'zod';

/**
 * A hand of blackjack that is actually a hand.
 *
 * The casino resolved a whole hand from one tap: the player picked a *policy* —
 * "stick on two", "take exactly one more", "play it the way the book says" —
 * and the engine played it out and reported a number. That is a bet on a
 * strategy, not a game of blackjack, and it removes the only interesting thing
 * about the game, which is looking at sixteen against a ten and having to
 * decide.
 *
 * So the hand lives on the state between taps. The cards are here because the
 * player has to be able to see them, and the draw counter is here because the
 * deck is not: cards come from a seeded walk, so the same hand replays
 * identically after a rewind without storing a shuffled shoe.
 */
export const CardSchema = z.object({
  /** 1 is an ace, 11-13 are the pictures. */
  rank: z.number().int().min(1).max(13),
  suit: z.enum(['♠', '♥', '♦', '♣']),
});
export type Card = z.infer<typeof CardSchema>;

export const BlackjackHandSchema = z.object({
  stake: z.number().int().min(0),
  you: z.array(CardSchema),
  dealer: z.array(CardSchema),
  /** How many cards have come out of the shoe, so the next draw is the next one. */
  drawn: z.number().int().min(0),
  /** Which hand of this life, so two hands in a year are not the same hand. */
  handIndex: z.number().int().min(0),
  doubled: z.boolean().default(false),
  /** Set once the dealer's hole card is turned over and the money has moved. */
  settled: z.boolean().default(false),
  /** "You win", "Bust", "Push" — only once settled. */
  outcome: z.string().nullable().default(null),
  /** Net of the stake, in cents. Only once settled. */
  net: z.number().int().default(0),
});
export type BlackjackHand = z.infer<typeof BlackjackHandSchema>;
