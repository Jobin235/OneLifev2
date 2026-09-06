# wiki-ingest

Builds a structural reference index from public game wikis, so we can answer
"what have we not thought of?" without guessing.

**It never emits shippable content.** The extractor discards anything longer than
a short phrase, so `out/index.json` cannot contain a sentence to copy. Read
`docs/CONTENT_PIPELINE.md` for why that constraint exists — it is a licensing
answer and, more importantly, a design one.

```bash
npm run fetch      # MediaWiki API → out/raw/       (needs open egress)
npm run extract    # structure only → out/index.json
npm run report     # gaps vs our content → out/coverage.md
```

`out/` is git-ignored and is not a build dependency. The game builds and ships
whether or not this has ever run.
