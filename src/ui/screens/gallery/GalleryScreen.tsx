// The sprite gallery (PRD section 6, "Sprite quality check"): a tool screen at #/gallery for
// judging the art by eye. It is routable but not in the sidebar.
import { useState } from 'react';
import { ACCESSORIES, ACCESSORY_IDS, GROWTH_STAGES, MOODS, type AccessoryId } from '../../../core/types';
import { describeTraits } from '../../../core/sprite';
import { Card, Page } from '../../components/Layout';
import { Sprite } from '../../components/Sprite';
import { cx } from '../../lib/format';
import { Filmstrips } from './Filmstrips';
import { HatchingPreview } from './HatchingPreview';

/** Four birds that differ in every trait, so their differences show side by side. */
const COLUMNS = { gridTemplateColumns: `72px repeat(${MOODS.length}, 128px)` };

export const SAMPLE_SEEDS = [2, 9, 13, 7] as const;

function Chip({
  selected,
  onClick,
  children,
  testId,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={cx(
        'focus-ring h-8 rounded-full border px-3 text-base transition-colors duration-100',
        selected
          ? 'border-accent-border bg-accent-subtle text-fg'
          : 'border-line bg-sunken text-fg-secondary hover:bg-raised',
      )}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-medium tracking-[0.06em] text-fg-muted uppercase">{children}</h2>;
}

export function GalleryScreen() {
  const [seed, setSeed] = useState<number>(SAMPLE_SEEDS[0]);
  const [typed, setTyped] = useState('');
  const [worn, setWorn] = useState<readonly AccessoryId[]>([]);
  const traits = describeTraits(seed);

  const toggle = (id: AccessoryId): void =>
    setWorn((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <Page title="Sprite gallery" meta="Dev tool">
      <div className="flex flex-col gap-8" data-testid="gallery" data-seed={seed} data-worn={worn.join(',')}>
        <section aria-label="Seeds">
          <SectionTitle>Seeds</SectionTitle>
          <Card padding="compact" className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {SAMPLE_SEEDS.map((s) => (
                <Chip key={s} selected={seed === s} onClick={() => setSeed(s)} testId={`seed-chip-${s}`}>
                  Seed {s}
                </Chip>
              ))}
              <label className="ml-2 flex items-center gap-2 text-sm text-fg-secondary">
                Any seed
                <input
                  value={typed}
                  onChange={(event) => {
                    setTyped(event.target.value);
                    const n = Number(event.target.value);
                    if (event.target.value.trim() !== '' && Number.isFinite(n)) setSeed(n);
                  }}
                  inputMode="numeric"
                  aria-label="Type any seed"
                  placeholder="e.g. 20261125"
                  className="focus-ring h-8 w-36 rounded-sm border border-line bg-sunken px-2.5 text-base text-fg placeholder:text-fg-muted hover:border-line-strong"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Accessories">
              <span className="mr-1 text-sm text-fg-secondary">Wearing</span>
              {ACCESSORY_IDS.map((id) => (
                <Chip key={id} selected={worn.includes(id)} onClick={() => toggle(id)} testId={`accessory-${id}`}>
                  {ACCESSORIES[id].label}
                </Chip>
              ))}
            </div>
          </Card>
        </section>

        <section aria-label="Seed comparison">
          <SectionTitle>Four seeds, side by side</SectionTitle>
          <div className="grid grid-cols-4 gap-3" data-testid="gallery-seeds">
            {SAMPLE_SEEDS.map((s) => {
              const t = describeTraits(s);
              return (
                <Card key={s} padding="compact" className="flex flex-col items-center gap-2">
                  <Sprite seed={s} stage="adult" mood="content" accessories={worn} size={128} animated />
                  <div className="text-sm font-medium text-fg">Seed {s}</div>
                  <div className="text-center text-xs text-fg-muted" data-testid={`traits-${s}`}>
                    {t.cheekShape} {t.cheekColor} cheek
                    <br />
                    {t.barring} wing, {t.bellyShade} belly
                    <br />
                    {t.tailLength} tail
                  </div>
                </Card>
              );
            })}
          </div>
        </section>

        <section aria-label="Actual size">
          <SectionTitle>Actual size and menu bar size, seed {seed}</SectionTitle>
          <div className="grid grid-cols-1 gap-3" data-testid="gallery-actual">
            {[
              { name: 'dark', bg: 'bg-canvas', text: 'text-fg-secondary' },
              { name: 'light', bg: 'bg-fg', text: 'text-canvas' },
            ].map((strip) => (
              <div key={strip.name} className={cx('flex flex-wrap items-end gap-6 rounded-md border border-line p-4', strip.bg)}>
                {GROWTH_STAGES.map((stage) => (
                  <div key={stage} className="flex flex-col items-center gap-1" data-testid={`actual-${strip.name}-${stage}`}>
                    <div className="flex items-end gap-3">
                      <Sprite seed={seed} stage={stage} mood="content" accessories={worn} size={96} animated />
                      <Sprite seed={seed} stage={stage} mood="content" accessories={worn} size={32} animated />
                    </div>
                    <span className={cx('text-xs', strip.text)}>{stage} 96 and 32</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Every stage and mood">
          <SectionTitle>Every stage and mood, seed {seed}</SectionTitle>
          <Card padding="compact" className="overflow-x-auto">
            <div className="flex w-max flex-col gap-3" data-testid="gallery-grid">
              <div className="grid gap-x-2" style={COLUMNS}>
                <div />
                {MOODS.map((mood) => (
                  <div key={mood} className="text-center text-xs text-fg-muted">
                    {mood.replace('_', ' ')}
                  </div>
                ))}
              </div>
              {GROWTH_STAGES.map((stage) => (
                <div key={stage} className="grid gap-x-2" style={COLUMNS} data-testid={`row-${stage}`}>
                  <div className="self-center text-sm text-fg-secondary">{stage}</div>
                  {MOODS.map((mood) => (
                    <div key={mood} className="rounded-sm bg-sunken">
                      <Sprite
                        seed={seed}
                        stage={stage}
                        mood={mood}
                        accessories={worn}
                        size={128}
                        animated
                        testId={`cell-${stage}-${mood}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section aria-label="Hatching">
          <SectionTitle>Hatching, seed {seed}</SectionTitle>
          <HatchingPreview seed={seed} />
        </section>

        <section aria-label="Filmstrips">
          <Filmstrips seed={seed} accessories={worn} />
        </section>

        <div className="text-sm text-fg-muted" data-testid="traits-selected">
          Seed {seed}: {traits.cheekShape} {traits.cheekColor} cheek, {traits.barring} wing, {traits.bellyShade} belly, {traits.tailLength} tail
        </div>
      </div>
    </Page>
  );
}
