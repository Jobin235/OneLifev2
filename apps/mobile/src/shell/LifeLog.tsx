import { useEffect, useMemo, useRef } from 'react';
import type { LifeView } from '../lib/api';

/**
 * The log is the game.
 *
 * Plain running text, one sentence per line, grouped under an age header,
 * oldest at the top, and the view sits at the bottom on the year that just
 * happened. No cards, no per-line icons, no tiles competing with it — density
 * is the point, because a 70-year life has to read as one continuous document
 * you can scroll back through. See docs/BITLIFE-LOOP-SPEC.md §1.
 *
 * An earlier version rendered each year as a card with an emoji per line, which
 * turned eight events into a screen and a half and made a life feel like a feed.
 */
export const LifeLog = ({ life }: { life: LifeView }) => {
  const years = useMemo(() => {
    const out: { age: number; lines: string[] }[] = [];
    for (const entry of life.log) {
      const last = out[out.length - 1];
      if (last && last.age === entry.atAge) last.lines.push(entry.text);
      else out.push({ age: entry.atAge, lines: [entry.text] });
    }
    return out;
  }, [life.log]);

  /*
   * Stick to the bottom as the life grows. Ageing up appends beneath what is
   * already there, so "the newest year" and "the bottom of the scroll" are the
   * same place, and the player scrolls *up* into their past.
   */
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [life.log.length]);

  return (
    <div className="sh-log" ref={scroller}>
      {years.map((year) => (
        <div className="sh-year" key={year.age}>
          <div className="sh-year-head">Age: {year.age} {year.age === 1 ? 'year' : 'years'}</div>
          {year.lines.map((line, index) => (
            <p className="sh-line" key={index}>
              {line}
            </p>
          ))}
        </div>
      ))}
      <div className="sh-log-tail" />
    </div>
  );
};
