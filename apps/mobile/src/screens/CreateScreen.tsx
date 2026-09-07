import { useState } from 'react';
import type { AmbitionOption, CountryOption } from '../lib/api';

type Upbringing = 'rough' | 'getting_by' | 'comfortable';

/**
 * Design 4A. Three choices, none of them a character sheet. The one line about
 * the shared world is the only place the architecture is mentioned to the player,
 * and it is phrased as flavour rather than as a feature.
 */
const UPBRINGINGS: Array<{ id: Upbringing; label: string; tag?: string; blurb: string }> = [
  {
    id: 'getting_by',
    label: 'Getting by',
    tag: 'recommended',
    blurb: 'Two parents, one income, a small house.',
  },
  { id: 'rough', label: 'Rough start', blurb: 'Less money, more grit. Harder, more interesting.' },
  {
    id: 'comfortable',
    label: 'Comfortable',
    blurb: 'Money, expectations, and a family name.',
  },
];

export const CreateScreen = ({
  countries,
  ambitions,
  busy,
  onCreate,
}: {
  countries: CountryOption[];
  ambitions: AmbitionOption[];
  busy: boolean;
  onCreate: (input: {
    firstName?: string;
    countryId: string;
    cityId?: string;
    upbringing: Upbringing;
    ambitionId: string | null;
  }) => void;
}) => {
  const [firstName, setFirstName] = useState('');
  const [countryId, setCountryId] = useState(countries[0]?.id ?? 'us');
  const [upbringing, setUpbringing] = useState<Upbringing>('getting_by');
  const [ambitionId, setAmbitionId] = useState<string | null>(null);

  const country = countries.find((c) => c.id === countryId);

  return (
    <>
      <div className="scroll" style={{ gap: 20, paddingTop: 'calc(20px + var(--safe-top))' }}>
        <div className="create-hero">
          <div className="create-emoji">👶</div>
          <h1 className="create-title">A new life</h1>
          <p className="create-sub">You'll start at birth and find out the rest as you go.</p>
        </div>

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            NAME
          </div>
          <input
            className="name-field"
            value={firstName}
            placeholder="Leave blank and we'll pick one"
            maxLength={30}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>

        <div>
          <div
            className="eyebrow"
            style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}
          >
            <span>WHERE IN THE WORLD</span>
            <span style={{ color: 'var(--faint)' }}>{countries.length} to choose from</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {countries.map((option) => (
              <button
                key={option.id}
                className={`pick${option.id === countryId ? ' selected' : ''}`}
                onClick={() => setCountryId(option.id)}
              >
                <span className="pick-flag">{option.flag}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="pick-name" style={{ display: 'block' }}>
                    {option.name}
                  </span>
                  <span className="pick-blurb" style={{ display: 'block' }}>
                    {option.cities[0]?.name} · {option.cities[0]?.blurb}
                  </span>
                </span>
                {option.id === countryId && <span className="pick-tag">PICKED</span>}
              </button>
            ))}
          </div>
        </div>

        {country && country.changes.length > 0 && (
          <section className="panel">
            <div className="eyebrow">WHAT BEING BORN IN {country.name.toUpperCase()} CHANGES</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 13 }}>
              {country.changes.map((change, index) => (
                <div key={index} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 15, lineHeight: 1.3, flex: 'none' }}>{change.icon}</span>
                  <span
                    style={{
                      font: "600 13.5px/1.5 var(--text)",
                      color: 'var(--body)',
                      textWrap: 'pretty',
                    }}
                  >
                    {change.text}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            WHAT YOU'RE BORN INTO
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {UPBRINGINGS.map((option) => (
              <button
                key={option.id}
                className={`pick${option.id === upbringing ? ' selected' : ''}`}
                onClick={() => setUpbringing(option.id)}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="pick-name" style={{ display: 'block' }}>
                    {option.label}
                  </span>
                  <span className="pick-blurb" style={{ display: 'block' }}>
                    {option.blurb}
                  </span>
                </span>
                {option.tag && <span className="pick-tag">{option.tag.toUpperCase()}</span>}
              </button>
            ))}
          </div>
        </div>

        {ambitions.length > 0 && (
          <div>
            <div className="eyebrow" style={{ marginBottom: 4 }}>
              WHAT YOU WANT
            </div>
            {/*
              The one thing this life is for. It bends which events you get from
              the first year, and the ending answers it — so two lives with the
              same start diverge immediately.
            */}
            <div className="pick-blurb" style={{ marginBottom: 10 }}>
              Optional. It changes what happens to you.
            </div>
            <div className="ambition-grid">
              {ambitions.map((option) => (
                <button
                  key={option.id}
                  className={`ambition${option.id === ambitionId ? ' selected' : ''}`}
                  onClick={() => setAmbitionId(option.id === ambitionId ? null : option.id)}
                >
                  <span className="ambition-emoji">{option.emoji}</span>
                  <span className="ambition-label">{option.label}</span>
                  <span className="ambition-pitch">{option.pitch}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            background: 'var(--blue-tint-2)',
            borderRadius: 'var(--r-panel)',
            padding: '15px 16px',
            font: "600 13px/1.55 var(--text)",
            color: 'var(--blue-muted)',
            textWrap: 'pretty',
          }}
        >
          🌍&nbsp;&nbsp;Everyone plays in the same world. Things have been happening in it since
          long before you showed up.
        </div>
      </div>

      <div className="footer">
        <button
          className="age-up"
          disabled={busy}
          onClick={() =>
            onCreate({
              ...(firstName.trim() ? { firstName: firstName.trim() } : {}),
              countryId,
              ...(country?.cities[0] ? { cityId: country.cities[0].id } : {}),
              upbringing,
              ambitionId,
            })
          }
        >
          {busy ? '…' : 'Be born →'}
        </button>
      </div>
    </>
  );
};
