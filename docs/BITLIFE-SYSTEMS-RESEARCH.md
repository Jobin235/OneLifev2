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

## The remaining packs

Casino, black market, secret agent, racing, zoo, cult, and vampire. Each is a
self-contained menu with its own economy; the player has asked for all of them
in the standard game rather than as purchases. They are scoped in the task list
and will be researched individually as they come up, rather than guessed at now.
