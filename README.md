# One Life

A life simulator. You are born somewhere, things happen to you, you choose, you
live with it, and you age up. When you die, you carry on as somebody who was in
that life.

    LIVE → SOMETHING HAPPENS → CHOOSE → CONSEQUENCE → AGE UP → LIVE AGAIN

That loop is the product. Everything else — the world's economy, other players,
real-world data — is background infrastructure that exists to make one person's
life feel alive.

## Where things are

    packages/shared-types   Zod schemas and types. The vocabulary everything shares.
    packages/config         Every tunable number in the game.
    packages/simulation     Pure rules: aging, money, careers, relationships, health.
    packages/event-engine   Conditions, effects, selection, resolution.
    packages/npc-engine     People: how they are made, how they change, what they remember.
    packages/world          The shared world clock and the return-diff engine.
    packages/narrative      Turning settled outcomes into prose. Templates by default.
    packages/content        Loads and validates everything in content/.
    packages/game           The composition root. `Game.ageUp`, `Game.choose`, `Game.act`.
    apps/api                Fastify HTTP transport. Server-authoritative.
    apps/mobile             The client. Presentation only.
    content/                Events, careers, countries, traits, activities — all data.
    design/                 The design file this build follows.
    docs/                   Architecture, design system, and the content pipeline.

## Getting started

    pnpm install
    pnpm build
    pnpm test

## The two documents that matter

- `docs/DESIGN.md` — the visual and editorial system, extracted from the design file.
  Where it and the written spec disagree, the design wins.
- `docs/ARCHITECTURE.md` — why the packages are split the way they are, and which
  dependencies are not allowed to exist.

## The rule that shapes the codebase

The simulation decides what is true. The narrative layer decides how to say it.
The client decides how it looks. No layer is allowed to do another's job — in
particular, no AI-generated text can ever change a number, and no client-supplied
value is ever trusted.
