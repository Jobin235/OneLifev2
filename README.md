# One Life

A life simulator. You are born somewhere, things happen to you, you choose, you
live with it, and you age up. When you die, you carry on as somebody who was in
that life.

```
LIVE → SOMETHING HAPPENS → CHOOSE → CONSEQUENCE → AGE UP → LIVE AGAIN
```

That loop is the product. Everything else — the world's economy, the people
around you, real-world data — is background infrastructure that exists to make
one person's life feel alive.

**Play it now:** the repo builds to a single self-contained HTML file with the
whole simulation running client-side. No server, no install:

```bash
pnpm install
pnpm --filter @lineage/mobile build:standalone
open apps/mobile/standalone/one-life.html   # or just open the file
```

---

## Tech stack

| Layer | What, and why |
| --- | --- |
| Language | **TypeScript 5.7**, strict, with `noUncheckedIndexedAccess` and `verbatimModuleSyntax`. Composite project references across the workspace. |
| Runtime | **Node 20+** (developed on 22). ESM throughout — no CommonJS anywhere. |
| Package manager | **pnpm 10** workspaces. Nine packages, two apps. |
| Schemas | **Zod 3**. The game state, every content file and every HTTP body is a parsed schema, not an interface. |
| Server | **Fastify 5** with `@fastify/cors` and `@fastify/rate-limit`. 53 routes, all server-authoritative. |
| Persistence | An **in-memory store** behind a repository interface — that is what the server actually runs today. A **Prisma + PostgreSQL** schema is designed and committed (`apps/api/prisma/schema.prisma`) but not yet wired: the life aggregate is one validated JSON document, since it is only ever read and written whole, and the things worth querying across players get real columns. |
| Client | **React 18 + Vite 6**, wrapped in **Capacitor 6** for iOS and Android. No state library — the client holds no game rules, so there is very little state to manage. |
| Tests | **Vitest 2**. 261 tests across 37 files. |
| Browser checks | **Playwright** driving the standalone build, for the things a unit test cannot see. |

## Architecture

> The world provides context. The simulation determines truth. The event engine
> turns state into situations. The player decides. The simulation calculates
> consequences. The narrative layer makes them entertaining. The UI presents it.

Not `UI → database → API`.

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
                 ▼
         packages/shared-types ── packages/config
```

Arrows point at what a package is allowed to import. Nothing points back up.
`packages/simulation` cannot see the event engine; the event engine cannot see
the API; the client cannot see any of it. `docs/ARCHITECTURE.md` has the full
rule and the dependencies that are deliberately forbidden.

### The rule that shapes everything

**The simulation decides what is true. The narrative layer decides how to say
it. The client decides how it looks.** No layer does another's job — in
particular, no generated text can ever change a number, and no client-supplied
value is ever trusted.

### Where things are

```
packages/shared-types   Zod schemas and types. The vocabulary everything shares.
packages/config         Every tunable number in the game, in one file.
packages/simulation     Pure rules: aging, money, careers, relationships, health.
packages/event-engine   Conditions, effects, selection, resolution.
packages/npc-engine     People: how they are made, how they change, what they remember.
packages/world          The shared world clock and the return-diff engine.
packages/narrative      Turning settled outcomes into prose. Templates by default.
packages/content        Loads and validates everything in content/.
packages/game           The composition root. `Game.ageUp`, `Game.choose`, `Game.act`.
apps/api                Fastify HTTP transport. Server-authoritative.
apps/mobile             The client. Presentation only.
content/                94 events, 49 activities, 14 interactions, careers,
                        countries, traits, stocks — all data, no code.
design/                 The design file this build follows.
docs/                   Architecture, the design system, the content pipeline.
```

### Two things worth knowing before reading the code

**A life is one state object.** `LifeState` (schema v14) holds the character,
every NPC they know, the relationships between them, careers, assets,
businesses, the world as it stood at the last age-up, and the full history. Every
mutation goes through `packages/game`, and every one of them ends with
`checkInvariants(state, before)` — 24 assertions about what a life can never be
(negative debt owed to nobody, two history entries with the same id, a dead
character with an open decision). A year that violates one is discarded, not
persisted.

**Everything is seeded.** `makeRng(seed, ...parts)` derives a deterministic
stream from the life's seed plus a path, so the same seed replays the same life
exactly — which is what makes the Time Machine (undo the year you just lived)
possible, and what lets the balance probes measure a hundred lives and get the
same answer twice.

---

## Getting started

Requirements: **Node 20+** and **pnpm 10**.

```bash
git clone https://github.com/Jobin235/OneLifev2
cd OneLifev2
pnpm install
pnpm build       # builds the packages (tsc -b, composite refs)
pnpm test        # 261 tests
```

### Play it in the browser, with no server

The whole simulation runs client-side in this build. It is a demo of the
engine rather than the shipped architecture — see the comment at the top of
`apps/mobile/src/lib/localGame.ts` for why that distinction matters — but it is
the fastest way to see the game:

```bash
pnpm --filter @lineage/mobile dev            # vite dev server, hot reload
# or, one file you can open from anywhere:
pnpm --filter @lineage/mobile build:standalone
open apps/mobile/standalone/one-life.html   # any browser will do
```

### Run the real thing: server plus client

The production path is a thin client talking to an authoritative server.

```bash
# terminal 1 — API on :3000, in-memory store, no database needed
pnpm dev:api

# terminal 2 — client on :5173, proxying /api → :3000
pnpm dev:mobile
```

Both watch and reload. The API compiles to `dist/` and runs the output rather
than stripping types in place: Node's type stripping does not rewrite a `./x.js`
specifier to `x.ts`, which is what TypeScript's ESM output requires, so running
`src/server.ts` directly fails to resolve its own imports.

The API keeps lives in memory, so it needs no database and a restart loses
them. Swapping in Postgres means implementing `LifeRepository` from
`apps/api/src/store/repository.ts` against the committed Prisma schema; that
work is not done.

### On a phone

```bash
pnpm --filter @lineage/mobile cap:sync
pnpm --filter @lineage/mobile cap:ios       # or cap:android
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm build` | Builds every package. Run this after changing a package the others import. |
| `pnpm test` | The whole suite. |
| `pnpm test:watch` | Vitest in watch mode. |
| `pnpm typecheck` | `tsc -b` across the workspace, plus the client's own pass. |
| `pnpm lint` / `pnpm format` | ESLint and Prettier. |
| `pnpm dev:api` / `pnpm dev:mobile` | The two dev servers. |
| `pnpm --filter @lineage/mobile build:standalone` | The single-file playable build. |

## Adding content

Most of the game is data. A new event is a JSON object in `content/events/`,
validated on load and picked up with no code change — conditions, weighted
outcomes, effects, and the line it writes into the log. `docs/EVENT_AUTHORING.md`
is the reference, and `content/events/funeral.json` is a short worked example of
the popup-as-form pattern the more complex screens use.

## The documents that matter

- **`docs/DESIGN.md`** — the visual and editorial system, extracted from the
  design file. Where it and the written spec disagree, the design wins.
- **`docs/ARCHITECTURE.md`** — why the packages split the way they do, and which
  dependencies are not allowed to exist.
- **`docs/BITLIFE-LOOP-SPEC.md`** — the loop this game is measured against, and
  the places it deliberately diverges.
- **`docs/EVENT_AUTHORING.md`** — how to write an event.
- **`docs/CONTENT_PIPELINE.md`** — how content is loaded, validated and shipped.

## How this codebase is worked on

Balance is measured, not argued about. When a number is wrong the fix is a probe
over sixty or a hundred lives, and the finding goes in the commit message — the
history is the record of what was actually broken and how it was found. A few
that shaped the current build:

- Three of the five stats were dead: fitness hit 0 at fifty-five and stayed
  there, smarts and charm pinned at 100 from twenty-five, and median happiness
  was 12. Every stat drifts toward a target now.
- The world engine ran for entire lives and never produced a single line,
  because the client warmed its indicators once and then froze them — and the
  hourly tick could not have moved them far enough anyway.
- Residential upkeep ran 4–10% of price against a 5.2% gross rent, so a let flat
  lost money before a tenant missed a payment, and owning where you lived cost
  more than renting it.

If you change a number, measure it.
