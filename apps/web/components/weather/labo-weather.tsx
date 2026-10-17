'use client';

/**
 * Current weather and a short forecast for Labo.
 *
 * WHY THIS IS AN EXCEPTION TO THE CACHE-FIRST RULE
 *
 * Every other figure on this portal is compiled at build time into a static JSON
 * file, and the brief is explicit that the client must not make redundant runtime
 * external calls. Weather is the one case where that rule produces a worse
 * product: a nightly-compiled forecast is stale by breakfast and actively
 * misleading during a typhoon — which is exactly when a Labo resident needs it.
 *
 * So there is exactly ONE live call, to Open-Meteo:
 *   - no API key, no account, no per-request billing, no key to leak;
 *   - CORS-enabled, so it can be called straight from the browser;
 *   - the request carries only the municipality's centre coordinate.
 *
 * The cost is accepted deliberately and bounded: one request, on one page, when
 * the widget is on screen. If it fails, the section says so and the rest of the
 * page is untouched — nothing here is load-bearing.
 *
 * WMO weather codes: https://open-meteo.com/en/docs (the `weather_code` field).
 */
import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
  Wind,
} from 'lucide-react';

import { cn } from '@/lib/cn';

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CENTRE = { lat: 14.1526, lng: 122.8297 };
const ATTRIBUTION = 'Open-Meteo (open-meteo.com) — CC BY 4.0';

interface CurrentWeather {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
}

interface DailyWeather {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
}

interface Forecast {
  current: CurrentWeather;
  daily: DailyWeather;
  timezone: string;
}

/** WMO code → label + icon. Grouped, because the exact code rarely matters. */
function describe(code: number): { label: string; Icon: typeof Sun } {
  if (code === 0) return { label: 'Clear sky', Icon: Sun };
  if (code === 1) return { label: 'Mainly clear', Icon: CloudSun };
  if (code === 2) return { label: 'Partly cloudy', Icon: CloudSun };
  if (code === 3) return { label: 'Overcast', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Fog', Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', Icon: CloudDrizzle };
  if (code >= 61 && code <= 67) return { label: 'Rain', Icon: CloudRain };
  if (code >= 71 && code <= 77) return { label: 'Snow', Icon: CloudSnow };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', Icon: CloudRain };
  if (code >= 85 && code <= 86) return { label: 'Snow showers', Icon: CloudSnow };
  if (code >= 95) return { label: 'Thunderstorm', Icon: CloudLightning };
  return { label: 'Unsettled', Icon: Cloud };
}

function dayName(iso: string, index: number): string {
  if (index === 0) return 'Today';
  const date = new Date(`${iso}T12:00:00`);
  return date.toLocaleDateString('en-PH', { weekday: 'short' });
}

export function LaboWeather({ className }: { className?: string }) {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [error, setError] = useState(false);
  const [observedAt, setObservedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = new URL(ENDPOINT);
    url.searchParams.set('latitude', String(CENTRE.lat));
    url.searchParams.set('longitude', String(CENTRE.lng));
    url.searchParams.set(
      'current',
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
    );
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum');
    url.searchParams.set('timezone', 'Asia/Manila');
    url.searchParams.set('forecast_days', '5');

    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: Forecast) => {
        setForecast(data);
        setObservedAt(new Date().toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }));
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(true);
      });

    return () => {
      controller.abort();
    };
  }, []);

  if (error) {
    return (
      <div className={cn('rounded-card border border-rule bg-surface p-5', className)}>
        <p className="eyebrow">Weather</p>
        <p className="mt-2 text-sm text-ink-support">
          Live weather could not be loaded just now. For warnings that matter, follow{' '}
          <a
            className="link"
            href="https://www.facebook.com/LGULaboCamNorte"
            target="_blank"
            rel="noreferrer noopener"
          >
            the LGU&rsquo;s own page
          </a>{' '}
          or PAGASA.
        </p>
      </div>
    );
  }

  if (!forecast) {
    return (
      <div className={cn('rounded-card border border-rule bg-surface p-5', className)}>
        <p className="eyebrow">Weather</p>
        <p className="mt-2 text-sm text-ink-subtle" role="status">
          Loading the current conditions for Labo…
        </p>
      </div>
    );
  }

  const { current, daily } = forecast;
  const now = describe(current.weather_code);

  return (
    <div className={cn('rounded-card border border-rule bg-surface p-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Weather</p>
          <p className="mt-1 text-sm font-bold text-ink">Labo right now</p>
        </div>
        <now.Icon aria-hidden className="size-9 text-brand-700" />
      </div>

      <p className="mt-3 text-3xl font-bold tracking-tight text-ink tabular-nums">
        {Math.round(current.temperature_2m)}°C
      </p>
      <p className="text-sm text-ink-support">
        {now.label}
        <span className="text-ink-subtle">
          {' '}
          · feels like {Math.round(current.apparent_temperature)}°C
        </span>
      </p>

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-rule pt-3 text-xs">
        <div>
          <dt className="flex items-center gap-1 text-ink-subtle">
            <Droplets aria-hidden className="size-3.5" /> Humidity
          </dt>
          <dd className="mt-0.5 font-semibold text-ink tabular-nums">
            {Math.round(current.relative_humidity_2m)}%
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-ink-subtle">
            <Wind aria-hidden className="size-3.5" /> Wind
          </dt>
          <dd className="mt-0.5 font-semibold text-ink tabular-nums">
            {Math.round(current.wind_speed_10m)} km/h
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-ink-subtle">
            <CloudRain aria-hidden className="size-3.5" /> Rain now
          </dt>
          <dd className="mt-0.5 font-semibold text-ink tabular-nums">
            {current.precipitation > 0 ? `${current.precipitation} mm` : 'none'}
          </dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-1.5 border-t border-rule pt-3">
        {daily.time.slice(0, 5).map((iso, index) => {
          const day = describe(daily.weather_code[index] ?? 0);
          return (
            <li key={iso} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <day.Icon aria-hidden className="size-4 shrink-0 text-ink-subtle" />
                <span className="font-medium text-ink">{dayName(iso, index)}</span>
                <span className="truncate text-ink-subtle">{day.label}</span>
              </span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">
                {Math.round(daily.temperature_2m_max[index] ?? 0)}° /{' '}
                <span className="text-ink-subtle">
                  {Math.round(daily.temperature_2m_min[index] ?? 0)}°
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-ink-subtle">
        {observedAt ? `Read at ${observedAt}, ` : ''}
        {ATTRIBUTION}. This is a general forecast for the municipal centre, not an official warning —
        for those, follow{' '}
        <a
          className="link"
          href="https://www.facebook.com/LGULaboCamNorte"
          target="_blank"
          rel="noreferrer noopener"
        >
          the LGU
        </a>{' '}
        and PAGASA.
      </p>
    </div>
  );
}
