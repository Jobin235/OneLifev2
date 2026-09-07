# Writing an event

Events are the game. Everything else is infrastructure for getting one in front
of a player at the right moment.

## The voice

This is not a style preference; it is the product. From the design file:

> **They offered you the senior role — in Denver.**
> Marcus called you in. More money, better title, 1,200 miles away. Emma told you
> once she'd never move for a job, and she wasn't joking.
>
> - **Take it and move** → *You took it. Emma said she'd visit. She visited twice.*
> - **Ask to do it from Portland** → *Marcus pushed it through, grudgingly. He mentions it whenever he needs a favour.*
> - **Turn it down** → *You said no and didn't explain why. Emma still doesn't know she was the reason.*

Five rules, in order of how much damage breaking them does:

1. **No option is clean.** If one branch is obviously correct, it is not a
   decision, it is a formality. The safe choice must cost something too.
2. **Name people.** `{partner}`, `{friend}`, `{boss}` — never "your partner".
   The engine resolves these to actual people the player has met.
3. **Outcomes are past tense and specific.** "She visited twice." Not
   "Relationship decreased." The delta pills already say the numbers.
4. **The consequence outlives the card.** "He mentions it whenever he needs a
   favour" is a promise. Keep it with a `remember` effect and a follow-up.
5. **Never explain the simulation.** No scores, no probabilities, no "relevance".
   The exception is where the fiction itself would show a number: crime odds and
   surgery prices are on the card because the character would know them.

Length: readable in 5–15 seconds. Title one line. Body two or three.

## The shape

```jsonc
{
  "id": "career_relocation_offer",
  "version": 1,                    // bump when meaning changes; old instances stay readable
  "category": "career",
  "card": { "icon": "💼", "label": "WORK", "tint": "#EAF2FA", "color": "#2E6FA8" },
  "weightClass": "major",          // major = a card; minor = a recap line only
  "priority": 78,                  // base ranking weight, before relevance and noise
  "minAge": 24,
  "maxAge": 55,

  "conditions": { "all": [ { "field": "career.performance", "op": ">=", "value": 60 } ] },

  "participants": [
    { "role": "boss", "kinds": ["boss"], "pick": "closest", "required": false }
  ],

  "title": "They offered you the senior role — in Denver.",
  "body": "More money, better title, 1,200 miles away.",

  "choices": [
    {
      "id": "take_it",
      "label": "Take it and move",
      "note": "optional right-hand annotation",
      "requires": { "field": "money.liquid", "op": ">=", "value": 500000 },
      "outcomes": [
        {
          "id": "moved",
          "when": { "field": "has.partner", "op": "==", "value": true },
          "chance": 0.6,
          "text": "You took it. {partner} said {partner.they}'d visit. {partner.they} visited twice.",
          "historyLine": "You moved to Denver for work.",
          "effects": [ { "op": "salary", "delta": 2200000 } ]
        }
      ]
    }
  ],

  "cooldownYears": 8,
  "maxPerLife": 1,
  "scheduledOnly": false,          // true = only reachable via a `schedule` effect
  "countryIds": [],                // empty = everywhere
  "tags": []
}
```

Outcomes are evaluated **in order**; the first whose `when` and `chance` both
pass is applied. The last one should be unconditional, or the choice can silently
do nothing.

Money is in **cents**. `2200000` is $22,000.

## Conditions

Dotted paths, resolved against a read-only view. Never expressions.

| Path | Example |
| --- | --- |
| `age`, `sex`, `country`, `city`, `generation` | `age >= 18` |
| `stats.*` | `stats.charm >= 60` |
| `money.cash / savings / debt / liquid / net / salary` | `money.liquid >= 500000` |
| `career.employed / performance / years_in_role / experience / retired` | `career.performance >= 80` |
| `education.stage / enrolled / grade / debt` | `education.stage == "university"` |
| `business.owns / profit / employees / units` | `business.employees >= 8` |
| `record.clean / convictions / incarcerated` | `record.clean == true` |
| `health.untreated`, `health.<conditionId>` | `health.high_blood_pressure == true` |
| `rel.<role>.romance / trust / conflict / score / years / age` | `rel.partner.romance >= 66` |
| `memory.<factKey>` | `memory.owes_you_money == true` |
| `flags.<key>` | `flags.took_denver == true` |
| `count.children / friends / siblings` | `count.children >= 2` |
| `has.partner / spouse / child / business / house / job / debt` | `has.business == true` |
| `world.fuel / inflation / employment / …` | `world.fuel >= 112` |

Operators: `== != > >= < <= contains in not_in exists not_exists`.
Logic: `{ "all": [...] }`, `{ "any": [...] }`, `{ "not": {...} }`.

A missing field compares as `-Infinity`, so `career.performance >= 80` is false
for the unemployed rather than accidentally true.

## Effects

A closed vocabulary. There is no way for a content file to run code.

`stat` `hidden` `money` `debt` `salary` `relationship` `remember` `resolve_memory`
`relationship_kind` `trait_add` `trait_remove` `habit_add` `habit_remove`
`condition_add` `condition_treat` `flag` `fame` `reputation` `convict`
`career_promote` `career_join` `career_leave` `career_performance`
`career_close_track` `asset_add` `asset_sell` `business_start` `business_units`
`business_price` `business_close` `spawn_npc` `child_born` `move_city` `schedule`

`career_join` accepts `"trackId": "auto"`, which picks a ladder the character
plausibly qualifies for. Prefer it — naming a track makes eleven of the twelve
ladders unreachable.

### The two that make people feel real

**`remember`** stores a fact *and* the sentence that describes it, together, so
they can never drift apart:

```json
{ "op": "remember", "target": "partner", "factKey": "you_gave_something_up_for_them",
  "line": "You turned down Denver because of {partner.them}. {partner.they} never found out.",
  "weight": 90 }
```

Later events query `memory.you_gave_something_up_for_them`. The player reads the
line on the person's screen. This is the entire mechanism behind "she told you
she'd never move for a job" mattering nine years later.

**`schedule`** plants a follow-up:

```json
{ "op": "schedule", "eventId": "relationship_the_thing_you_never_said", "inYears": 8 }
```

Scheduled events bypass cooldowns and jump the queue, because a chain that said
"we'll come back to this" has to keep its promise. Mark the target
`"scheduledOnly": true` so it cannot fire on its own.

## Participants

```json
{ "role": "friend", "kinds": ["friend", "best_friend"], "pick": "closest", "required": true }
```

`pick`: `closest` · `most_conflict` · `oldest` · `youngest` · `random`.

If a `required` role has nobody to fill it, the event does not fire — that is how
"your partner asks about kids" never reaches someone single, with no condition
needed. Mark a role `required: false` only when the sentence still works without
that person named; an unbound role falls back to a generic phrase.

## Checklist before committing

- [ ] Every branch costs something.
- [ ] Every outcome is past tense and specific.
- [ ] The last outcome in each choice is unconditional.
- [ ] Money is in cents.
- [ ] `maxPerLife` and `cooldownYears` are set deliberately.
- [ ] Anything scheduled exists and is marked `scheduledOnly`.
- [ ] `pnpm test` passes — the loader validates references, and the fiction tests
      check that no unresolved `{token}` can reach a player.
- [ ] You have read twenty generated lives and this event reads well in them.

## Where ideas come from

`docs/CONTENT_PIPELINE.md`, and `tools/wiki-ingest` which produces a gap list.
That list is a checklist of *subjects*, never a source of text. The step from
"they model military service and we don't" to a finished event is a writing job.


## Writing an activity

Activities live in `content/activities.json` and are simpler than events: no
conditions, no branching, just effects and a shape for how they wear out.

```jsonc
{
  "id": "get_in_shape",
  "icon": "🏋️",
  "label": "Get in shape",
  "group": "body_and_head",     // colours the tile: see design 2C
  "minAge": 12,
  "cost": 0,                    // cents
  "effectiveTimes": 3,          // times a year it still does something; 0 = never fades
  "onRepeat": "riskier",        // or "no_effect"
  "onlyWhen": "anywhere",       // or incarcerated / enrolled / employed
  "note": "💪 +8 · ❤️ +4",       // shown on the tile, before the tap
  "effects": [ { "op": "stat", "stat": "fitness", "delta": 8 } ]
}
```

**There is no global action budget.** A player may do as much in a year as they
like. What stops a year being farmed is `effectiveTimes` per activity.

Choosing the two fields:

- `effectiveTimes` — how many times this plausibly helps in one year. Three for
  training or classes, one for things that only make sense once (looking at
  houses, asking for a raise), `0` for anything that should never stop working
  (calling your mother).
- `onRepeat` — `no_effect` for almost everything: the tile greys out and says
  "Nothing more to gain this year", and a tap is a free no-op. Use `riskier`
  only where overdoing it genuinely hurts — training, drinking, overwork. Past
  the limit those apply **only** the harm, never the benefit.

`note` is written for before the tap, so the player is making a bet rather than
guessing. State the actual numbers where they are known and the honest shrug
("who knows") where they are not.
