# BitLife: research, and where we stand against it

Gathered September 2026 via web search. The Fandom wiki, mrguider and several
other guide sites are blocked by this environment's egress proxy, so everything
here comes from search-result summaries rather than full page reads. Sources are
listed at the bottom. `tools/wiki-ingest` exists to pull the primary pages
properly from a network that can reach them.

Treat this as a competitive brief, not a specification to copy. We are not
cloning BitLife's UI or content; we are matching the *depth* players expect and
beating it where our simulation already goes further.

---

## 1. The loop

> "Read an event, choose a path, see the outcome, and advance to the next year."

- One button, bottom centre, marked `+`. Each press advances a year (or six
  months, a setting).
- The main screen is a **continuous scrolling log of the whole life**. Pressing
  Age appends that year's events to the bottom. Nothing is a separate screen.
- Decisions surface as alerts over the log.
- No interstitial between years. The birthday is a line in the log.

**Us:** matched, as of the life-log rewrite. This was the single biggest
structural difference and it is now closed.

## 2. Events per year

BitLife produces **several** log lines a year — school notes, family news,
friend gossip, health blips, job noise — most of them flavour with no decision
attached, punctuated by decisions.

**Us: the biggest remaining gap.** A 26-year test life produced 23 log entries
across 16 years, so a third of years are silent and the rest average under one
line. A year should rarely be empty and often hold three or four lines.

## 3. Stats

Four headline stats — **Happiness, Health, Smarts, Looks** — plus **Karma**,
which is hidden and drives luck.

**Us:** we carry ten (health, happiness, smarts, looks, fitness, charm,
discipline, creativity, social, luck). The design file shows five. Karma has no
equivalent. Ours is arguably better, but the five-stat header is the design's
and should stay; the rest are internal.

## 4. Menus

Nine top-level areas: **Mind & Body, Relationships, School, Assets, Activities,
Crime, Jobs, Licenses, Time Machine**.

**Us:** Life / People / Do / Money / More. Broadly equivalent, with School and
Jobs living inside Do, and Assets inside Money. Licenses and Time Machine have
no counterpart.

## 5. Where we are shallow

### Activities
BitLife's Mind & Body alone: Gym, Library, Meditate, Memory Test, Read Books,
Diet, Gardening, Martial Arts, Walks — plus doctor, therapist, plastic surgery,
haircut, casino, clubbing, lottery, horse racing, vacations, cruises, dating
apps. Roughly **25–30 distinct activities**, many with sub-menus and outcomes.

**Us:** 25 activities, but most are a single stat nudge with one line of text.
Comparable in count, much thinner in consequence.

### School
BitLife: elementary → middle → high → university → graduate, with **grades,
popularity, cheating on tests, bullying, student–teacher interactions, clubs,
sports teams, majors, dropping out, expulsion, GED, student loans**, and
specialised schools (medical, law, vet, pharmacy, business, nursing, dental).

**Us: closed, mostly.** Grades and subjects were already modelled but invisible;
there is now a School screen showing them beside **popularity**, which the two
sets of actions pull against — studying moves grades and not popularity, hanging
about does the reverse. Six actions: study harder, join a club, skip class,
cheat on a test, try out for the team, hang about after school, and drop out
from sixteen. Cheating, skipping, tryouts and running for office can **backfire**,
with the odds bought down by a relevant stat but never to zero.

Most importantly, school now **introduces people** — classmates and a teacher on
every enrolment, who stay in the life afterwards. That is the design's central
continuity bet (a classmate met at 15 turns up again at 24) and until now school
introduced nobody at all.

Still missing: majors as a player choice, specialised schools (medical, law,
vet), and bullying.

### Careers
**200+ collectible careers**, plus part-time and freelance work, and ten
premium special careers (Actor, Astronaut, Athlete, Business, Mafia, Musician,
Politician, Street Hustler, Model, Dealer). The Office update added coworkers
and supervisors as real NPCs with their own interactions, HR investigations,
grievances, office romance, and a visible performance bar.

**Us: closed on depth, still behind on breadth.** A Work screen showing the
ladder (which rung you are on, what the next one pays), a performance meter with
an outlook line that names your rival, and seven actions — work harder, ask for
a raise, get closer to your manager, look elsewhere, take the credit, quit, and
look for a job when out of work. Four can backfire: asking too early costs
performance, taking credit that is not yours costs reputation, and being caught
looking costs both.

A workplace now spawns a manager, sometimes a rival, and one to three
colleagues, all tappable straight through to the interaction menu. Still behind
on career *breadth* (12 tracks against 200+) — that is item 7.

### Relationships
Per-person interaction menu: **Ask Out, Compliment, Conversation, Gift, Hook
Up, Insult, Prank, Rumor, Spend Time**, with results depending on current
relationship level, and low relationships producing hostile responses.

**Us: now ahead.** Fourteen interactions — talk, spend time, compliment,
confide, ask advice, gift, apologise, have it out, insult, ask for money, lend
money, ask out, be romantic, cut off — gated by relationship kind, age, money
and warmth. Each has two outcomes chosen by where the relationship already
stands, so confiding in someone who has earned it is not the same act as
confiding in someone who has not, and the wrong one costs you fourteen points of
trust and a memory that stays on their screen.

### Crime
Bank Robbery, Burglary, Grand Theft Auto, Pickpocket, Porch Pirate, Shoplift,
Train Robbery, murder, with **age gates** (porch pirate 8, burglary 10, murder
and GTA 15, train robbery 16, bank robbery 18), plus prison, escape attempts,
lawyers, appeals.

**Us: closed.** Seven crimes with the genre's age gates — a parcel from a porch
at eight through to a bank at eighteen — with payouts and odds scaling together,
so the ladder is a risk/reward curve rather than a list. Getting caught runs the
conviction, fine, lost job, facility, sentence and parole machinery that was
already there.

### Assets
Six classes — cars, houses, jewellery, instruments, aircraft, boats — bought
with cash or finance, requiring licences, sellable with haggling.

**Us: closed.** Sixteen things to buy, from a trailer to a house with a name,
each with an annual upkeep — which is the half of the decision players forget,
and the reason the catalogue is priced the way it is. Anything owned can be sold
back, less whatever is still owed on it.

### Ribbons
40 end-of-life ribbons that summarise the life lived and appear on the
gravestone. A strong replay driver.

**Us: closed, and arguably ahead.** Sixteen ribbons — Notorious, Crooked,
Loaded, Famous, Founder, Scholar, Ancient, Head of the family, Drifter, Beloved,
Alone, Lazy, Unlucky, Cut short, Steady, Ordinary. Exactly one per life, checked
from the most particular verdict to the most ordinary so a life is named by what
was unusual about it: a rich life with two convictions is Crooked, not Loaded.
Each carries a written line rather than a score, and the set is kept by the
family line rather than the character, so it survives succession. The literary
chapters stay — the ribbon sits above them.

---

## 6. Where we are already ahead

Worth protecting while closing the gaps above:

- **NPC memory.** Our people remember specific interactions and the event engine
  reads that history. BitLife's relationships are a bar.
- **Relationship dimensions.** Affection, trust, respect, conflict, romance,
  dependence — not one "relationship" number.
- **Event chains.** Choices schedule future events years out.
- **Succession.** Play on as your heir, with an estate and heirlooms.
- **A living world.** Economic conditions that reach the player only when
  relevant, rather than a news feed.
- **Writing.** Our event prose is better than BitLife's, which is mostly
  templated. This is a real differentiator and cheap to keep.

---

## 7. What to build, in order

All eight are now done. Ranked as they were, by player-visible depth per unit of
work:

1. ~~**More life per year**~~ — **done.** The chronicle: 161 decision-free log
   lines that bind real NPCs. 0.88 → 3.28 entries a year, no silent years.
2. ~~**Per-person interactions**~~ — **done.** Fourteen interactions, each with
   a warm and a cool outcome chosen by the relationship's current warmth, each
   writing a memory. Where we beat BitLife: the same "Talk" lands differently on
   a trusted friend and someone you have been avoiding, and the log says which.
3. ~~**School with substance**~~ — **done.** A School screen (design 3A/5A),
   popularity as a stat that pulls against grades, six school actions with real
   risk, and — the important one — school now introduces classmates and teachers
   who persist for the rest of the life.
4. ~~**Work with substance**~~ — **done.** A Work screen (design 3B) with the
   ladder, a performance meter, seven actions, and colleagues you can act on.
   Also fixed the balance bug it exposed: a third of lives never worked at all.
5. ~~**Crime as a menu**~~ — **done.** Seven crimes, age-gated from eight to
   eighteen, running into the conviction and prison machinery that already
   existed.
6. ~~**Assets you can buy and sell**~~ — **done.** A 16-item catalogue in the
   Money screen, priced so the annual upkeep is the interesting half.
7. ~~**Careers, broadened**~~ — **done.** 12 tracks → 76, across every level of
   education. Still missing part-time and freelance work.
8. ~~**Ribbons**~~ — **done.** Sixteen verdicts, one per life, earned by how it
   was played and kept by the family line.

---

## Sources

- [Careers/Occupation — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Careers/Occupation)
- [Activities — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Activities)
- [Mind & Body — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Mind_%26_Body)
- [Education — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Education)
- [Relationships — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Relationships)
- [Crime — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Crime)
- [Assets — BitLife Wiki](https://bitlife-life-simulator.fandom.com/wiki/Assets)
- [BitLife Office Update Guide — Level Winner](https://www.levelwinner.com/bitlife-office-update-guide-a-complete-look-at-bitlife-version-1-26-aka-the-office-update/)
- [BitLife School Update Guide — Level Winner](https://www.levelwinner.com/bitlife-school-update-guide-version-1-23-grades-and-popularity-cheating-on-tests-school-bullying-student-teacher-interactions-and-college-life-explained/)
- [BitLife Mind & Body Update Guide — Gamezebo](https://www.gamezebo.com/walkthroughs/bitlife-version-1-30-1-mind-body-update-guide-surprise-me-new-disease-system-martial-arts-diets-activities-and-more/)
- [All Special Careers in BitLife — Pro Game Guides](https://progameguides.com/bitlife/how-to-get-special-careers-in-bitlife/)
- [BitLife Ribbons List — Pro Game Guides](https://progameguides.com/bitlife/ribbons-list-guide/)
- [BitLife Schools Guide — Pro Game Guides](https://progameguides.com/bitlife/bitlife-schools-guide/)
