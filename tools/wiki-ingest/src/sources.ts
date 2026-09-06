/**
 * The wikis we treat as a structural checklist.
 *
 * See docs/CONTENT_PIPELINE.md for why this pipeline extracts facts and not
 * prose. In short: their text is CC-BY-SA and, more importantly, using it would
 * make the game worse — the whole point of this product is its own voice.
 */
export interface WikiSource {
  id: string;
  label: string;
  /** MediaWiki API endpoint. We use the API, never the rendered HTML. */
  api: string;
  /** Categories worth walking. Everything else is noise. */
  categories: string[];
  /** Which of our systems this source is expected to inform. */
  informs: string[];
}

export const SOURCES: WikiSource[] = [
  {
    id: 'bitlife',
    label: 'BitLife — Life Simulator Wiki',
    api: 'https://bitlife-life-simulator.fandom.com/api.php',
    categories: [
      'Careers',
      'Special Careers',
      'Jobs',
      'Activities',
      'Crime',
      'Relationships',
      'Education',
      'Assets',
      'Health',
      'Statistics',
    ],
    informs: ['careers', 'activities', 'crime', 'education', 'assets', 'health'],
  },
  {
    id: 'anotherlife',
    label: 'Another Life — Life Simulator',
    api: 'https://another-life.fandom.com/api.php',
    categories: ['Careers', 'Skills', 'Events', 'Locations', 'Items'],
    informs: ['careers', 'activities', 'events', 'locations'],
  },
];

/**
 * Non-wiki guides (mrguider and friends) are ordinary copyrighted articles with
 * no open licence at all. They are read by a human, in a browser, for ideas —
 * they are deliberately not in this list and must not be scraped.
 */
export const HUMAN_READING_ONLY = [
  'https://www.mrguider.org/cheats/another-life-life-simulator-cheats-guide-tips-tricks/',
];
