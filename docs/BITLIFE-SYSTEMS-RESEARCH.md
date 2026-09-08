# The systems we still owe, and how BitLife runs them

Researched September 2026 from BitLife's own support pages and the guide sites
that document each system in detail. The fandom wiki is blocked by this
environment's egress proxy; everything below comes from sources that were
reachable, and each section names them.

This is a companion to `BITLIFE-LOOP-SPEC.md`, which covers the loop itself and
was written from the player's own recordings. This one covers the systems those
recordings never reached.

---

## Time Machine

Sources: [BitLife support](https://bitlife.zendesk.com/hc/en-us/articles/360038752371-How-does-the-Time-Machine-work),
[Gamezebo](https://www.gamezebo.com/walkthroughs/bitlife-time-travel-explained-how-time-travelling-works/)

- Goes back **up to eight years**, and the player picks how far.
- Reachable from the Activities menu, among other places.
- **Works after death**, which is how it functions as a real undo rather than a
  convenience.
- The rule that gives it character: **it does not save anybody**. Rewinding past
  a family member's or lover's death only keeps them alive until that year comes
  round again, and then they die at the same age, of the same thing. You can
  undo your own mistakes; you cannot undo somebody else's ending.
- Sold per use, or unlimited for a one-off price. We are not selling anything,
  so the question for us is only how far back and how often.

**Our version.** Eight years, chosen by the player, with the deaths rule
implemented honestly: an NPC who has died once carries the age and cause, and
dies again on schedule.

## Stock market

Sources: [GameSkinny](https://www.gameskinny.com/tips/bitlife-how-to-use-the-stock-market/),
[Pro Game Guides](https://progameguides.com/bitlife/what-is-the-stock-market-and-how-to-use-it-in-bitlife/)

- Lives under **Assets**, as a list of companies you buy shares in.
- Each holding carries a **risk meter**: high risk can pay and can also take the
  whole position.
- Bonds and stocks together read as the market's health, which is the signal for
  when to buy and when to sell.
- Heavy RNG on purpose — a low-risk pick can still lose — and the advice
  everybody gives is to diversify.

**Our version.** Holdings priced off the world indicators we already simulate,
so a fuel shock or a rate rise moves the market rather than a private die roll.
Risk stated on the row before you buy.

## Landlord

Sources: [Level Winner](https://www.levelwinner.com/bitlife-landlord-update-guide-everything-you-need-to-know-about-the-landlord-update/),
[Prima Games](https://primagames.com/tips/how-to-make-money-as-a-landlord-in-bitlife)

- Buy a house, then a **Property Management** submenu appears on it in Assets.
- **Rent it out** to applicants you can run a **background check** on first.
- **Amenities** upgrade the property — home theatre, infinity pool, hot tub,
  panic room — raising both value and rent.
- Two meters run the system: **Property Condition** and **Tenant Satisfaction**.
- **Drop in** on tenants to see what they are doing to the place.
- **Evict** for unpaid rent, damage, or behaviour; **sue** when it is worse than
  that.
- Maintenance and check-ins keep the income coming; neglect drops both meters.

**Our version.** Sits directly on the mortgage and appreciation work already
built: the property you let is the property you financed.

## Royalty

Sources: [Prima Games](https://primagames.com/tips/how-to-become-royalty-in-bitlife),
[Gfinity](https://www.gfinityesports.com/article/royalty),
[Distractify](https://www.distractify.com/p/how-to-become-royal-bitlife)

- **Only in countries with a monarchy**, and only a small chance at birth.
- Born titles run Baron, Viscount, Prince, Princess and others — never King or
  Queen at birth.
- **A line of succession** you climb as older royals die. Live long enough and
  the throne arrives.
- **Or marry in**: find a royal, date them, keep them happy, propose. Marriage
  confers the title.
- No ordinary job needed; money is not the constraint.
- **Respect** is the constraint. A **Public Disservice** menu lets a royal abuse
  the position, respect falls, and if it falls far enough the subjects revolt
  and the monarch is overthrown.

**Our version.** Built. `packages/game/src/royalty.ts`, the `monarchy` block on
the country pack, and the Crown screen at the top of Activities.

- **Denmark is the monarchy**, and it is the only one of our five countries that
  is. A royal birth is 4% there — one Danish life in twenty-five — which is
  rarer than most systems in this game and still findable if you pick Denmark
  on purpose.
- **The ladder** is Baron, Viscount, Earl, Marquess, Duke, Prince, and then the
  crown, weighted heavily toward the bottom. BitLife puts only princes in the
  succession; a duke is in the line here too, seven to eighteen places back,
  because a duke of the same house waiting behind nobody at all reads as a
  cliff rather than a rule.
- **Marrying in** works, and is the only route open to somebody not born to it.
  About one candidate in twenty on the love card is a royal in a monarchy
  country; a player who declines everybody else meets one in 80% of lives and
  marries in about a third of them. The title conferred is one rank below the
  spouse's, because you married in and everybody knows it.
- **Respect** is the whole system: 0–100, decaying toward 50 every year so no
  single good year carries a reign. Royal duties and knighthoods raise it,
  chaos and executions spend it, three actions a year so a bad decision cannot
  be undone the same afternoon. At zero the subjects revolt, the title goes,
  and 85% of the estate goes with it. Abdication is the same exit taken calmly:
  you keep the title's money, minus the half that was the position.
- **The title descends** to the eldest child, at the parent's rank rather than
  on the throne — a crown is inherited next, not instantly — with the parent's
  respect halved toward the middle. You inherit the position, not the goodwill.

One bug fell out of building this: `applyFameDelta` normalised its three
opinion shares by rounding fans and haters independently, which can overshoot
by one, and the `Math.max(0, …)` on the indifferent share turned that into a
state summing to 101. The invariant then threw a year later, in a life that had
nothing to do with royalty. The second share now takes whatever the first one's
rounding leaves.

## Fame

Sources: [The Gamer](https://www.thegamer.com/bitlife-become-famous-how-to-guide/),
[Twinfinite](https://twinfinite.net/guides/how-to-become-famous-bitlife/),
[Dot Esports](https://dotesports.com/bitlife/news/how-to-be-famous-in-bitlife)

- Fame attaches to specific careers: **model, actor, musician, writer, game
  developer, reporter, athlete, social media influencer** — and royalty.
- **Looks and Health gate it.** Looks above about 65 early on is the standard
  advice, bought at the salon and the gym.
- **Social media from 13**: keep an account active, post constantly, and the
  fame tag arrives at roughly **300,000 followers**.
- Random events swing it hard — a viral moment adds, a scandal takes away about
  twice as much.
- **A famous spouse roughly doubles your own fame.**

**Our version.** Built. `packages/game/src/fame.ts`, `content/careers/fame.json`,
`content/events/audition.json`, and the Fame screen at the top of Activities.

Two things diverge from the research, deliberately:

- **There is no Looks stat here.** Our five are health, happiness, smarts,
  fitness and charm, which is a decision the game made long before this system
  and which the pinned stats bar renders. "The camera likes you" is read as
  `charm * 0.7 + fitness * 0.3` instead, and the two tracks the guides gate on
  Looks are gated on charm (acting 55) and on charm plus fitness (modelling
  68/60).
- **You do not apply to be an actor.** Acting, music and modelling are pulled
  out of the ordinary job listing entirely and reached only through auditions:
  three a year, odds stated on the button, worse odds the bigger the
  profession (27% for acting against 31% for modelling, for the same person).
  Most of them say no, which is the texture the professions actually have and
  which a job listing cannot express.

Posting is one activity a year from 13. The run matters more than the size of
the account, a quiet year costs 12% of the following, and the fame line at
300,000 is BitLife's.

## Organised crime

Source: [Gfinity](https://www.gfinityesports.com/article/mafia)

- Joined **at 18, from the Occupation page**, and only with a **history of
  violence and theft** behind you.
- Ranks: **Associate → Soldier → Caporegime → Underboss → Godfather/Godmother.**
- You rise by **contributing** — stealing cars, robbing banks, looting trains —
  through the ordinary Crime menu.
- **Ten to twenty-five years** to the top, against police attention and your own
  health.
- **Your cut is your rank**: 10% as an associate or soldier, 25% as a
  caporegime, 50% as an underboss, 75% as the godfather.
- **Soldier needs a hit and an oath.** You are not made until you have killed
  somebody for them.

**Our version.** Built. `packages/game/src/mob.ts` and the Family screen at the
top of Activities.

The gate is a conviction for the right sort of thing — theft, robbery, burglary,
assault, a weapon, a car. Somebody with a clean record is not told there is
anything to be asked about, because being told is most of what getting in
consists of. Four jobs (collect a debt, move something, take a contract, sit
down with the other family), three a year, each with its own take, its own
standing, and its own chance of a charge — which runs through the ordinary
justice flow, because there is no reason a mob arrest should work differently
from any other. Promotion wants years at the rank, standing, and money brought
in, all three; a quiet year costs standing, and standing on the floor once you
are made is a car journey. Measured over sixty dedicated criminal lives: all
sixty got in, most reached underboss, eight became the godfather, and there
were 270 arrests along the way.

## Prison escape

Sources: [Pocket Gamer](https://www.pocketgamer.com/bitlife-life-simulator/how-to-escape-every-prison/),
[Pro Game Guides](https://progameguides.com/bitlife/how-to-escape-every-prison-guide/)

- A **grid maze**: you are an icon, there is an exit, and there is a guard.
- **The guard moves twice for every move you make.**
- **He only moves toward you, and tries to move horizontally first.** That is
  the whole puzzle — the behaviour is deterministic, so he can be walked into
  walls.
- **Maze size scales with the sentence**: petty crime gets a small grid,
  maximum security a large one.
- Failing extends the sentence.

**Our version.** Built. `packages/game/src/escape.ts`, `EscapeScreen`, and a
row at the top of the prison menu.

- **The grid is tiles, not a carved maze.** Walls are squares you cannot stand
  on. The first attempt carved a maze with wall cells, which was wrong twice
  over: it doubled the grid, so a "four by four" arrived as nine by nine on a
  phone, and its corridors gave a player nowhere to dodge somebody who moves
  twice.
- **4×4 to 8×8, from the sentence** — the same information BitLife takes from
  the security level, in the units this game already has.
- **The guard's rule is verbatim** and is not an approximation of pathfinding:
  toward you, horizontally first, standing still when both ways are walls. A
  guard that took the shortest path would be unbeatable at two steps to your
  one. He can be walked into a wall and left there, and that is how this is won.
- **Every maze is provably winnable.** The guard is deterministic, so the game
  is a finite graph — player square × guard square, at most 4096 states —
  and a breadth-first search answers "can this be won" exactly. Generation
  retries until it can. An unsolvable puzzle is not a hard puzzle, it is a bug
  with a timer on it.
- **One attempt a year.** Being caught adds three years and the felony
  "Attempted escape"; giving yourself up adds one, which is the only reason the
  surrender button is worth having.
- The maze lives in the save, not the client: being halfway over a wall is a
  state rather than a screen, and the server decides where the guard is.

## Ventures: the cult, the zoo and the spy agency

Sources: [Prima Games](https://primagames.com/tips/bitlife-how-to-start-a-cult),
[Level Winner (cult)](https://www.levelwinner.com/bitlife-cult-update-guide-everything-you-need-to-know-about-the-cult-update/),
[Level Winner (secret agent)](https://www.levelwinner.com/bitlife-secret-agent-expansion-guide-everything-you-need-to-know-about-the-secret-agent-expansion-pack/),
[Twinfinite](https://twinfinite.net/guides/how-to-become-a-secret-agent-bitlife/)

- **Cult**: buy a plot, name it, recruit through outreach missions, hold
  ceremonies, and invest in the compound to raise its **Appeal** — higher appeal
  brings happier followers and people from higher classes. More followers, more
  money a year.
- **Zoo**: three sizes (4, 6 and 8 habitats), animals acquired one at a time
  from a trading post, staff and enclosures to maintain, visitors to keep happy.
- **Secret agency**: buy premises, hire agents by interviewing or poaching them
  from rivals, buy gadgets, then run missions. Successful missions raise your
  prestige, which raises the risk and the payout of the next ones.

**Our version.** Built, and built once. `packages/game/src/venture.ts` plus
`content/ventures.json`.

All three are the same machine wearing three sets of nouns: premises with a
capacity, things acquired one at a time, a meter that decays every year, and an
annual payout against an upkeep. Writing that three times would have produced
three subtly different versions of the same bugs, so the nouns, the numbers and
the four bespoke actions apiece live in content and the engine never learns
which one it is running. A cult says "Devotion" and "followers" exactly where a
zoo says "Welfare" and "animals".

The one rule that makes upgrades worth buying rather than a second money sink:
**what can turn up is gated on how good the place is.** A panda will not come to
a zoo with a car park, and a Legend will not work out of two rooms above a dry
cleaner. Building is the only way to change that.

Tuned so each is a loss while it fills and worth having once it is full and
tended — a medium commune clears about $250k a year at capacity, a medium zoo
about $320k on a much larger outlay, and an agency runs near break-even on the
annual line with the missions as the actual income.

## The casino

Sources: [Pro Game Guides](https://progameguides.com/bitlife/all-bitlife-casino-games-and-how-to-play-them/),
[Gamezebo](https://www.gamezebo.com/walkthroughs/bitlife-mini-game-guide-how-to-commit-a-burglary-how-to-escape-prison-how-to-win-at-casino-blackjack-and-how-to-win-at-the-horse-races/)

Eight games in BitLife's pack. Slots pay up to three times a stake on three
matching wheels; roulette pays the colour and ten times the exact number;
blackjack is hit-or-stick against a dealer drawing to seventeen; the horses are
five runners paying five to one.

**Our version.** Four games, chosen because they are four different decisions
rather than four skins on one. Every payout is **measured**, not reasoned
about — a probe of eight thousand rounds per game per choice, and the numbers
were wrong three times over on the first pass:

- Slots paid four times a line and returned **69%**, which is worse than any
  machine that has ever been allowed on a floor. Now 85%.
- Roulette paid the colour *and* the number on the same stake — two bets priced
  as one — and returned **114%**, a wheel that pays the player. Now the number
  pays ten times, the colour alone pays one and a half, and it comes to 92%.
- The horses used round-number payouts and returned 68–81% depending on which
  horse you backed. Now priced off each horse's actual odds, at a consistent 88%.

Blackjack asks for a policy rather than a card, because one tap cannot be a hand
of blackjack: playing it by the book returns 89% and the two bad policies return
78% and 62%, so there is a right answer and it is worth knowing.

## The black market

Sources: [GameSkinny](https://www.gameskinny.com/tips/bitlife-how-to-use-the-black-market/),
[Level Winner](https://www.levelwinner.com/bitlife-black-market-update-guide-everything-you-need-to-know-about-the-black-market-expansion-pack/)

- **Six dealers**: the Antique Peddler, the Arms Dealer, the Art Thief, the
  Jewel Fencer, the Street Chemist and the Wildlife Smuggler.
- Each has an **Attitude bar**, and a dealer with a red one is more likely to
  sell you fakes and more likely to refuse you.
- **Possession** is what gets you arrested.

**Our version.** All three of those, plus the thing that makes it a system: a
fence pays less than a dealer asks, so **flipping always loses** (measured at
49% back) and the money is in **holding**, which is the only thing the police
can find. Tuned against a probe until both strategies were real: buying every
year returns 114% with a raid in 21 lives out of 50; buying every third year
returns 170% with 4. The first numbers had a patient buyer raided in 38 lives
out of 40, which left no play at all, and an earlier version let a well-liked
dealer undercut the fence and printed $56M a life.

## Racing

Sources: [Pro Game Guides](https://progameguides.com/bitlife/how-to-win-car-races-in-bitlife-racing-expansion-pack/),
[Pro Game Guides (career)](https://progameguides.com/bitlife/how-to-become-a-racecar-driver-in-bitlife-racing-pack/)

- A **garage**, cars from $400k up, and **mods** for speed and durability.
- **Bronze, silver and gold**, climbed on points from wins.
- Races are a throttle slider: full speed on the straights, slow for the corners
  or the car breaks.

**Our version.** The slider does not survive being one tap, so what survives is
the decision underneath it — how hard to lean on the car — and the car's
durability decides what that costs. Measured, the curve came out exactly as
intended: a hot hatch podiums in bronze and never wins; a coupe wins a quarter
of bronze and **nothing at all** in silver; a GT takes silver and is nowhere in
gold; only a prototype competes in gold, at 16% wins. Leaning on a coupe in
bronze takes it from 25% wins to 75%, and from a 9% chance of breaking to 18%.

## The vampire

Sources: [Pro Game Guides](https://progameguides.com/bitlife/complete-bitlife-vampire-guide-progeny-hunt-more/),
[Pro Game Guides (Lord)](https://progameguides.com/bitlife/how-to-become-a-vampire-lord-in-bitlife/)

- Turned at 18 by a vampire in a coffin. **Essence** levels your abilities.
- **Hunt** for the most of it, or take **blood banks** for a safer, smaller
  amount. **Hypnotise** the weak. Turn people into **progeny**.
- **Notoriety** brings hunters. The **coffin** sleeps it off.
- **Vampire Lord** is permanent.

**Our version.** The only system here that changes the rules of the life rather
than adding a screen to it: a vampire is exempt from the ordinary mortality
roll and from the part of ageing that is simply being old, and in exchange the
one thing that can still end the life is a person with a stake.

Survival is essence **against** notoriety, not essence alone — the first pass
did essence alone and a vampire who fed constantly became unkillable, since
feeding is also what raises essence. Now feeding constantly is how you get
strong and how you get found: across sixty lives that hunted every year, 45 were
killed by hunters, 15 survived ninety years, and 15 reached Lord.

One implementation note worth keeping: the hunter does not kill the character
where it decides to. The year has a death step that sets half a dozen fields,
tidies the card and builds the recap — reaching around it and flipping `alive`
left the state failing its own invariant a moment later. It raises a flag and
the death step reads it.

## The other life (vigilante)

Not a BitLife pack — this one was asked for directly — so it is built around the
thing that makes a mask worth having rather than around a menu.

Every other system in this game is one life doing one more thing. This is two,
and the number that decides everything is not how many people got home. It is
**suspicion**: how close the first life is to finding out about the second.

- **The city names you.** You do not choose what this looks like from outside;
  the alias arrives after the first night.
- **Two meters that are not the same kind of thing.** Standing is a score —
  what the city makes of you. Suspicion is a countdown, and it only goes one way
  while you are working.
- **Three answers, every time.** Hold them for the police (slow, and the city
  likes it), make sure they do not do it again (it works, and half the city
  decides you are the problem), or get the person out and go (costs nothing,
  achieves nothing but the person).
- **The failure state is not death.** It is being found out: the mask comes off,
  everybody you know finds out at the same time as everybody else, and the
  courts get the years the other life has been spending. Whether the city takes
  your side is exactly what all those three-way choices were buying.
- **Gear is why a mask lasts.** A line and a winch, a van with nothing written
  on it: they buy quiet rather than force.

Tuned against a probe, because the first numbers unmasked every character
inside three years, which is not a second life, it is an anecdote. Now, over
forty lives each: always handing them over lasts about nine years and the city
forgives 31 of 40; always going hard lasts eight and the city forgives **none**;
playing carefully and lying low when it gets warm lasts sixteen, and seven
characters in forty are never found out at all.

The one place two systems are allowed to notice each other: a vampire is simply
better at this.
