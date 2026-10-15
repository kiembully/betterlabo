'use client';

/**
 * The legend. It reports what is actually drawn — the boundary classes that are
 * switched on, and the hazard classes present in the compiled file — instead of
 * listing every class the design system knows about.
 */
import { cn } from '@/lib/cn';
import { formatNumber } from '@betterlabo/shared';

import { HAZARD_CLASSES, MAP_COLOURS, hazardClassMeta } from './map-config';
import type { HazardClassCount, HazardOption, HazardRuntime, LayerToggles } from './types';

export interface MapLegendProps {
  hazard: HazardOption | null;
  runtime: HazardRuntime;
  toggles: LayerToggles;
}

function Swatch({ colour, outline = false }: { colour: string; outline?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'size-3.5 shrink-0 rounded-[3px] border',
        outline ? 'border-transparent' : 'border-black/10',
      )}
      style={outline ? { borderColor: colour, backgroundColor: 'transparent' } : { backgroundColor: colour }}
    />
  );
}

function LegendRow({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-2 py-0.5 text-xs text-ink-support">{children}</li>;
}

export function MapLegend({ hazard, runtime, toggles }: MapLegendProps) {
  const classes: HazardClassCount[] =
    runtime.classes.length > 0
      ? runtime.classes
      : HAZARD_CLASSES.map((entry) => ({ id: entry.id, count: 0 }));

  return (
    <div className="mt-6">
      <p className="eyebrow">Legend</p>

      <ul className="mt-2">
        {toggles.boundaries ? (
          <>
            <LegendRow>
              <Swatch colour={MAP_COLOURS.barangayFill} />
              Barangay area (52)
            </LegendRow>
            <LegendRow>
              <Swatch colour={MAP_COLOURS.poblacionFill} />
              Poblacion core
            </LegendRow>
            <LegendRow>
              <Swatch colour={MAP_COLOURS.selectedFill} />
              Selected barangay
            </LegendRow>
          </>
        ) : null}
        {toggles.municipality ? (
          <LegendRow>
            <Swatch colour={MAP_COLOURS.outlineStrong} outline />
            Labo municipal boundary
          </LegendRow>
        ) : null}
        {toggles.labels ? (
          <LegendRow>
            <span aria-hidden className="w-3.5 shrink-0 text-center font-mono text-[10px] font-bold text-ink">
              Aa
            </span>
            Barangay name (zoom 11+)
          </LegendRow>
        ) : null}
        {!toggles.boundaries && !toggles.municipality && !toggles.labels ? (
          <li className="py-0.5 text-xs text-ink-subtle">
            No boundary layer is switched on — only the basemap is drawn.
          </li>
        ) : null}
      </ul>

      <p className="eyebrow mt-4">Hazards</p>
      {!hazard ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-support">
          No hazard overlay is drawn. The layer panel explains whether one exists in this build.
        </p>
      ) : runtime.state === 'failed' ? (
        <p className="mt-2 text-xs leading-relaxed text-accent-red-700">
          The hazard overlay could not be drawn: {runtime.message}
        </p>
      ) : runtime.state === 'loading' ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-support">Loading the hazard overlay…</p>
      ) : (
        <>
          <ul className="mt-2">
            {classes.map((entry) => (
              <LegendRow key={entry.id}>
                <Swatch colour={hazardClassMeta(entry.id).colour} />
                <span className="text-ink">{hazardClassMeta(entry.id).label}</span>
                {entry.count > 0 ? (
                  <span className="tnum ml-auto text-[0.6875rem] text-ink-subtle">
                    {formatNumber(entry.count)}
                  </span>
                ) : null}
              </LegendRow>
            ))}
            {hazardsHaveUnclassified(runtime) ? (
              <LegendRow>
                <Swatch colour={MAP_COLOURS.hazardUnclassified} />
                <span className="text-ink">Unclassified</span>
              </LegendRow>
            ) : null}
          </ul>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-ink-subtle">
            {hazard.mode === 'remote'
              ? 'Class counts are not published per class by the remote archive, so every step of the ramp is listed.'
              : `${formatNumber(runtime.featureCount ?? 0)} hazard areas drawn from the compiled file.`}
            {hazard.attribution ? ` ${hazard.attribution}.` : ''}
          </p>
        </>
      )}
    </div>
  );
}

/** The map reports unclassified areas through the runtime note, not a count. */
function hazardsHaveUnclassified(runtime: HazardRuntime): boolean {
  return runtime.message !== null && runtime.message.includes('neutral tint');
}
