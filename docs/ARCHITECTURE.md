# Architecture

The one-sentence version:

> **The world provides context. The simulation determines truth. The event engine
> turns state into situations. The player decides. The simulation calculates
> consequences. The narrative layer makes them entertaining. The UI presents it.**

Not `UI → database → API`.

## The dependency rule

```
        apps/api            apps/mobile
            │                    │
            ▼                    │  HTTPS only
      packages/game  ◄───────────┘
            │
   ┌────────┼─────────┬──────────┬───────────┐
   ▼        ▼         ▼          ▼           ▼
event-  npc-engine  world   narrative    content
engine      │         │         │           │
   └────────┴────┬────┴─────────┘           │
                 ▼                          │
          packages/simulation ◄─────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
  shared-types        config
```

Arrows point at what a package is allowed to import. There are only three rules,
and they are the ones worth enforcing in review:

1. **`simulation` imports nothing but `shared-types` and `config`.** No HTTP, no
   Prisma, no Fastify, no React, no AI SDK. This is what makes the game rules
   testable in milliseconds and portable to any transport.
2. **`content` depends only on `shared-types`.** Content is validated against
   schemas, not against engines. Otherwise a content change can break the engine
   and an engine change can invalidate content, and neither can move alone.
3. **Nothing below `game` knows the client exists.** `packages/game` is the
   composition root — the only place that wires content, config, simulation,
   events, NPCs, world and narrative into an operation a request can call.

`apps/api` is transport. `apps/mobile` is presentation. Both are replaceable.

## The three clocks

Conflating any two of these breaks the product. They are deliberately separate
types in separate places:

| Clock | Where it lives | Advances when |
| --- | --- | --- |
| **World time** | `packages/world`, `WorldEngine` | On a schedule, hourly, for everyone at once |
| **Life time** | `LifeState.character.age` | Only when the player taps AGE UP |
| **Interaction time** | `Date`, in cooldowns and rate limits | Real time, for anti-abuse and notifications |

A character does **not** age because a day passed. `advanceYear` is the only
function that increments age, and only a request can call it.

## One age-up

`Game.ageUp` runs the whole year in one transaction. If `checkInvariants` throws
at the end, the caller discards the state rather than persisting it.

```
validate the character is alive and has no open decision
      ↓
snapshot the state (for the invariant diff and for rollback)
      ↓
advance age, clear the year
      ↓
age drift  →  NPC year  →  relationship decay
      ↓
school  →  work  →  businesses  →  prison
      ↓
health conditions  →  cost of living  →  settle the year's money
      ↓
retirement
      ↓
refresh derived state (bands, subtitles, NPC tiers, action budget)
      ↓
mortality roll        ← a dead character gets no card
      ↓
select events: gate → bind participants → score → shortlist → pick
      ↓
instantiate one major card; auto-resolve the minor ones into recap lines
      ↓
check invariants  →  return the new state, the card, and the recap
```

## Where randomness comes from

Every roll is drawn from a stream keyed by the life's seed plus a path saying
*what* is being decided:

```ts
makeRng(state.seed, 'ageup', age, step)
makeRng(state.seed, 'resolve', instanceId, choiceId)
```

Two properties follow, and both are load-bearing:

- A life replays exactly from `seed` + the choice history, so a bug report is
  reproducible and a suspicious life is auditable.
- Adding a new roll in the middle of the pipeline does not shift every roll after
  it, because streams are keyed rather than sequential. A sequential PRNG makes
  every tuning change a silent rebalance of everything downstream.

The seed is generated server-side and never returned to the client.

## Why the life aggregate is one JSON document

`LifeState` is read and written whole, on every request, by one player. Splitting
it across the ~25 tables the specification sketches would mean dozens of joins to
render one screen and a distributed transaction to age up once.

So: the aggregate is stored as validated JSON, and the fields worth querying
across players — name, age, alive, generation, net worth, content version — are
projected into columns beside it. Event instances and life history are separately
relational, because those *are* queried across players: "how do people actually
answer this event?" is the question live-ops needs to answer, and it should not
require scanning every life document.

See `apps/api/prisma/schema.prisma`.

## AI cannot change a number

```
Simulation Engine
      ↓  decides what happened
Structured outcome
      ↓
Narrative service
      ↓  decides how to say it
Validated string
      ↓
Client
```

`NarrativeService` returns strings. There is no method on it that returns state,
and no code path from a model's output into `LifeState`. `ModelNarrativeService`
computes the template fallback *first*, then tries the model, then validates the
result and discards anything that fails. If the model is unavailable, the game is
fully playable — that is a requirement, not a degradation.

The same applies to content: `Effect` is a closed discriminated union. A content
file can ask for one of the enumerated operations and nothing else. There is no
expression evaluator and no route from a JSON file into executable code.

## What the client is not allowed to do

The client sends intent and renders responses. It never sends an age, a balance,
an outcome, or a seed. Every one of these is checked server-side:

- Can this player age up? (alive, no open decision)
- Was this choice offered on this instance?
- Has this instance already been resolved?
- Can they afford this activity, at this age, with actions left?
- Does this life belong to this user?

The API tests assert each of these by trying to break them.

## What is deliberately not built

Honest gaps, so nobody mistakes them for oversights:

- **Auth** is a placeholder header. Apple/Google sign-in slots into
  `userOf(request)` and nothing else changes.
- **Persistence** is in-memory. The Prisma schema is written; the repository
  implementation is not. `LifeRepository` is the whole surface to implement.
- **`withLock`** serialises within one process. Multiple API instances need the
  row-level lock the schema's `version` column is there for.
- **Redis, BullMQ, workers** — the world engine currently runs on a timer inside
  the API process, which is fine for one instance and wrong for several.
- **Real-world data ingestion** has its seam (`tickWorld`'s `externalSignals`) and
  no adapters. By design: the game must work with none of them.
- **Graduate education** has no path, so medicine and law are unreachable tracks.
