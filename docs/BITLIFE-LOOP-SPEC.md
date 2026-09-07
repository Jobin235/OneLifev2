# The BitLife loop, as observed

Source: two gameplay recordings the player supplied (~2×12 min, one life from
birth to death). 234 frames sampled at 1 frame / 6 s and read directly. Every
claim below is something visible in a frame, not something recalled about the
game. Where a number is stated it was read off the screen.

This document exists because the game we built diverged from what the player
asked for. The mandate is now explicit:

> "i wanted exact bitlife type gameplay but with my own ui design. then we can
> add the one world + real time events concept on top of that."

So: **BitLife decides how it plays. The LINEAGE design file decides how it
looks.** Anything in this document that describes BitLife's *visuals* (red
gradients, blue buttons) is recorded for structure only — the palette stays
ours.

---

## 1. Screen architecture

One screen. Everything else is a sheet or a modal over it.

```
┌────────────────────────────────────┐
│ ☰   LOGO      🏆 1/157   [BITIZEN] │  chrome
├────────────────────────────────────┤
│ 🧑 Oliver Ruth ⓘ            $0     │  identity row
│ 🎓 University Student  Bank Balance│
├────────────────────────────────────┤
│                                    │
│  Age: 18 years                     │  ← THE LOG
│  My big sister, Aretha, has been   │    plain dense text
│  promoted to Tour Operator.        │    5–8 lines per year
│  My stepbrother, Apollo, graduated │    oldest at top
│  from high school.                 │    autoscrolls to bottom
│                                    │
│  I graduated from high school.     │
│  I called him a prick.             │
│  Asad El-Aslaw unfriended me.      │
│  I tried to salvage my relationship│
│  with Asad but was unsuccessful.   │
│  I am cured of depression.         │
│  I applied to university and was   │
│  accepted.                         │
│  I took out a student loan to pay  │
│  for my university tuition.        │
│                                    │
│  Age: 19 years                     │
│  ...                               │
├────────────────────────────────────┤
│  🏫    💼    ╭───╮    ❤️     ⋯     │  bottom nav
│ School Assets│ + │Relations Activit│  5 slots
│              │Age│                 │  centre = raised circle
│              ╰───╯                 │
├────────────────────────────────────┤
│ 😊 Happiness ▓▓▓▓▓▓▓░░░  74%       │  stats, always visible
│ ❤️ Health    ▓▓▓▓▓▓░░░░  64%       │
│ 💡 Smarts    ▓▓▓▓▓▓░░░░  61%       │
│ ☁️ Looks     ▓░░░░░░░░░  14%       │
└────────────────────────────────────┘
```

Observations that matter:

- **The log is the game.** It is not a sidebar or a "history tab" — it is the
  entire main surface, and it is plain running text. No cards, no tiles, no
  icons per line. Density is the point: a 60-year life is one long scroll.
- **Oldest at top, newest at bottom**, and the view sits at the bottom. (We
  reversed this earlier on the player's instruction, when the log was a
  card list. Now that the log is the main surface and each year appends
  beneath the last, BitLife's order is the readable one — the player scrolls
  *up* into their past.)
- **The stats bar is pinned below the nav** and never goes away. A stat in
  trouble gets a `⚠` in place of its emoji and turns orange/red — seen at
  Health 3%, Happiness 0%.
- **Bank balance lives in the header**, right-aligned, and **goes negative**
  (`-$7,179`, `-$21,536` after student loans). Debt is not a separate screen;
  it is the number you look at all game.
- **The subtitle under the name is your current station**: `University
  Student` → `Unemployed` → `Apprentice Moonshiner` → `Prisoner`.
- **The first nav slot is contextual**, and only that one: `School` while
  enrolled, `Occupation` when employed or job-hunting, `Job` in some states,
  `Prison` while incarcerated. Assets / Relationships / Activities never move.

## 2. The turn

Press **+Age**. That is the only clock.

1. The year advances.
2. 3–8 log lines append under a new `Age: N years` header.
3. Zero or more popups fire, one at a time, each waiting on a choice.
4. Control returns. The player may now take unlimited actions in any tab.
5. Press **+Age** again.

There is **no per-year action budget** and no "end turn" confirmation. There is
no birthday interstitial. The year passing is a scroll and a header.

Observed density: on a plain year, 3 lines and no popup. On an eventful year,
8 lines and 3 popups. Popups are not rare — but most years have zero or one.

## 3. The popup

Every interruption is the same object:

```
        ┌──────────────────────────────┐
        │ 🧑 Apollo Balls  *Stepbrother*│  who (optional) + category
        ├──────────────────────────────┤
        │        🌈 Coming Out         │  emoji + title
        │                              │
        │  Your stepbrother, Apollo,    │  1–3 sentences
        │  has confessed to you that he │
        │  is considering coming out of │
        │  the closet.                  │
        │                              │
        │      What will you do?        │  the question, verbatim
        │                              │
        │  ┌────────────────────────┐  │
        │  │      Ignore him        │  │  stacked, full width
        │  ├────────────────────────┤  │  2–4 of them
        │  │      Ridicule him      │  │
        │  ├────────────────────────┤  │
        │  │ Support him uncondition│  │
        │  └────────────────────────┘  │
        │                              │
        │       🎲 Surprise me!         │  always present
        └──────────────────────────────┘
```

- The header band names either **a person and their relation to you**
  (`Eddie Young — Friend`, `Kristen Bishop — Love`, `Korn — Prisoner`) or **a
  category** (`Education`, `School`, `Job`, `Conflict`, `Justice`, `Love`,
  `Social`, `Situation`, `Healthcare`, `Symptom`, `Disease`, `Prison`,
  `Current`, `Track`, `Childhood`).
- **"Surprise me!"** picks a random option for you. It is on every choice
  popup. It is a real feature, not decoration: it is the fastest path through
  a life and a lot of players live on it.
- Informational popups have **one green OK** and no question (`😐 Ulcers —
  You are suffering from ulcers.`).
- Destructive choices raise a **Confirm** sheet (`Are you sure you want to
  insult Korn?` / Cancel · Yes).

### Popups are not all buttons

This is the part we missed entirely. The popup is a small form, and its shape
encodes the decision:

| Shape | Seen in | What it communicates |
|---|---|---|
| Plain buttons | most | a clean fork |
| **Dropdown(s)** + one action button | `Attack` (pick your move: Roundhouse Kick / Poke / Punch / Headbutt / Spit / Pound / Right Hook; pick your target: his lip / his skull), `Call` your ex (pick your objective: Argue / Booty call / Chit chat / Compliment / Insult / Start dating), `University` (pick your major) | combinatorial flavour without more screens |
| **Price list** + buttons | `Doctor` (Consultation Fee: $100; Dr. Lugo's Reputation ▓▓▓░ / Dr. Davis's Reputation ▓▓░░), `Criminal Charges` (Henderson & Associates $1,270 / Gulch & Associates $13,970 / Public Defender $0) | pay more, better odds — legible, no maths |
| **Stat bars** | `Love Interest` card (Looks / Smarts / Money / Craziness), `New Friend`, `Encounter` (Craziness) | judge a stranger at a glance |
| **A named quantity** | `Plea` (Possible Sentence: 2 years), `Fever` (Your Concern ▓▓▓▓▓░) | the stake, stated |
| **Result bar** | `Ouch` (Damage ▓▓▓▓▓░░) | what your choice did |
| **Minigame** | prison `Escape` maze with a D-pad; horse race with a bet slider | rare, memorable, optional (`Never mind, turn myself in`) |

### The result toast

After a choice, a small blue-bordered box with a **title and one or two
sentences**, then back to the log:

> **BFFL** — You are now friends with Jude Mayberry.
> **Denied** — You applied for the Jr. Business Analyst position at Amplitude
> Insurance, but never received a call for an interview.
> **Stale mate** — You tried to salvage your friendship with Asad but were
> unsuccessful.
> **Let's give it a try** — You called up your ex-fling, Tina. You asked her
> out and she agreed to start dating you.
> **A slave to my craft** — You committed to start coming in to work 45 hours
> a week.

The titles are *written*, not generated. They are the game's voice.

## 4. The log's voice

First person for you, third person for the world, one sentence per line,
past tense, no adornment.

**Yours** (things you did or that happened to you):
```
I graduated from high school.
I applied to university and was accepted.
I took out a student loan to pay for my university tuition.
I have to start paying back my student loan for university.
I fully paid off my student loan for university.
I got an interview at The Phillips Group for their Interior Designer opening.
I was fired by Hollywood Design.
I refused to join Instagram.
I refused to join YouTube.
I am cured of depression.
I have been diagnosed with depression.
I am suffering from bowel polyps.
I chose to do push-ups and sit-ups all day to keep myself busy while serving
  a stint in the hole.
I was caught trying to escape from prison!
My prison sentence has been extended by two years for felony escape!
I have been freed from prison.
I started eating dried lizard.
I went snowboarding with my company on a team building exercise.
I have a new supervisor named Stephen Harris.
I got into a heated debate about the proper pronunciation of the word "route".
```

**The world's** (NPC lives ticking on without you):
```
My big sister, Aretha, has been promoted to Tour Operator.
My stepbrother, Apollo, started a new position as Receptionist for
  Dreamcatcher Electronics.
My little brother, Randy, married Carrie Reyes, a 18-year old unemployed
  person.
My little brother, Randy, and his wife, Carrie, had a baby boy named Cooper
  Ruth.
My niece, Tara, started elementary school.
My nephew, Cooper, graduated from high school.
My nephew, D'Brickashaw, enlisted in the Navy.
My mother has been diagnosed with constipation.
My mother is no longer suffering from constipation.
My mother retired.
My mother died while sleeping peacefully.
I let someone else plan her funeral but I found time to attend it.
My siblings and I each inherited $303,182.
My big sister, Aretha, is showing obvious signs of jealousy over my Honda
  Ridgeline.
My cellmate, Jermaine, made me let him win at Monopoly.
Johnny McCoy unfriended me.
Jude Mayberry unfriended me.
```

Three things this voice does that ours does not:

1. **Named NPCs with stated relations, every time.** Never "a friend" — always
   "My big sister, Aretha". The relation is restated on every line because the
   player is not expected to remember 40 names.
2. **The world moves without the player.** A large share of every year's lines
   are things that happened to *other people*. This is what makes the log feel
   like a life rather than a stat sheet.
3. **Consequences are threaded across years.** Diagnosed → suffering →
   cured. Loan taken → repaying → paid off. Sentence → extended → freed.
   Each is a separate line in a separate year.

## 5. Systems, as actually implemented

### Education

- Popup `Education / 🏛 University`: *"Apply to university today! Pick your
  major:"* dropdown → **Apply to university / Get a job instead / Enlist in
  the military / Take some time off.**
- Tuition is not paid, it is **borrowed**. Balance goes negative, and a log
  line appears every year until it is cleared.
- Graduating fires `School / 🎓 Graduated`: *"You graduated from university
  with an undergraduate degree in graphic design. What will you do now?"* →
  **Take some time off / Seek higher education / Look for a job.**
- While enrolled, the `School` tab holds clubs and school actions.

### Work

- The **JOBS** screen is a plain full-screen list, sorted by salary descending:

  ```
  🎓 College Dean (University District)      ⋯
     $127,192
  🧠 Jr. Psychiatrist (Mental Health Center) ⋯
     $112,288
  🏥 Associate Nurse (Hospital)              ⋯
     $49,889
  ```

  Title in bold, **employer type in grey parentheses**, salary beneath. The
  same title appears multiple times at different salaries — these are distinct
  openings, not one job.
- The list you see depends on your education. Pre-degree it is retail and
  labour; post-degree the professional roles appear.
- Applying fires an **Interview** popup with a real question and four
  answers — *"What type of work environment do you prefer?"* → One of
  micro-management / One with strong leadership / One with great benefits /
  One with a lot of collaboration. *"Do you have any plans for future
  education?"* → Only if the company will pay for it / Education never ends /
  Education is a waste of money / I'm committed to lifelong learning.
- Outcome is a toast: hired, or **Denied**.
- On the job: named supervisors who change, hours you can commit to
  (*"I committed to start coming in to work 45 hours a week"* → later *"53
  hours"*), promotions, firings.

### Justice

`Criminal Charges` → pick a law firm by price and implied quality → `Plea`
with the possible sentence stated → verdict → the `Prison` tab replaces
`Occupation`, with its own menu (Sentence with a Behavior bar, Appeal, Bribe,
Conjugal Visit, Cry, Escape, Gangs, Infirmary, Letter) and a Prison Yard
inmate list. Escape is a maze minigame; failing it extends the sentence.
Prison is a **place you live in for years**, not an event.

### Health

`Symptom` popups (green header) → *"Your Concern"* bar → It doesn't bother me
/ Go to the doctor / Take some aspirin / Search the web. Going to the doctor
opens `Healthcare / Doctor` with a consultation fee and reputation bars.
Conditions are named, persist for years, drag Health down, and are cured by a
log line. Observed: depression, anxiety, hearing loss, sickle cell, ulcers,
constipation, hemorrhoids, bowel polyps, genital herpes, pneumonia, measles.

### Love

`Love` submenu: Date / Dating App / Gay Dating App / Hook Up / Threesome
(locked). A candidate arrives as a **card**:

```
❤️ Love Interest
You've met a female named Camille.
  Name:       Camille Tinkle
  Gender:     Female
  Age:        31
  Sexuality:  Straight
  Occupation: Sr. Insurance Agent at Requiem Insurance
  House:      Haunted Ranch-Style at 171 Oak Ct NW
  Looks     ▓▓▓▓░░░░
  Smarts    ▓▓▓░░░░░
  Money     ▓▓░░░░░░
  Craziness ▓▓▓▓▓▓░░
  [ Ask her on a date ]
  [ No, she's not my type ]
```

Exes persist in an **EXES** list with a relationship bar, and can be called
with an objective dropdown.

### Activities

A dense list, not a tile grid. `♥ Favorites` section, then `All`. Rows carry
emoji, bold title, grey one-line description, and either `›` (opens a
submenu) or `⋯` (acts immediately). **Locked rows stay visible, greyed, with
a lock or BITIZEN badge** — the player can see what they cannot do yet.
Observed: Love, Mind & Body, Pets, Salon & Spa, Accessories, Adoption,
Casino, Crime, Doctor, Emigrate, Fertility, Horse Races, Identity, Lawsuit,
Licenses, Lottery. Submenus go three deep (Pets → Dog Breeders → Akita).

### Real-world dates

`Current / 📅 October 4th` — *"It's World Animal Day today, and you've been
invited to join an activist group that rescues wild animals from illegal
sanctuaries."* BitLife already ships the "real time events" idea the player
wants layered on later. It arrives as an ordinary popup with a `Current`
header, keyed to the calendar date.

---

## 6. What our game gets wrong, measured against this

| # | BitLife | One Life today |
|---|---|---|
| 1 | The log is the whole screen, plain dense text, one line per thing | Log is a card list, one card per year, competing with an event card and tiles |
| 2 | 5 fixed nav slots, first one contextual, `+Age` a raised centre circle | Seven tabs, no primary action, age-up a full-width bar |
| 3 | Stats pinned below the nav, always visible | Stats only on the Life screen |
| 4 | Bank balance in the header all game, goes negative | Money is a separate tab |
| 5 | Every year names NPCs and their relation; the world moves on its own | Most lines are about the player; NPCs rarely appear by name |
| 6 | Consequences thread across years (diagnosed → suffering → cured) | One-shot effects with no follow-through |
| 7 | Popups carry dropdowns, price lists, stat bars, confirms, minigames | Every popup is 2–4 plain buttons |
| 8 | Written result toasts with titles | Effects applied silently or with a generic line |
| 9 | Jobs are a salary-ranked list gated by education, with interviews | Jobs appear semi-randomly |
| 10 | "Surprise me!" on every popup | Not present |
| 11 | Locked content is visible and greyed | Locked content is hidden |
| 12 | Prison / school are *places you live in*, with their own menus | Both are one-line states |

These twelve, in this order, are the rebuild.
