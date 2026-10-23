'use client';

/**
 * The layer control.
 *
 * One component, two layouts: a bottom sheet under `lg` and a static rail beside
 * the map from `lg`. It uses real `<fieldset>`, checkboxes and radios, so the
 * whole control is keyboard- and screen-reader-operable without inventing a
 * widget — and the hazard group never hides an option that exists in the
 * registry: an overlay that cannot be drawn is listed, disabled, and explained.
 */
import { ChevronDown, ChevronUp, GripHorizontal } from 'lucide-react';

import { cn } from '@/lib/cn';

import { type HazardStatus, describeHazardStatus } from './map-config';
import type { HazardOption, HazardRuntime, LayerToggles } from './types';

const TONE_CLASSES: Record<HazardStatus['tone'], string> = {
  default: 'border-gray-300 bg-gray-100 text-gray-700',
  good: 'border-accent-green-500/40 bg-accent-green-50 text-accent-green-700',
  warn: 'border-accent-orange-500/40 bg-accent-orange-50 text-accent-orange-700',
  bad: 'border-accent-red-500/40 bg-accent-red-50 text-accent-red-700',
};

const BOUNDARY_TOGGLES: Array<{ key: keyof LayerToggles; label: string; hint: string }> = [
  {
    key: 'boundaries',
    label: 'Barangay boundaries',
    hint: 'All 52 polygons from the compiled PSA/NAMRIA file, with the poblacion cores picked out.',
  },
  {
    key: 'municipality',
    label: 'Municipal outline',
    hint: 'The compiled Labo boundary, drawn over the barangays.',
  },
  {
    key: 'labels',
    label: 'Barangay names',
    hint: 'Only from zoom 11, and needs a glyph download from the MapLibre font server.',
  },
];

export interface LayerPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggles: LayerToggles;
  onToggle: (key: keyof LayerToggles, value: boolean) => void;
  hazardOptions: HazardOption[];
  activeHazardId: string | null;
  onHazardChange: (id: string | null) => void;
  runtime: HazardRuntime;
  /** Whether `hazards.json` exists at all. */
  hasRegistry: boolean;
  etlHint: string;
  children?: React.ReactNode;
}

export function LayerPanel({
  open,
  onOpenChange,
  toggles,
  onToggle,
  hazardOptions,
  activeHazardId,
  onHazardChange,
  runtime,
  hasRegistry,
  etlHint,
  children,
}: LayerPanelProps) {
  const status = describeHazardStatus({
    options: hazardOptions,
    activeId: activeHazardId,
    runtime,
    hasRegistry,
  });

  return (
    <aside
      id="map-layer-panel"
      aria-label="Map layers and legend"
      className={cn(
        'z-40 flex flex-col overflow-hidden border border-rule bg-surface',
        // `absolute`, not `fixed`: anchored to the map block, so the sheet sits
        // inside the map and scrolls away with it. Fixed to the viewport it
        // floated over the stat cards above the map and the provenance text
        // below it, covering a line of content on a phone at every scroll
        // position. Capped at 70% of the block so the panel's own header — the
        // only way to close it — cannot be dragged above the sticky masthead
        // when the user opens it while the top of the map is off-screen.
        'absolute inset-x-0 bottom-0 max-h-[70%] rounded-t-xl shadow-raised transition-transform duration-300 ease-out',
        open ? 'translate-y-0' : 'translate-y-[calc(100%_-_3.5rem)]',
        'lg:static lg:inset-auto lg:col-start-1 lg:row-start-1 lg:max-h-none lg:translate-y-0 lg:rounded-card lg:shadow-card',
      )}
    >
      <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-rule px-4 py-2">
        <GripHorizontal aria-hidden className="size-4 shrink-0 text-ink-subtle lg:hidden" />
        <p className="text-sm font-bold text-ink">Layers &amp; legend</p>
        <span className="ml-auto hidden xs:block lg:ml-auto">
          <span className={cn('chip', TONE_CLASSES[status.tone])}>{status.label}</span>
        </span>
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          aria-controls="map-layer-panel-body"
          className="ml-auto flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-ink-support transition-colors hover:bg-gray-100 hover:text-ink xs:ml-2 lg:hidden"
        >
          {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronUp aria-hidden className="size-4" />}
          <span className="sr-only">{open ? 'Collapse' : 'Expand'} the layer panel</span>
        </button>
      </div>

      <div
        id="map-layer-panel-body"
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-4 pt-4 scrollbar-none safe-bottom lg:block',
          open ? 'block' : 'hidden',
        )}
      >
        <fieldset className="min-w-0 border-0 p-0">
          <legend className="eyebrow">Base layers</legend>
          {BOUNDARY_TOGGLES.map((toggle) => (
            <label
              key={toggle.key}
              className="mt-1 flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-gray-50"
            >
              <input
                type="checkbox"
                className="mt-0.5 size-4 shrink-0 accent-brand-700"
                checked={toggles[toggle.key]}
                onChange={(event) => onToggle(toggle.key, event.target.checked)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{toggle.label}</span>
                <span className="block text-xs leading-relaxed text-ink-subtle">{toggle.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="mt-6 min-w-0 border-0 p-0">
          <legend className="eyebrow">Hazard overlay</legend>

          <div
            role="status"
            className={cn('mt-2 rounded-lg border px-3 py-2', TONE_CLASSES[status.tone])}
          >
            <p className="text-xs font-bold">{status.label}</p>
            <p className="mt-0.5 text-xs leading-relaxed">{status.detail}</p>
          </div>

          {hazardOptions.length === 0 ? (
            <div className="mt-3">
              <p className="text-xs leading-relaxed text-ink-support">
                {hasRegistry
                  ? 'The compiled hazard registry declares no layers, so there is nothing to switch on yet.'
                  : 'No hazard registry, and no remote archive is configured, so there is nothing to switch on yet.'}
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-950 px-2.5 py-1.5 text-[0.6875rem] text-gray-100">
                <code>{etlHint}</code>
              </pre>
            </div>
          ) : (
            <div className="mt-3 space-y-1">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-gray-50">
                <input
                  type="radio"
                  name="map-hazard-overlay"
                  className="mt-0.5 size-4 shrink-0 accent-brand-700"
                  checked={activeHazardId === null}
                  onChange={() => onHazardChange(null)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">No overlay</span>
                  <span className="block text-xs leading-relaxed text-ink-subtle">
                    Barangay boundaries only.
                  </span>
                </span>
              </label>

              {hazardOptions.map((option) => (
                <HazardOptionRow
                  key={option.id}
                  option={option}
                  checked={option.id === activeHazardId}
                  active={option.id === activeHazardId}
                  onChange={() => onHazardChange(option.id)}
                />
              ))}
            </div>
          )}
        </fieldset>

        {children}
      </div>
    </aside>
  );
}

function HazardOptionRow({
  option,
  checked,
  active,
  onChange,
}: {
  option: HazardOption;
  checked: boolean;
  active: boolean;
  onChange: () => void;
}) {
  const badge =
    option.mode === 'static'
      ? { label: 'Compiled', className: TONE_CLASSES.good }
      : option.mode === 'remote'
        ? { label: 'Streamed · remote', className: TONE_CLASSES.warn }
        : { label: 'Not compiled', className: TONE_CLASSES.default };

  return (
    <label
      className={cn(
        'flex items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors',
        option.ready ? 'cursor-pointer hover:bg-gray-50' : 'cursor-not-allowed',
        active && option.ready ? 'bg-brand-50' : '',
      )}
    >
      <input
        type="radio"
        name="map-hazard-overlay"
        className="mt-0.5 size-4 shrink-0 accent-brand-700"
        checked={checked}
        disabled={!option.ready}
        onChange={onChange}
      />
      <span className={cn('min-w-0', option.ready ? '' : 'opacity-70')}>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{option.label}</span>
          <span className={cn('chip', badge.className)} title={`Overlay mode: ${option.mode}`}>
            {badge.label}
          </span>
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-subtle">{option.detail}</span>
      </span>
    </label>
  );
}
