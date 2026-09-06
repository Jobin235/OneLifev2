# Content pipeline, and what to do with the wikis

## The short version

The BitLife and Another Life wikis are useful as a **structural checklist** —
what systems exist, what a career ladder looks like, which numbers players care
about — and are **not** a source of text for this game.

That is one engineering call and two separate reasons, and both matter:

1. **Licensing.** Fandom wikis are CC-BY-SA. Prose lifted from them carries a
   share-alike obligation and an attribution obligation into a commercial app
   store build. Names, numeric ranges and category lists are facts about another
   product and are not copyrightable as such; paragraphs are.
2. **Design.** The whole value of `design/LINEAGE-v2-Life-First.dc.html` is its
   voice. "Marcus called you in. More money, better title, 1,200 miles away" is
   the product. A wiki summary of another game's event is the opposite of it.
   Pasting one in would make the game measurably worse even if it were free.

So the pipeline extracts **structure and numbers**, produces a **coverage report**
against what we have, and hands a human a list of gaps to write into. It never
emits shippable content.

## What the pipeline is for

Right now `content/` has 47 events against a target of 200+. The wikis are the
fastest way to answer "what have we not thought of?" — military service, addiction
and recovery, religion, adoption, lawsuits, emigration, the dozen career families
we have no ladder for. That is a checklist problem, and a checklist is exactly
what a wiki is good for.

## The stages

```
   MediaWiki API                 (not HTML scraping — see below)
        │
        ▼
   tools/wiki-ingest fetch       raw pages → out/raw/*.json
        │
        ▼
   tools/wiki-ingest extract     structure only → out/index.json
        │                        (page titles, categories, career names,
        │                         stat names, numeric ranges, list items)
        ▼
   tools/wiki-ingest report      out/coverage.md
        │                        what they have that we do not
        ▼
   A HUMAN WRITES THE EVENT      in our voice, from scratch
        │
        ▼
   content/events/*.json         validated on load, tested, playtested
```

The arrow that matters is the one labelled in capitals. There is no automated
path from `out/` into `content/`, and adding one would be a mistake.

### Why the API, not HTML

Fandom exposes `/api.php`. Using it means:

- No parsing of a layout that changes weekly.
- `maxlag` and rate limiting are respected, so we are a well-behaved client.
- We can request exactly the categories and page lists we want, rather than
  downloading and discarding whole rendered pages.

`robots.txt` and the wiki's terms are checked in `fetch`, and the tool refuses to
run against a host that disallows it.

### What `extract` keeps, and what it drops

**Keeps** — facts, which is what a checklist needs:

- Page and category titles (`Category:Careers`, `Special Careers`)
- List items that look like enumerations of things (job titles, activity names)
- Numeric ranges near known keywords (salary figures, stat bounds, ages)
- Infobox key/value pairs

**Drops, deliberately** — anything that could end up in the game:

- Any sentence longer than a short phrase
- Anything with narrative verbs
- Any block of prose at all

The extractor enforces this: a token longer than `MAX_PHRASE_WORDS` is discarded
rather than stored, so `out/index.json` physically cannot contain a paragraph to
copy from.

## Running it

The container these sessions run in blocks `fandom.com` and `mrguider.org` at the
egress proxy, so the fetch stage cannot run here. It runs anywhere with open
egress:

```bash
pnpm --filter @lineage/wiki-ingest fetch      # writes tools/wiki-ingest/out/raw
pnpm --filter @lineage/wiki-ingest extract    # writes out/index.json
pnpm --filter @lineage/wiki-ingest report     # writes out/coverage.md
```

`out/` is git-ignored. The reference index is a working artefact, not a
dependency of the build — the game builds and ships without it ever having run.

## The authoring loop this feeds

From `docs/EVENT_AUTHORING.md`:

1. Take a gap from `coverage.md` ("they have military service; we have nothing").
2. Decide whether it makes a life more interesting. If not, close it and move on —
   most gaps are not worth filling.
3. Write the event in the design's voice: a named person, a real cost on every
   branch, a consequence that outlives the card.
4. Add it to the right file under `content/events/`.
5. `pnpm test` — the loader validates it, and the fiction tests check that no
   unresolved token can reach a player.
6. Play twenty lives with `tools/` and read the histories.

## Third-party sources other than wikis

The same rule generalises. Real-world data (spec §92) enters through
`tickWorld`'s `externalSignals` seam as **normalised numbers**, never as text:

```
Oil price API  →  adapter  →  OilPriceSignal  →  world.fuel  →  a card about vans
```

The simulation never learns which provider a number came from, and no provider's
prose ever reaches a player. The game must run correctly with every external
source switched off, and does — that is what `NEUTRAL_INDICATORS` is for.
