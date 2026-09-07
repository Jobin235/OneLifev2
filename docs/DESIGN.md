# Design system — "One Life" (LINEAGE v2, Life First)

Extracted from `design/LINEAGE-v2-Life-First.dc.html`, which is the visual source of
truth. Where this document and `docs/SPEC.md` disagree, **the design file wins** — see
"Design overrides" at the bottom.

## Voice

The single most important asset in the design file is not the palette, it is the
writing. Every event is a small piece of fiction with a cost:

> **They offered you the senior role — in Denver.**
> Marcus called you in. More money, better title, 1,200 miles away. Emma told you
> once she'd never move for a job, and she wasn't joking.
>
> - Take it and move → *"You took it. Emma said she'd visit. She visited twice."*
> - Ask to do it from Portland → *"Marcus pushed it through, grudgingly. He mentions it whenever he needs a favour."*
> - Turn it down → *"You said no and didn't explain why. Emma still doesn't know she was the reason."*

Rules the content must hold to:

1. **Name people.** Not "your friend" — Emma, Daniel, Marcus, Priya.
2. **Outcomes are past tense and specific.** "She visited twice." Not "Relationship decreased."
3. **No option is clean.** Every branch costs something, including the safe one.
4. **The consequence outlives the card.** "He mentions it whenever he needs a favour"
   is a promise the engine has to keep years later.
5. **Never explain the simulation.** No ticks, no scores, no "relevance", no percentages
   except where the fiction itself would show them (crime odds, surgery prices).

## Type

| Role | Family | Weights |
| --- | --- | --- |
| Display / headings / numbers | `Baloo 2` | 600, 700, 800 |
| Body / UI / labels | `Nunito` | 400, 600, 700, 800 |

Representative ramp (from the artboards):

| Token | Value | Used for |
| --- | --- | --- |
| `display` | `800 40px/1.05 Baloo 2` | "You're 28." |
| `screen-title` | `800 28px/1.1 Baloo 2` | People, Do something, More |
| `name` | `800 27px/1.1 Baloo 2` | Alex Rivera in the header |
| `card-title` | `700 21px/1.28 Baloo 2` | Event headline |
| `person-name` | `800 15.5px/1.2 Baloo 2` | Person row |
| `body` | `600 14.5px/1.6 Nunito` | Event body |
| `choice` | `700 14.5px/1.3 Nunito` | Choice button |
| `eyebrow` | `800 11.5px/1 Nunito, letter-spacing .07em` | WHAT HAPPENED, EARLIER THIS YEAR |
| `meta` | `700 12.5px/1.3 Nunito` | Person subtitle |

## Colour

Light-first, warm paper. There is exactly one dark screen in the whole design
(the lock-screen notification mock) and one recoloured screen (prison chrome).

### Ground and ink

| Token | Hex | Use |
| --- | --- | --- |
| `--desk` | `#EFE6D8` | The canvas behind the phone (not in-app) |
| `--app-bg` | `#FFF9F2` | App background |
| `--surface` | `#FFFFFF` | Header, cards |
| `--ink` | `#2A2118` | Primary text, "Got it" button |
| `--ink-2` | `#3D342A` | Secondary emphasis text |
| `--body` | `#6E6255` | Body copy |
| `--muted` | `#8A7E70` | Subtitles, history lines |
| `--label` | `#9C9184` | Eyebrow labels |
| `--faint` | `#A79B8C` | Date line |
| `--year` | `#C9B79C` | Age gutter numbers in memory lists |
| `--line` | `#F0E6D8` | Card border **and** the hard drop shadow |
| `--line-2` | `#F2E8D9` | Header/footer hairlines |
| `--line-dash` | `#E3D6C2` | Dashed "quiet stretch" cards |

### The five life-area accents

Colour encodes *what kind of thing this is*, consistently across cards, tiles,
stat bars and person rows.

| Area | Base | Deep | Tint | Meaning |
| --- | --- | --- | --- | --- |
| Coral | `#E2563C` | `#C4462E` | `#FFF0E8`, `#FFEDE4` | Risk, work, the world, Age Up |
| Green | `#2FA97C` | `#3D7A5E` / `#1F7A56` | `#EAF6F0`, `#E9F4EE`, `#F3FAF6` | Health, upkeep, money in |
| Violet | `#7B6BD6` | `#5F51AE` | `#EEEAFB`, `#F6F2FB` | Growth, learning, family, death |
| Amber | `#E9A93B` | `#8A6A20` | `#FFF3D9` | Fun, birthdays, foreshadowing |
| Pink | `#DB6C9B` | `#C25585` / `#9A5C77` | `#FDE9F1` | Love, romance, children |
| Blue | `#3B8FD4` / `#2E6FA8` | `#3E6180` | `#EAF2FA`, `#F3F7FC` | School, civic, design notes |

Stat bar colours are fixed: ❤️ `#E2563C`, 😊 `#E9A93B`, 🧠 `#7B6BD6`, 💪 `#2FA97C`, 😎 `#DB6C9B`.

Delta pills: positive `#EAF6F0` on `#1F7A56`; negative `#FFF0E8` on `#C4462E`.

## Shape

- **Hard offset shadows, no blur.** Event card `0 5px 0 #F0E6D8`. Person row `0 3px 0 #F3EADC`.
  Age Up button `0 4px 0 #C4462E`. This is the single most characteristic property of the look.
- Radii: event card `24px`, panel `20–22px`, tile `18px`, choice `16px`, stat cell `13px`, pill `99px`.
- Avatars are circles: `82px` (profile), `62px` (header), `48px` (close person), `42px` (acquaintance).
- Every tappable row is `min-height: 44px`.
- Device: `402 × 874` logical px (iPhone 16 Pro class). Header top padding `54px` for the notch.

## Screens

| # | Screen | Tab | Notes |
| --- | --- | --- | --- |
| 1A | Your Life | Life | Header (identity + 5 stat bars + job/money strip), event card, result card, idle grid, "Earlier this year", Age Up |
| 1B | Birthday recap | — | Full-screen. Exactly 4 recap lines, stat deltas, one amber foreshadow line, "Keep going →" |
| 1C | World event as a life event | Life | Identical card grammar to a personal event |
| 2A | People | People | Grouped CLOSE / AROUND / DRIFTED AWAY; subtitles carry facts, not labels |
| 2B | Someone's story | People | Memory list by age, "On her mind", relationship actions |
| 2C | Do something | Do | Colour-grouped tiles; limited actions per year |
| 3A | School | Do | Same card grammar as adulthood |
| 3B | Work | Do | Visible salary ladder + one named rival |
| 3C | Money | Money | "What you're worth / What you own / Every month" + a human-cost note |
| 4A | A new life | — | Name, birthplace (193 countries), what you're born into |
| 4B | More | More | Company, property, politics, record, health, will, story, family line |
| 4C | The end, and the next one | — | Violet. Life chapters, how people saw you, what you changed, numbers, heir picker |
| 4D | Coming back | — | Lock-screen push copy, in the character's voice |
| 5A | University | Do | Debt pinned in the header in red |
| 5B | Sports career | Do | Short high-variance ladder + "after playing" |
| 5C | Crime | Do | Payout and caught-odds shown on every tile |
| 5D | Prison | Life | Recoloured chrome; "what this costs after" names closed doors |
| 5E | Fame | More | Three-way opinion split: fans / indifferent / haters |
| 5F | Health & hospital | Life | Costed surgical options; birthplace comparison shown once per life |
| 5G | Your kids | People | Per-child stats; the recurring "two things at once" card |

### Navigation

Five tabs: **Life · People · Do · Money · More**. There is no World tab, by design.

## Design overrides

The design file post-dates the prose spec and supersedes it here:

| Spec says | Design says | We follow |
| --- | --- | --- |
| §52 nav: Life / People / Activities / More | Life / People / Do / Money / More | Design |
| §28 ten attributes | Five surfaced: Health, Happiness, Smarts, Fitness, Charm | Design (rest stay hidden) |
| §57 optional World screen | No World tab at all; world arrives only as a life card | Design |
| §43 "START NEW LIFE" | Continue as your heir (Maya / Theo / somebody new) | Design — this is the *lineage* mechanic and the game's title |
| §111 creation: name, gender, country, city, appearance | Name, birthplace, what you're born into. Start at **birth** | Design |
| §113 MVP: one country | Birthplace picker across 193 countries, content packs per country | Design intent; MVP ships a few packs and a generic fallback |
| §55 unlimited activities | Limited actions per year ("Three things left this year") | **Neither** — see below |

Two mechanics exist only in the design and are therefore first-class requirements:
**succession/lineage** and **fame as a three-way opinion split**.

### The one place we follow neither

Design 2C says "Actions are limited per year, so a year has to be spent rather
than farmed", and shows "Three things left this year" in the header. We do not
do that, on the product owner's call, because the genre does not: BitLife has no
overall cap on actions in a year. What it has is **diminishing returns per
activity** — most things can be tapped freely but stop giving progress after a
few goes, skill classes only advance you the first three times, and
over-practising a sport injures you.

That is what we implement:

- No global budget. A year holds as much as the player wants to do.
- Each activity declares `effectiveTimes` — how many times a year it still does
  something — and `onRepeat`, which is either `no_effect` or `riskier`.
- Past that point a `no_effect` activity is a free no-op: it costs nothing,
  changes nothing, and the tile says "Nothing more to gain this year".
- A `riskier` one keeps accepting taps and applies **only** the harm. The fourth
  training session of the year is an injury, not a personal best — applying the
  gains as well would net out positive and quietly reward the spamming this
  exists to discourage.

The design's underlying goal — that a year is spent rather than farmed — is met.
The mechanism is different, and better matched to content that ranges from
"call your mother" to "start a company".
