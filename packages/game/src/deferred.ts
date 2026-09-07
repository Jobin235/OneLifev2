import type { GameConfig } from '@lineage/config';
import type { ContentPack } from '@lineage/content';
import type { CareerTrack, EducationStage, Effect, LifeState } from '@lineage/shared-types';
import { makeId, promote, type Rng } from '@lineage/simulation';
import { bearChild, spawnNpc } from '@lineage/npc-engine';
import { ASSET_TEMPLATES, BUSINESS_TEMPLATES, businessNameFor } from './templates.js';

/**
 * Effects that need content or the NPC engine, and so cannot be applied by the
 * pure effect layer. Splitting them this way keeps `@lineage/event-engine` free of
 * any dependency on the content package.
 */
export const applyDeferred = (
  effects: Effect[],
  state: LifeState,
  content: ContentPack,
  config: GameConfig,
  rng: Rng,
  bindings: Record<string, string>,
): void => {
  const country = content.countriesById.get(state.character.countryId);

  for (const effect of effects) {
    switch (effect.op) {
      case 'career_promote': {
        const job = state.career.current;
        const track = job ? content.careersById.get(job.trackId) : undefined;
        if (job && track) promote(state, track);
        break;
      }

      case 'career_join': {
        // "auto" lets content say "they got a job" without naming the ladder,
        // which is what makes all twelve tracks reachable instead of three.
        const track =
          effect.trackId === 'auto'
            ? pickTrack(state, content, rng)
            : content.careersById.get(effect.trackId);
        if (!track) break;
        if (state.career.closedTrackIds.includes(track.id)) break;
        const rung = track.rungs[Math.min(effect.rungIndex, track.rungs.length - 1)];
        if (!rung) break;

        const multiplier = country?.wageMultiplier ?? 1;
        const salary = Math.round(rung.salary * multiplier);

        state.career.current = {
          trackId: track.id,
          employerName: employerNameFor(track.industry, rng),
          rungId: rung.id,
          title: rung.title,
          salary,
          yearsInRole: 0,
          yearsAtEmployer: 0,
          performance: 50,
          satisfaction: 62,
          rivalNpcId: null,
          managerNpcId: null,
        };
        state.career.retired = false;
        state.character.finances.salary = salary;

        // A workplace comes with a manager and someone who wants your job.
        if (country) {
          const managerTemplate = content.npcTemplates.find((t) => t.id === 'manager');
          const rivalTemplate = content.npcTemplates.find((t) => t.id === 'coworker_rival');
          if (managerTemplate) {
            const { npc } = spawnNpc({ state, template: managerTemplate, country, traits: content.traits, rng });
            state.career.current.managerNpcId = npc.id;
          }
          if (rivalTemplate && rng.chance(0.7)) {
            const { npc, relationship } = spawnNpc({ state, template: rivalTemplate, country, traits: content.traits, rng });
            state.career.current.rivalNpcId = npc.id;
            relationship.memories.push({
              id: makeId('mem', state.seed, npc.id, 'rival'),
              atAge: state.character.age,
              factKey: 'wants_your_job',
              line: `${npc.firstName} is up for the same things you are.`,
              weight: 55,
              data: {},
              resolved: false,
            });
          }

          /*
           * And the people you actually sit near. A workplace of exactly two —
           * your boss and your enemy — is a sitcom, not a job, and it left the
           * work screen with nobody on it worth talking to.
           */
          const friendTemplate = content.npcTemplates.find((t) => t.id === 'coworker_friend');
          if (friendTemplate) {
            const taken = new Set(state.npcs.filter((n) => n.alive).map((n) => n.firstName));
            for (let i = 0; i < rng.int(1, 3); i++) {
              let spawned = spawnNpc({ state, template: friendTemplate, country, traits: content.traits, rng });
              for (let attempt = 0; attempt < 4 && taken.has(spawned.npc.firstName); attempt++) {
                state.npcs.pop();
                state.relationships.pop();
                spawned = spawnNpc({ state, template: friendTemplate, country, traits: content.traits, rng });
              }
              taken.add(spawned.npc.firstName);
            }
          }
        }
        break;
      }

      case 'move_city': {
        const moveTo =
          effect.cityId !== 'auto'
            ? (country?.cities.find((c) => c.id === effect.cityId) ?? null)
            : (() => {
                const options = (country?.cities ?? []).filter(
                  (c) => c.id !== state.character.cityId,
                );
                return options.length > 0 ? rng.pick(options) : null;
              })();
        if (moveTo) {
          state.character.cityId = moveTo.id;
          // Kept in step so "{city}" never names the place they just left.
          state.flags.city_name = moveTo.name;
        }
        break;
      }

      case 'spawn_npc': {
        if (!country) break;
        const template = content.npcTemplates.find((t) => t.id === effect.templateId);
        if (!template) break;
        const { npc } = spawnNpc({ state, template, country, traits: content.traits, rng });
        bindings[effect.role] = npc.id;
        break;
      }

      case 'child_born': {
        if (!country) break;
        const { npc } = bearChild(state, country, rng, effect.namedAfter);
        bindings.child = npc.id;
        state.character.finances.annualExpenses += config.money.perChildAnnualCost;
        break;
      }

      case 'asset_add': {
        const template = ASSET_TEMPLATES[effect.assetId];
        if (!template) break;
        if (state.assets.some((a) => a.label === template.label)) break;
        state.assets.push({
          ...template,
          id: makeId('ast', state.seed, effect.assetId, state.step),
          acquiredAtAge: state.character.age,
        });
        break;
      }

      case 'asset_sell': {
        const index = state.assets.findIndex(
          (a) => a.id === effect.assetRef || a.kind === effect.assetRef,
        );
        const asset = state.assets[index];
        if (index < 0 || !asset) break;
        state.character.finances.cash += asset.value - asset.loanOutstanding;
        state.assets.splice(index, 1);
        break;
      }

      case 'business_start': {
        const template = BUSINESS_TEMPLATES[effect.templateId];
        if (!template) break;
        state.businesses.push({
          ...template,
          id: makeId('biz', state.seed, effect.templateId, state.step),
          name: businessNameFor(effect.templateId, state.character.lastName),
          cityId: state.character.cityId,
          foundedAtAge: state.character.age,
        });
        break;
      }

      default:
        break;
    }
  }
};

const EMPLOYER_WORDS: Record<string, string[]> = {
  Technology: ['Northgate Labs', 'Halcyon Systems', 'Brightwater', 'Ardent Data', 'Kestrel Software'],
  Transport: ['Meridian Freight', 'Cascade Logistics', 'Ironline Haulage'],
  Logistics: ['Meridian Freight', 'Bellhouse Distribution', 'Tallow Yard'],
  Healthcare: ["St. Vincent's", 'Riverside General', 'Mercy North', 'The Alder Practice'],
  Legal: ['Farrow & Bell', 'Ashcombe Partners', 'Ludlow Kane'],
  Education: ['Lincoln High', 'Grantham Academy', 'Portland State'],
  Retail: ['Marlowe & Sons', 'Fairhaven Stores', 'The Corner Group'],
  Construction: ['Ridgeway Contracting', 'Callum Build', 'Stonefield'],
  'Professional services': ['Harrowgate Advisory', 'Linden Partners'],
  'Public office': ['Ward 4', 'City Hall', 'The County'],
  'Public service': ['The County', 'City Hall', 'the Force', 'the Service'],
  Sport: ['Cascade FC', 'Northside Athletic', 'Rivermouth United'],
  Media: ['Channel Nine', 'The Daily', 'Longwave Radio'],
  Finance: ['Northgate Bank', 'Ashwell & Co.', 'Pellinore Capital', 'Braddock Mutual'],
  Business: ['Halloway Group', 'Trent & Mowbray', 'Fenwick Holdings'],
  Hospitality: ['The Hollow Oak', 'Bellamy House', 'The Quarry Kitchen'],
  Agriculture: ['Thorn Farm', 'Bracken Fields', 'Wexley Estate'],
  Automotive: ['Dalton Motors', 'The Arch Garage', 'Fenner Autos'],
  Creative: ['Studio Vell', 'Marrow & Ink', 'The Print Room'],
  Engineering: ['Ansell Engineering', 'Vance Works', 'Redbourne Group'],
  Facilities: ['Crestwell Services', 'The Estate Office', 'Fairmile FM'],
  Manufacturing: ['Harlow Steel', 'Verity Works', 'Cobb & Daughters'],
  Property: ['Bellweather Homes', 'Anselm Estates', 'Priory Property'],
  Science: ['The Institute', 'Vane Laboratory', 'Aldergate Research'],
  Security: ['Blackthorn Security', 'Sentinel Group'],
  Services: ['Aldridge & Co.', 'The Bureau', 'Quillon Services'],
};

/*
 * A fallback that still reads like a real employer.
 *
 * This used to return the literal string "A company you had not heard of",
 * which then appeared in the log as "You left A company you had not heard of."
 * Sixty-three new career tracks brought industries the table did not cover, and
 * the placeholder started showing up in people's life stories.
 */
const FALLBACK_NAMES = ['Ellerby', 'Hartnell', 'Vosper', 'Cranleigh', 'Whitlock', 'Padgett'];

export const employerNameFor = (industry: string, rng: Rng): string => {
  const pool = EMPLOYER_WORDS[industry];
  if (pool) return rng.pick(pool);
  return `${rng.pick(FALLBACK_NAMES)} ${rng.pick(['& Co.', 'Group', 'Partners', 'Limited'])}`;
};


/**
 * Chooses a ladder the character could plausibly be on, weighted by how well they
 * fit it. Someone with high smarts and a degree drifts toward medicine or law;
 * someone with neither ends up in retail, which is the honest outcome.
 */
const pickTrack = (
  state: LifeState,
  content: ContentPack,
  rng: Rng,
  /** Extra filter, e.g. "must actually pay". */
  accept: (track: CareerTrack) => boolean = () => true,
): CareerTrack | undefined => {
  const order: EducationStage[] = [
    'none',
    'primary',
    'secondary',
    'vocational',
    'university',
    'graduate',
  ];
  const held = order.indexOf(state.education.highestCompleted);

  const eligible = content.careers.filter((track) => {
    if (!accept(track)) return false;
    if (state.career.closedTrackIds.includes(track.id)) return false;
    if (order.indexOf(track.requiredEducation as EducationStage) > held) return false;
    if (track.countryIds.length > 0 && !track.countryIds.includes(state.character.countryId)) {
      return false;
    }
    for (const [stat, required] of Object.entries(track.requiredStats)) {
      const value = state.character.stats[stat as keyof typeof state.character.stats];
      if (typeof value === 'number' && value < required) return false;
    }
    // A sports ladder is not a fallback job.
    if (track.retiresAtAge !== null && state.character.age > 24) return false;
    return true;
  });

  if (eligible.length === 0) return content.careersById.get('retail');

  return rng.weighted(eligible, (track) => {
    // Prefer ladders whose stat requirements the character clears comfortably.
    const margins = Object.entries(track.requiredStats).map(([stat, required]) => {
      const value = state.character.stats[stat as keyof typeof state.character.stats] ?? 50;
      return value - required;
    });
    const fit = margins.length === 0 ? 10 : margins.reduce((a, b) => a + b, 0) / margins.length;
    return Math.max(1, 20 + fit);
  });
};

/**
 * Puts an unemployed adult into whatever work is open to them.
 *
 * Delegates to the same `career_join` path events use, so a job taken passively
 * is indistinguishable from one taken through a decision — same ladder, same
 * manager, same colleagues.
 */
export const takeAvailableJob = (
  state: LifeState,
  content: ContentPack,
  config: GameConfig,
  rng: Rng,
): string | null => {
  /*
   * Drifting into work means drifting into *paid* work. Some ladders start on
   * an unpaid rung — a football academy, a party volunteer — and those are
   * things a person chooses, not somewhere they end up by default. Assigning
   * one as an ordinary job gave an eighteen-year-old a career with no wages.
   */
  const track = pickTrack(state, content, rng, (t) => (t.rungs[0]?.salary ?? 0) > 0);
  if (!track) return null;

  applyDeferred(
    [{ op: 'career_join', trackId: track.id, rungIndex: 0 }] as never,
    state,
    content,
    config,
    rng,
    {},
  );
  return state.career.current?.title ?? null;
};
