/**
 * A dependency-free PMTiles v3 reader, enough to stream a published NOAH hazard
 * archive into MapLibre without vendoring the 5.5 GB tile set.
 *
 * Why this exists: `NEXT_PUBLIC_NOAH_PMTILES_URL` may point at a PMTiles archive
 * on a third-party host. MapLibre cannot read PMTiles on its own, and the
 * `pmtiles` package is not a dependency of this workspace — so the archive is
 * read here over HTTP range requests and handed to MapLibre through a custom
 * protocol. Only the tile headers, the directories in the request path and the
 * requested tile are ever downloaded.
 *
 * Everything is fail-soft: an unsupported archive, a host without range support
 * or a decoder that the browser lacks all raise a descriptive Error that the
 * layer panel renders as a sentence, never as a blank map.
 *
 * Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
 */
import type { AddProtocolAction } from 'maplibre-gl';

const HEADER_BYTES = 127;
const MAGIC = 'PMTiles';
/** Refuse to pull an entire archive into memory when a host ignores `Range`. */
const MAX_UNRANGED_DOWNLOAD = 32 * 1024 * 1024;

const COMPRESSION_NONE = 1;
const COMPRESSION_GZIP = 2;
const COMPRESSION_BROTLI = 3;
const COMPRESSION_ZSTD = 4;

export interface PmtilesHeader {
  rootOffset: number;
  rootLength: number;
  metadataOffset: number;
  metadataLength: number;
  leafOffset: number;
  leafLength: number;
  dataOffset: number;
  dataLength: number;
  addressedTiles: number;
  tileEntries: number;
  tileContents: number;
  clustered: boolean;
  internalCompression: number;
  tileCompression: number;
  tileType: number;
  minZoom: number;
  maxZoom: number;
  /** `[west, south, east, north]` in degrees. */
  bounds: [number, number, number, number];
  center: { lng: number; lat: number; zoom: number };
}

interface DirectoryEntry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

/* ─────────────────────────────── decoding ─────────────────────────────── */

function compressionName(code: number): string {
  switch (code) {
    case COMPRESSION_NONE:
      return 'none';
    case COMPRESSION_GZIP:
      return 'gzip';
    case COMPRESSION_BROTLI:
      return 'brotli';
    case COMPRESSION_ZSTD:
      return 'zstd';
    default:
      return `unknown(${code})`;
  }
}

/**
 * PMTiles may compress directories, metadata and tiles independently. The
 * browser can only decode gzip natively, so the other codecs are reported as a
 * limitation of the client rather than silently producing garbage.
 */
async function decode(buffer: ArrayBuffer, compression: number, what: string): Promise<ArrayBuffer> {
  if (compression === COMPRESSION_NONE || buffer.byteLength === 0) return buffer;
  if (compression !== COMPRESSION_GZIP) {
    throw new Error(
      `This archive stores its ${what} with ${compressionName(compression)} compression, which this browser cannot decode. Ask the archive's publisher for a gzip or uncompressed copy, or run \`npm run etl hazards\` to clip a static layer instead.`,
    );
  }
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      `This browser has no \`DecompressionStream\`, so it cannot read the gzip-compressed ${what} of this PMTiles archive.`,
    );
  }
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).arrayBuffer();
}

function readUint64(view: DataView, offset: number): number {
  const low = view.getUint32(offset, true);
  const high = view.getUint32(offset + 4, true);
  return high * 4_294_967_296 + low;
}

function readVarint(view: DataView, start: number): { value: number; next: number } {
  let value = 0;
  let shift = 0;
  let offset = start;
  for (;;) {
    if (offset >= view.byteLength) throw new Error('PMTiles: the directory is truncated.');
    const byte = view.getUint8(offset);
    offset += 1;
    value += (byte & 0x7f) * 2 ** shift;
    if (byte < 0x80) return { value, next: offset };
    shift += 7;
    if (shift > 49) throw new Error('PMTiles: varint is too long.');
  }
}

/** Hilbert curve index of a `z/x/y` tile — the ordering PMTiles addresses tiles by. */
export function zxyToTileId(z: number, x: number, y: number): number {
  if (z < 0 || z > 26) throw new Error(`PMTiles: zoom ${z} is not addressable.`);
  let accumulator = 0;
  for (let level = 0; level < z; level += 1) accumulator += 4 ** level;

  const size = 2 ** z;
  let a = x;
  let b = y;
  let distance = 0;
  for (let step = size >> 1; step > 0; step = Math.floor(step / 2)) {
    const rx = (a & step) > 0 ? 1 : 0;
    const ry = (b & step) > 0 ? 1 : 0;
    distance += step * step * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) {
        a = step - 1 - a;
        b = step - 1 - b;
      }
      const swap = a;
      a = b;
      b = swap;
    }
  }
  return accumulator + distance;
}

function deserializeDirectory(buffer: ArrayBuffer): DirectoryEntry[] {
  const view = new DataView(buffer);
  const count = readVarint(view, 0);
  let cursor = count.next;

  const tileIds: number[] = [];
  let lastId = 0;
  for (let index = 0; index < count.value; index += 1) {
    const delta = readVarint(view, cursor);
    cursor = delta.next;
    lastId += delta.value;
    tileIds.push(lastId);
  }

  const runLengths: number[] = [];
  for (let index = 0; index < count.value; index += 1) {
    const run = readVarint(view, cursor);
    cursor = run.next;
    runLengths.push(run.value);
  }

  const lengths: number[] = [];
  for (let index = 0; index < count.value; index += 1) {
    const length = readVarint(view, cursor);
    cursor = length.next;
    lengths.push(length.value);
  }

  const entries: DirectoryEntry[] = [];
  for (let index = 0; index < count.value; index += 1) {
    const raw = readVarint(view, cursor);
    cursor = raw.next;
    const previous = entries[index - 1];
    // `0` means "immediately after the previous entry"; anything else is offset + 1.
    const offset = raw.value === 0 && previous ? previous.offset + previous.length : raw.value - 1;
    entries.push({
      tileId: tileIds[index] ?? 0,
      runLength: runLengths[index] ?? 0,
      length: lengths[index] ?? 0,
      offset,
    });
  }
  return entries;
}

/** The entry covering `tileId`, or `null`. Leaf pointers carry `runLength === 0`. */
function findEntry(entries: DirectoryEntry[], tileId: number): DirectoryEntry | null {
  let low = 0;
  let high = entries.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = entries[mid];
    if (!entry) return null;
    const comparison = tileId - entry.tileId;
    if (comparison > 0) low = mid + 1;
    else if (comparison < 0) high = mid - 1;
    else return entry;
  }
  const candidate = entries[high];
  if (!candidate) return null;
  if (candidate.runLength === 0) return candidate;
  if (tileId - candidate.tileId < candidate.runLength) return candidate;
  return null;
}

/* ──────────────────────────────── reader ──────────────────────────────── */

export class PmtilesReader {
  readonly url: string;
  private headerPromise: Promise<PmtilesHeader> | null = null;
  private rootPromise: Promise<DirectoryEntry[]> | null = null;
  /** Set only when the host ignored `Range` and the archive is small enough. */
  private whole: ArrayBuffer | null = null;

  constructor(url: string) {
    this.url = url;
  }

  header(): Promise<PmtilesHeader> {
    this.headerPromise ??= this.readHeader();
    return this.headerPromise;
  }

  /** The archive's TileJSON-ish metadata, including `vector_layers`. */
  async metadata(): Promise<Record<string, unknown> | null> {
    const header = await this.header();
    if (header.metadataLength === 0) return null;
    const raw = await this.readRange(header.metadataOffset, header.metadataLength);
    const decoded = await decode(raw, header.internalCompression, 'metadata');
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(decoded));
      return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** The tile's decompressed bytes, or `null` when the archive has no such tile. */
  async getTile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
    const header = await this.header();
    if (z < header.minZoom || z > header.maxZoom) return null;

    const tileId = zxyToTileId(z, x, y);
    const root = await this.rootDirectory();
    let entry = findEntry(root, tileId);

    // A runLength of 0 in a directory means "this points at a leaf directory".
    for (let depth = 0; entry && entry.runLength === 0 && depth < 4; depth += 1) {
      const directory = await this.readDirectory(
        header.leafOffset + entry.offset,
        entry.length,
        header.internalCompression,
      );
      entry = findEntry(directory, tileId);
    }
    if (!entry) return null;

    const raw = await this.readRange(header.dataOffset + entry.offset, entry.length);
    return await decode(raw, header.tileCompression, 'tiles');
  }

  private rootDirectory(): Promise<DirectoryEntry[]> {
    this.rootPromise ??= this.header().then((header) =>
      this.readDirectory(header.rootOffset, header.rootLength, header.internalCompression),
    );
    return this.rootPromise;
  }

  private async readDirectory(offset: number, length: number, compression: number): Promise<DirectoryEntry[]> {
    if (length === 0) return [];
    const raw = await this.readRange(offset, length);
    const decoded = await decode(raw, compression, 'directories');
    return deserializeDirectory(decoded);
  }

  private async readHeader(): Promise<PmtilesHeader> {
    const view = new DataView(await this.readRange(0, HEADER_BYTES));
    let magic = '';
    for (let index = 0; index < 7; index += 1) magic += String.fromCharCode(view.getUint8(index));
    if (magic !== MAGIC) {
      throw new Error(
        `The hazard archive at ${this.url} does not look like a PMTiles file (found "${magic}", expected "${MAGIC}"). Check that NEXT_PUBLIC_NOAH_PMTILES_URL points at the .pmtiles object itself.`,
      );
    }
    const version = view.getUint8(7);
    if (version !== 3) {
      throw new Error(`The hazard archive at ${this.url} is PMTiles v${version}; this reader handles v3 only.`);
    }
    return {
      rootOffset: readUint64(view, 8),
      rootLength: readUint64(view, 16),
      metadataOffset: readUint64(view, 24),
      metadataLength: readUint64(view, 32),
      leafOffset: readUint64(view, 40),
      leafLength: readUint64(view, 48),
      dataOffset: readUint64(view, 56),
      dataLength: readUint64(view, 64),
      addressedTiles: readUint64(view, 72),
      tileEntries: readUint64(view, 80),
      tileContents: readUint64(view, 88),
      clustered: view.getUint8(96) === 1,
      internalCompression: view.getUint8(97),
      tileCompression: view.getUint8(98),
      tileType: view.getUint8(99),
      minZoom: view.getUint8(100),
      maxZoom: view.getUint8(101),
      bounds: [
        view.getInt32(102, true) / 1e7,
        view.getInt32(106, true) / 1e7,
        view.getInt32(110, true) / 1e7,
        view.getInt32(114, true) / 1e7,
      ],
      center: {
        zoom: view.getUint8(118),
        lng: view.getInt32(119, true) / 1e7,
        lat: view.getInt32(123, true) / 1e7,
      },
    };
  }

  private async readRange(offset: number, length: number): Promise<ArrayBuffer> {
    if (length <= 0) return new ArrayBuffer(0);
    if (this.whole) return this.whole.slice(offset, offset + length);

    const end = offset + length - 1;
    let response: Response;
    try {
      response = await fetch(this.url, { headers: { Range: `bytes=${offset}-${end}` } });
    } catch (error) {
      throw new Error(
        `Could not reach the hazard archive at ${this.url}: ${describe(error)}. A streamed overlay needs a connection every time it is switched on.`,
      );
    }
    if (!response.ok && response.status !== 206) {
      throw new Error(`The hazard archive at ${this.url} answered HTTP ${response.status} to a range request.`);
    }
    if (response.status === 206) return await response.arrayBuffer();

    // The host ignored `Range` and started streaming the whole archive.
    const whole = await response.arrayBuffer();
    if (whole.byteLength > MAX_UNRANGED_DOWNLOAD) {
      throw new Error(
        `${this.url} does not support HTTP range requests, so the whole archive would have to be downloaded (${whole.byteLength} bytes). Use a host that honours \`Range\`, or compile the clipped layer with \`npm run etl hazards\`.`,
      );
    }
    this.whole = whole;
    return whole.slice(offset, offset + length);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Registers the `pmtiles://` protocol with MapLibre. Safe to call more than once
 * per page — MapLibre keeps one handler per protocol name.
 */
export function registerPmtilesProtocol(maplibre: {
  addProtocol: (name: string, fn: AddProtocolAction) => void;
}): void {
  const readers = new Map<string, PmtilesReader>();
  maplibre.addProtocol('pmtiles', async (request) => {
    const match = /^pmtiles:\/\/(.+?)\/(\d+)\/(\d+)\/(\d+)(?:\?.*)?$/.exec(request.url);
    const [, base, z, x, y] = match ?? [];
    if (!base || z === undefined || x === undefined || y === undefined) {
      throw new Error(`PMTiles protocol: could not read a z/x/y tile address from "${request.url}".`);
    }
    let reader = readers.get(base);
    if (!reader) {
      reader = new PmtilesReader(base);
      readers.set(base, reader);
    }
    const tile = await reader.getTile(Number(z), Number(x), Number(y));
    return { data: tile ?? new ArrayBuffer(0) };
  });
}
