# The field, and what we should take from it

Research: September 2026, via web search. Fandom and several guide sites are
blocked by this environment's egress proxy, so this is built from search
summaries, store listings and forum posts rather than full page reads. Sources
at the bottom.

This is a decision document, not a survey. The conclusion is short and most of
the field's features are deliberately **not** on it.

---

## The games

| Game | USP | Loop | Where it wins | Where it loses |
|---|---|---|---|---|
| **BitLife** | The genre's default. Text-only, one button, enormous content | Read event → choose → age | Breadth (200+ careers, 40 ribbons), weekly challenges | Core loop is repetitive; players say the challenges are what keep it alive |
| **Another Life** | Accessible; you steer a **family across generations** | Pop-up events, swipe-to-date | Approachability, multi-generational framing | Shallower than BitLife by design |
| **InstLife** | More stats, more tabs, creative careers (sell paintings, release albums) | Slower, more granular | Depth of activity | A single life "takes forever"; being merged into BitLife |
| **Everlife** | BitLife-alike | Same | — | Reviewed as *"the same things happen in different lives, and in almost all cases have the same results"* |
| **Life Simulator 3** | BitLife-alike | Same | — | *"limited relationships"*, *"repetitive FAST"* |
| **Fallen London** | Quality-based narrative — the deepest storylet system shipped | Storylets unlocked by accumulated qualities | Content slots in anywhere; tight coupling of state to narrative | Not a life sim; no aging spine |

## What players actually say

One complaint dominates every game in the category, and it is the same
complaint:

> *"The same things happen in different lives, and, in almost all cases, have
> the same results."* — Everlife review
>
> *"A pretty mundane and repetitive game… in order to do well it requires
> consistently repeating the same positive actions repeatedly."* — BitLife review
>
> *"Repetitive FAST."* — Life Simulator 3 review

The second complaint is structural rather than about content volume:

> *"Earlier stages (like 20s and 30s) [are] far more chaotic than the rest of the
> character's life."*

And on retention, from a player explaining why they stopped:

> *"The only thing keeping it alive is the game modes but even that's getting
> boring."*

That last line is the most useful sentence in the whole research. BitLife's
retention does not come from its core loop. It comes from **weekly challenges** —
an externally-imposed goal that forces you to play differently. The core loop
did not get less repetitive; a goal was bolted on beside it.

## Measuring ourselves against the same two problems

Both flaws are in our game, measured rather than assumed (30 lives, seeded):

**The late game empties out.** Decisions per life, by decade:

| 0s | 10s | 20s | 30s | 40s | 50s | 60s | 70s | 80s+ |
|---|---|---|---|---|---|---|---|---|
| 3.9 | 4.8 | 8.2 | 8.4 | 8.0 | 6.5 | 3.0 | **0.4** | **0.0** |

Log density falls the same way: 3.5 entries/year through the 40s, 1.4 in the
70s, 0.3 in the 80s. A player who reaches seventy has nothing left to do but
press the button. This is the genre flaw, in our code.

**Lives repeat.** Across 30 lives there were only **9 distinct opening
sequences** of five decisions. Two thirds of lives begin identically. That is
the number behind "the same things happen in different lives".

## What we already beat them on

Worth naming, because the temptation is to add features instead of protecting
these:

- **NPC memory and six relationship dimensions.** Everyone else has one bar.
- **Event chains** — a choice schedules a consequence years out.
- **Succession** — the line continues; the estate and the ribbons carry.
- **Interactions whose outcome depends on the relationship**, not a fixed delta.
- **Writing.** Theirs is templated. Ours is the cheapest differentiator to keep.

## The decision

Three changes. Everything else the field offers is deliberately declined.

### 1. ~~Ambitions~~ — tried, and removed

A goal chosen at the start that weighted content and was judged at death. The
reasoning was that BitLife's retention comes from weekly challenges rather than
its loop, so a native, non-expiring version of that should work better.

**It was built and then taken out**, on the product owner's call, and the
measurements say that was right. Ambitions moved distinct openings from 9/30 to
only 11/30; the childhood content below took it from 11/30 to 30/30. Nearly all
the divergence came from having events to choose between, not from weighting
which ones were picked.

And the end-of-life verdict it provided already existed: **ribbons** name what
kind of life it was without asking a newborn to declare a goal first. A stated
ambition turned out to be a mechanic sitting beside the game — exactly the
criticism levelled at the weekly challenges it was copying.

What survives: the finding that a life needs a reason to be played to the end.
Ribbons and succession carry that, and they are earned by how the life went
rather than announced in advance.

### 2. Late-life content

Pure content, no new system: material that only exists past 55, built on the
thing competitors do not have — your children's lives becoming the story, the
reckoning with what you did, illness, and who gets what. The 70s should not be
0.4 decisions.

### 3. More childhood and teenage divergence

Also pure content. Nine distinct openings in thirty lives is a thin early pool,
not a broken system.

### Explicitly not doing

- **Weekly/seasonal challenges.** Needs live ops, and ambitions cover the value.
- **A separate achievements system.** Ribbons already do this.
- **Minigames.** BitLife's memory test is not why anyone plays it.
- **More stats.** InstLife has more and is not better for it.
- **A second currency, energy, or timers.** The spec forbids it and it is right.
- **Chasing 200+ careers.** 76 already exceeds what one life can see.

The test for anything added from here: *does it give the player a reason to make
a different decision?* Breadth that does not change a decision is bloat.

---

## Sources

- [Games like BitLife — Pro Game Guides](https://progameguides.com/mobile/best-life-simulation-games-like-bitlife/)
- [Games like BitLife — dot esports](https://dotesports.com/bitlife/news/best-games-like-bitlife)
- [BitLife vs Infinite Life Simulation](https://www.infinitelifesimulation.com/blog/bitlife-vs-infinite-life-simulation)
- [A ranking of the life simulators I have on my phone — AppleVis](https://www.applevis.com/forum/ios-ipados-gaming/ranking-life-simulators-i-have-my-phone)
- [BitLife review — GameFAQs](https://gamefaqs.gamespot.com/android/258264-bitlife-life-simulator/reviews/178748)
- [Everlife — App Store](https://apps.apple.com/us/app/everlife-life-simulator/id1603664467)
- [Life Simulator 3 — Google Play](https://play.google.com/store/apps/details?id=uk.playdrop.lifesimulatorpro)
- [Another Life — App Store](https://apps.apple.com/app/id1501803368)
- [BitLife Challenges — Fandom](https://bitlife-life-simulator.fandom.com/wiki/Challenges)
- [Best BitLife weekly challenges — Pro Game Guides](https://progameguides.com/bitlife/best-bitlife-weekly-challenges-active-and-vaulted/)
- [Recurring design patterns in storylet narrative](https://azhdarchid.com/some-recurring-design-patterns-in-storylet-narrative/)
- [Building a general-purpose QBN system — Bruno Dias](https://brunodias.dev/2017/05/30/an-ideal-qbn-system.html)
- [StoryNexus — IFWiki](https://www.ifwiki.org/StoryNexus)
- [100 Years - Life Simulator — App Store](https://apps.apple.com/us/app/100-years-life-simulator/id1524755868)
