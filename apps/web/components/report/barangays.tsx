'use client';

import { useEffect, useState } from 'react';

import type { BarangayRecord } from '@betterlabo/shared';

/**
 * The barangay list is read from the STATIC `/data/barangays.json` file in the
 * browser, never through the reporting API. The ETL compiles it, so the picker
 * still works on a deployment whose database is down and the form can always be
 * filled in even when a submission will fail.
 */

interface BarangayIndexPayload {
  barangays?: BarangayRecord[];
}

export interface BarangaysState {
  barangays: BarangayRecord[];
  status: 'loading' | 'ready' | 'failed';
}

export function useBarangays(): BarangaysState {
  const [barangays, setBarangays] = useState<BarangayRecord[]>([]);
  const [status, setStatus] = useState<BarangaysState['status']>('loading');

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch('/data/barangays.json', {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const payload = (await res.json()) as BarangayIndexPayload;
        const list = Array.isArray(payload.barangays) ? payload.barangays : [];
        if (list.length === 0) throw new Error('empty index');
        setBarangays(
          [...list].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
        );
        setStatus('ready');
      } catch (err) {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        setStatus('failed');
      }
    })();

    return () => controller.abort();
  }, []);

  return { barangays, status };
}

/**
 * The `<option>` list for a native select. `includeAll` adds the empty
 * "All barangays" option the console filters need; the intake form omits it so
 * the required-field behaviour stays honest.
 */
export function BarangayOptions({
  barangays,
  includeAll = false,
}: {
  barangays: BarangayRecord[];
  includeAll?: boolean;
}) {
  return (
    <>
      {includeAll ? <option value="">All barangays</option> : null}
      {barangays.map((b) => (
        <option key={b.psgcCode} value={b.psgcCode}>
          {b.name}
        </option>
      ))}
    </>
  );
}
