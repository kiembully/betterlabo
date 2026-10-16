/**
 * TASK lgu — compile what the Municipality of Labo publishes on its own website.
 *
 * Why this task exists: the portal could say a great deal about Labo's money,
 * hazards and roads, but nothing about *who* runs it. `PENDING_FIELDS` carried
 * "Elected and appointed officials" with the note that no open dataset provides
 * them. The LGU's own site does — it is the authoritative source for the roster,
 * the offices and the telephone numbers.
 *
 * Why it goes through the Wayback Machine: `labo.gov.ph` is behind a Cloudflare
 * interactive challenge. Every path returns `403` + `Cf-Mitigated: challenge`,
 * including `/robots.txt`, `/sitemap.xml` and `/wp-json/wp/v2/pages`, so there is
 * no API-first pivot available. Archived captures are the honest route, and a
 * timestamped snapshot is better provenance than a live scrape of a page whose
 * content moves.
 *
 * TWO THINGS THE DATA FORCED, both of which shape the output:
 *
 *  1. **The current capture names nobody.** As of the 2026-02-01 capture, the
 *     executive section lists "Office of the Municipal Mayor" and "Office of the
 *     Municipal Vice Mayor" with no names, and the legislative page is an empty
 *     "MUNICIPAL COUNCILORS" heading. The department heads ARE named. The LGU's
 *     own news index carries an item about the mayor and vice mayor being
 *     suspended and DILG filling two vacant Sangguniang Bayan seats. This task
 *     therefore never asserts a current office-holder it cannot see: each section
 *     records the snapshot date it came from, and names recovered from an older
 *     capture are labelled with that older date.
 *  2. **The roster is not static.** Between 2024-04 and 2026-02 the social
 *     welfare officer changed, two section heads swapped roles, and three new
 *     offices appeared. So the compile step records what it saw and when.
 */
import { readFile } from 'node:fs/promises';

import { log } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { recordProvenance, recordUnavailable } from '../lib/registry.mjs';
import { SOURCES } from '../lib/sources.mjs';
import {
  fetchSnapshot,
  htmlToLines,
  listSnapshots,
  snapshotDate,
  snapshotIso,
  snapshotUrl,
} from '../lib/wayback.mjs';
import { writeStableJson } from '../lib/write.mjs';

/**
 * The five clusters, and where each one's office list actually lives.
 *
 * The department index links these names from the page body, but the URLs are not
 * derivable from the names: "Infrastructure" is published at `infrastructure-2`,
 * because a first attempt at that page still holds the slug. Mapping them
 * explicitly is the only correct option, and each entry is verified by the parse
 * itself — a cluster page that yields no offices is recorded as such, not silently
 * dropped.
 */
const CLUSTER_PAGES = {
  'economic-development': 'https://labo.gov.ph/about/department-and-offices/economic-development/',
  'fiscal-management': 'https://labo.gov.ph/about/department-and-offices/fiscal-management/',
  infrastructure: 'https://labo.gov.ph/about/department-and-offices/infrastructure-2/',
  'public-administration': 'https://labo.gov.ph/about/department-and-offices/public-administration/',
  'social-services': 'https://labo.gov.ph/about/department-and-offices/social-services/',
};

const ALL_CAPS = /^[A-ZÑ][A-ZÑ0-9 .,'\-]*$/;

function isAllCaps(line) {
  return ALL_CAPS.test(line) && /[A-Z]{3}/.test(line);
}

/**
 * One entry on the officials page. The markup is a flat sequence of
 * name → position → office → address → phone, terminated by "VIEW MORE", so the
 * parse is positional rather than selector-based. The executive entries have no
 * name at all in the current capture: they begin with "Office of the …".
 */
function parsePersonBlock(block) {
  if (block.length === 0) return null;
  const first = block[0];
  let name = null;
  let position = null;
  let lines = [];

  if (/^office of the/i.test(first)) {
    position = first;
    lines = block.slice(1);
  } else if (isAllCaps(first)) {
    name = first;
    position = block[1] ?? null;
    lines = block.slice(2);
  } else {
    return null;
  }

  const address = lines.find((l) => /labo,\s*camarines norte/i.test(l)) ?? null;
  const phone = lines.find((l) => /^\(?\d[\d) .\-]{5,}$/.test(l)) ?? null;
  const office = lines.find((l) => l !== address && l !== phone && !/^view more$/i.test(l)) ?? null;

  // "2/F Maharlika Highway, Municipal Building, …" — the floor is its own field
  // because the address doubles as a location string on the map.
  const floor = address ? (address.match(/^(\d+)\s*\/\s*F\b/i)?.[1] ?? null) : null;

  return {
    name: name ? titleCaseName(name) : null,
    position: position ? titleCasePosition(position) : null,
    office: office ? office.trim() : null,
    address,
    floor: floor ? `${floor}/F` : null,
    phone,
  };
}

/**
 * "DR. NELSON A. GUERRA" → "Dr. Nelson A. Guerra".
 *
 * Normalises to NFC first: "CARDIÑO" in one capture is decomposed (n + U+0303),
 * and a naive `\b[a-zñ]` pass over the decomposed form yields "CardiÑO".
 * Capitalisation is driven by "preceded by a non-letter" rather than `\b`, which
 * has the same weakness around combining marks.
 */
function titleCaseName(raw) {
  const lowered = raw.normalize('NFC').toLowerCase();
  return lowered
    // Capitalise only after whitespace, a period or an apostrophe — NOT after a
    // hyphen, because Filipino given names hyphenate with a lowercase element
    // ("Sina-on", "Dela-cruz") and "Sina-On" is simply wrong.
    .replace(/(^|[\s.'’])(\p{L})/gu, (_, pre, ch) => pre + ch.toUpperCase())
    .replace(/\bJr\b/g, 'Jr.')
    .replace(/\bSr\b/g, 'Sr.')
    .replace(/\bIi\b/g, 'II')
    .replace(/\bIii\b/g, 'III')
    .replace(/\bIv\b/g, 'IV')
    .replace(/\bSgd\b/g, 'SGD');
}

/** "MUNICIPAL BUDGET OFFICER" → "Municipal Budget Officer"; "MDRRMO" stays. */
function titleCasePosition(raw) {
  const small = new Set(['of', 'and', 'the', 'for', 'to']);
  return raw
    .normalize('NFC')
    .toLowerCase()
    .split(' ')
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
    .replace(/\bMdrrmo\b/g, 'MDRRMO')
    .replace(/\bRhu\b/g, 'RHU')
    .replace(/\bIi\b/g, 'II')
    .replace(/\bIii\b/g, 'III')
    .replace(/\bEnp\b/g, 'ENP')
    .replace(/\bMenro\b/g, 'MENRO');
}

function parseOfficialsPage(html) {
  const lines = htmlToLines(html);
  const marker = lines.lastIndexOf('municipal officials and department heads');
  if (marker === -1) return null;
  const region = lines.slice(marker + 1);

  const groups = { executive: [], 'department heads': [], 'section heads': [] };
  let current = 'executive';
  let block = [];
  const end = region.findIndex((l) => /^REPUBLIC OF THE PHILIPPINES$/i.test(l));

  for (const line of region.slice(0, end === -1 ? region.length : end)) {
    const key = line.toLowerCase();
    if (key === 'department heads' || key === 'section heads') {
      if (block.length) {
        const person = parsePersonBlock(block);
        if (person) groups[current].push(person);
        block = [];
      }
      current = key;
      continue;
    }
    if (line.toUpperCase() === 'VIEW MORE') {
      const person = parsePersonBlock(block);
      if (person) groups[current].push(person);
      block = [];
      continue;
    }
    block.push(line);
  }
  if (block.length) {
    const person = parsePersonBlock(block);
    if (person) groups[current].push(person);
  }
  return {
    executive: groups.executive.filter(Boolean),
    departmentHeads: groups['department heads'].filter(Boolean),
    sectionHeads: groups['section heads'].filter(Boolean),
  };
}

/**
 * The legislative page mixes two label directions, which is what makes it easy to
 * mis-read:
 *
 *   HON. REYMON V. SAMONTE      ← name
 *   MUNICIPAL COUNCILOR         ← role for the name ABOVE
 *   REPRESENTATIVE, LIGA NG MGA BARANGAY   ← ex-officio label for the name BELOW
 *   HON. KATHRECE ANNE T. CALEON
 *   MUNICIPAL COUNCILOR
 *   REPRESENTATIVE, SK FEDERATION          ← label with NO name following (vacant)
 *
 * So the ordinary role comes AFTER a name, and the ex-officio label comes BEFORE
 * the name it belongs to. Reading both backwards (the first version of this
 * parser) shifted every title by one and promoted the first councilor to vice
 * mayor; reading both forwards makes the Liga representative an ordinary
 * councilor. Both are handled here.
 */
function parseLegislativePage(html) {
  const lines = htmlToLines(html);
  const start = lines.findIndex((l) => /^local officials$/i.test(l));
  const region = lines.slice(start === -1 ? 0 : start + 1);
  const end = region.findIndex((l) => /^REPUBLIC OF THE PHILIPPINES$/i.test(l));
  const body = region.slice(0, end === -1 ? region.length : end);

  const ROLE = /^MUNICIPAL (VICE MAYOR|COUNCILOR)$/i;
  const EX_OFFICIO = /^REPRESENTATIVE,\s*(LIGA NG MGA BARANGAY|SK FEDERATION)$/i;

  const members = [];
  const vacantSeats = [];
  let pendingExOfficio = null;

  for (let i = 0; i < body.length; i += 1) {
    const line = body[i];

    if (EX_OFFICIO.test(line)) {
      // If no HON. line follows before the next label, the seat is vacant.
      const nextIsName = body[i + 1] && /^HON\./i.test(body[i + 1]);
      const label = line.toUpperCase();
      if (!nextIsName) {
        vacantSeats.push({
          body: /LIGA/.test(label) ? 'Liga ng mga Barangay' : 'Sangguniang Kabataan Federation',
          label,
        });
      } else {
        pendingExOfficio = label;
      }
      continue;
    }

    if (!/^HON\./i.test(line)) continue;

    // The role for THIS name is the next ROLE line before the next name.
    let role = null;
    for (let j = i + 1; j < Math.min(i + 2, body.length); j += 1) {
      if (ROLE.test(body[j])) role = body[j].toUpperCase();
    }

    const isExOfficio = Boolean(pendingExOfficio);
    members.push({
      name: titleCaseName(line.replace(/^HON\.\s*/i, '')),
      role: role ? titleCasePosition(role) : null,
      roleAsPublished: role,
      kind: /VICE MAYOR/.test(role ?? '')
        ? 'vice-mayor'
        : isExOfficio
          ? 'ex-officio'
          : 'councilor',
      exOfficioBody: pendingExOfficio && /LIGA/.test(pendingExOfficio)
        ? 'Liga ng mga Barangay'
        : pendingExOfficio && /SK FEDERATION/.test(pendingExOfficio)
          ? 'Sangguniang Kabataan Federation'
          : null,
    });
    pendingExOfficio = null;
  }

  const details = { members, vacantSeats };
  return details;
}

/**
 * The departments index lists five clusters, each a heading followed by a short
 * description. The descriptions are the LGU's own wording and are kept verbatim —
 * including the fact that the Infrastructure cluster's text says "city" for a
 * municipality, which is the source's copy, not a transcription error here.
 */
function parseClusters(html) {
  const lines = htmlToLines(html);
  const start = lines.findIndex((l) => /^departments & offices$/i.test(l));
  const region = lines.slice(start === -1 ? 0 : start + 1);
  const end = region.findIndex((l) => /^REPUBLIC OF THE PHILIPPINES$/i.test(l));
  const body = region.slice(0, end === -1 ? region.length : end);

  const clusters = [];
  for (let i = 0; i < body.length; i += 1) {
    const line = body[i];
    // Cluster names are short Title Case lines; descriptions are full sentences.
    if (line.length > 42 || /[.!]$/.test(line) || !/^[A-Z][A-Za-z& ]+$/.test(line)) continue;
    const description = body[i + 1] && /[a-z]/.test(body[i + 1]) && body[i + 1].length > 40
      ? body[i + 1]
      : null;
    if (!description) continue;
    clusters.push({
      name: line.trim(),
      slug: line.trim().toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, ''),
      description: description.trim(),
    });
  }
  return clusters;
}

/**
 * A cluster sub-page lists its offices as name → address pairs. This is the real
 * office directory: it carries the barangay ("Brgy. Gumamela") that the officials
 * page omits.
 */
function parseClusterOffices(html) {
  const lines = htmlToLines(html);
  let last = -1;
  lines.forEach((l, i) => {
    if (/^(Youtube|Instagram)$/.test(l)) last = i;
  });
  const lastTab = lines.reduce((acc, l, i) => (/^SOCIAL SERVICES$/.test(l) ? i : acc), -1);
  const from = Math.max(last, lastTab) + 1;
  const end = lines.findIndex((l, i) => i > from && /^REPUBLIC OF THE PHILIPPINES$/i.test(l));
  const body = lines.slice(from, end === -1 ? lines.length : end);

  const offices = [];
  for (let i = 0; i < body.length; i += 1) {
    const name = body[i];
    const next = body[i + 1];
    if (!next || !/labo,?\s*camarines norte/i.test(next)) continue;
    if (name.length > 80 || /[.!]$/.test(name)) continue;
    offices.push({ name: name.trim(), address: next.trim() });
    i += 1;
  }
  return offices;
}

function parseFactsPage(html) {
  const lines = htmlToLines(html);
  const start = lines.findIndex((l) => /^GEOGRAPHY$/i.test(l));
  const region = start === -1 ? lines : lines.slice(start);
  const end = region.findIndex((l) => /^REPUBLIC OF THE PHILIPPINES$/i.test(l));
  const body = region.slice(0, end === -1 ? region.length : end);

  const headings = ['GEOGRAPHY', 'ECONOMY', 'BARANGAYS', 'POPULATION', 'LANGUAGE', 'RELIGION', 'EDUCATION'];
  const sections = {};
  let current = null;
  for (const line of body) {
    const match = headings.find((h) => line.toUpperCase() === h);
    if (match) {
      current = match.toLowerCase();
      sections[current] = [];
      continue;
    }
    if (/^climate$/i.test(line)) {
      current = 'climate';
      sections.climate = [];
      continue;
    }
    if (current) sections[current].push(line);
  }

  const all = body.join(' ');
  const area = Number(all.match(/aggregate land area of ([\d,]+(?:\.\d+)?)\s*km/i)?.[1]?.replace(/,/g, '')) || null;
  const provinceShare = Number(all.match(/more than (\d+(?:\.\d+)?)% of the total land area of the province/i)?.[1]) || null;
  const agricultural = Number(all.match(/([\d,]+(?:\.\d+)?)\s*km²?\s*\([\d.]+% of municipal/i)?.[1]?.replace(/,/g, '')) || null;

  const barangays = (sections.barangays ?? [])
    .map((l) => l.trim())
    .filter((l) => /^[A-Za-zÑñ][A-Za-zÑñ' .\-()]*$/.test(l) && l.length > 2 && !/^The town/i.test(l))
    .map((l) => l.replace(/\s+/g, ' '));

  return {
    areaKm2: area,
    provinceSharePercent: provinceShare,
    agriculturalKm2: agricultural,
    barangays,
    sections: Object.fromEntries(
      Object.entries(sections).filter(([k]) => !['barangays'].includes(k)),
    ),
  };
}

/** Kind of a published document, inferred from its URL slug. */
function documentKind(slug) {
  const s = slug.toLowerCase();
  if (s.includes('notice-to-proceed') || s.includes('notoce-of-award') || s.includes('notice-to-proced')) {
    return s.includes('award') ? 'notice-of-award' : 'notice-to-proceed';
  }
  if (s.includes('notice-of-award')) return 'notice-of-award';
  if (s.includes('invitation-to-bid')) return 'invitation-to-bid';
  if (s.includes('request-for-quotation') || s.includes('rfq')) return 'request-for-quotation';
  if (s.includes('ordinance')) return 'ordinance';
  if (s.includes('budget') || s.includes('aip')) return 'budget-document';
  if (s.includes('report')) return 'report';
  return 'document';
}

/**
 * Index of every document the LGU publishes under `/docs/`, taken from the CDX
 * path index. Titles are DERIVED from the URL slug — the LGU does not publish a
 * title separately in a form this task can read — so they are recorded with
 * `titleDerived: true` rather than passed off as the document's own heading.
 */
async function compileDocumentIndex() {
  const rows = await listSnapshots('labo.gov.ph/docs/*', { limit: 4000 });
  const byPath = new Map();
  for (const row of rows) {
    if (row.status !== '200') continue;
    const slug = row.url?.split('/docs/')[1];
    if (!slug) continue;
    const clean = decodeURIComponent(slug).replace(/\/$/, '');
    if (!clean || clean.includes('?') || /[\u0E00-\u0E7F]/.test(clean)) continue;
    if (!byPath.has(clean) || row.timestamp > byPath.get(clean).timestamp) {
      byPath.set(clean, { slug: clean, timestamp: row.timestamp });
    }
  }
  return [...byPath.values()]
    .map(({ slug, timestamp }) => ({
      slug,
      title: derivedTitle(slug),
      titleDerived: true,
      kind: documentKind(slug),
      path: `/docs/${slug}/`,
      url: `https://labo.gov.ph/docs/${slug}/`,
      lastSeen: snapshotDate(timestamp),
    }))
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? '') || a.slug.localeCompare(b.slug));
}

/** "concreting-of-local-road-p2-492025a-barangay-guisican-…" → "Concreting of local road P2 492025A…". */
function derivedTitle(slug) {
  const small = new Set(['of', 'the', 'and', 'at', 'in', 'to', 'for']);
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => {
      if (i > 0 && small.has(w.toLowerCase())) return w.toLowerCase();
      if (/^\d/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}

export async function run(ctx) {
  const src = SOURCES.lgu;
  const pages = src.pages;

  // The executive names were REMOVED from the current page, so accept nothing less
  // than a capture that still has an uppercase "MUNICIPAL MAYOR" heading.
  const hasNamedExecutive = (html) => /MUNICIPAL MAYOR/.test(html);
  const hasNamedCouncilors = (html) => /HON\.\s/.test(html);

  const [officialsSnap, namedExecSnap, legislativeSnap, factsSnap, departmentsSnap] =
    await Promise.all([
      fetchSnapshot(pages.officials, {
        slug: 'officials', force: ctx.force, cachedOnly: ctx.cachedOnly, accept: (h) => /VIEW MORE/i.test(h),
      }),
      fetchSnapshot(pages.officials, {
        slug: 'officials-named', force: ctx.force, cachedOnly: ctx.cachedOnly, accept: hasNamedExecutive,
      }),
      fetchSnapshot(pages.legislative, {
        slug: 'legislative', force: ctx.force, cachedOnly: ctx.cachedOnly,
      }),
      fetchSnapshot(pages.facts, {
        slug: 'facts', force: ctx.force, cachedOnly: ctx.cachedOnly, accept: (h) => /GEOGRAPHY/i.test(h),
      }),
      fetchSnapshot(pages.departments, {
        slug: 'departments', force: ctx.force, cachedOnly: ctx.cachedOnly,
      }),
    ]);

  const namedCouncilorSnap = await fetchSnapshot(pages.legislative, {
    slug: 'legislative-named', force: ctx.force, cachedOnly: ctx.cachedOnly, accept: hasNamedCouncilors,
  });

  if (!officialsSnap) {
    await recordUnavailable(
      src,
      'no usable Wayback capture of the officials page (the live host is behind a Cloudflare challenge)',
    );
    log('lgu: no usable officials capture');
    return;
  }

  const roster = parseOfficialsPage(officialsSnap.html) ?? {
    executive: [], departmentHeads: [], sectionHeads: [],
  };
  const namedExec = namedExecSnap ? parseOfficialsPage(namedExecSnap.html) : null;
  const legislative = legislativeSnap
    ? parseLegislativePage(legislativeSnap.html)
    : { members: [], vacantSeats: [] };
  const namedLegislative = namedCouncilorSnap
    ? parseLegislativePage(namedCouncilorSnap.html)
    : { members: [], vacantSeats: [] };

  // Prefer names from the older capture ONLY where the current one has none, and
  // carry the older date with them so the UI can say when they were last stated.
  const executiveNamesRemoved = roster.executive.every((e) => e.name === null);
  const executive = roster.executive.map((entry, index) => {
    if (entry.name || !namedExec) return { ...entry, nameAsOf: entry.name ? snapshotDate(officialsSnap.timestamp) : null };
    const older = namedExec.executive[index] ?? namedExec.executive.find((e) => e.office === entry.office);
    return {
      ...entry,
      name: older?.name ?? null,
      nameAsOf: older?.name ? snapshotDate(namedExecSnap.timestamp) : null,
      nameSourceUrl: older?.name ? snapshotUrl(pages.officials, namedExecSnap.timestamp) : null,
      nameRemovedFromCurrentPage: Boolean(older?.name),
    };
  });

  const facts = factsSnap ? parseFactsPage(factsSnap.html) : null;

  // The office directory. The departments index gives the five clusters with their
  // descriptions; each cluster's own page carries the offices inside it, with the
  // barangay in the address — which is what a citizen needs in order to show up at
  // the right building.
  const clusters = departmentsSnap ? parseClusters(departmentsSnap.html) : [];
  const officeDirectory = await Promise.all(
    Object.entries(CLUSTER_PAGES).map(async ([slug, url]) => {
      const snap = await fetchSnapshot(url, {
        slug: `cluster-${slug}`,
        force: ctx.force,
        cachedOnly: ctx.cachedOnly,
      });
      if (!snap) return { slug, url, offices: [], snapshot: null, note: 'no usable capture' };
      return {
        slug,
        url,
        offices: parseClusterOffices(snap.html),
        snapshot: { date: snapshotDate(snap.timestamp), url: snapshotUrl(url, snap.timestamp) },
        note: null,
      };
    }),
  );
  // Architecture is published as "MUNICIPAL POPULATION OFFICE" on one page and
  // title case on the others; normalise the all-caps ones for display, leaving
  // mixed-case names (and acronyms like MDRRMO) untouched.
  const allOffices = officeDirectory.flatMap((c) =>
    c.offices.map((o) => ({
      ...o,
      name: o.name === o.name.toUpperCase() && o.name.length > 3 ? titleCasePosition(o.name) : o.name,
      cluster: c.slug,
    })),
  );

  const emptyClusters = officeDirectory.filter((c) => c.offices.length === 0);
  for (const c of emptyClusters) {
    log(`lgu: cluster "${c.slug}" yielded no offices${c.note ? ` (${c.note})` : ''}`);
  }

  // Index every published /docs/ document. Cheap (one CDX query) and high value:
  // these are the procurement notices and transparency documents a citizen has to
  // otherwise hunt for page by page.
  let documents = [];
  try {
    documents = ctx.cachedOnly ? [] : await compileDocumentIndex();
  } catch (err) {
    log(`lgu: document index unavailable — ${err?.message ?? err}`);
  }

  // Cross-check the LGU's own barangay list against the PSGC-compiled index. The
  // two use different suffixes for the poblacion barangays — "Anahaw (Poblacion)"
  // on the site vs "Anahaw (Pob.)" from PSGC — so normalisation strips the suffix
  // before comparing names.
  let barangayCheck = null;
  if (facts?.barangays?.length) {
    const normalise = (s) =>
      s.toLowerCase().replace(/\(pob\.?\)|\(poblacion\)/g, '').replace(/\(silang\)/g, '').replace(/[^a-z0-9]/g, '');
    const fromSite = new Map(facts.barangays.map((b) => [normalise(b), b]));
    let compiled = [];
    try {
      const index = JSON.parse(await readFile(paths.barangayIndex, 'utf8'));
      compiled = index.barangays.map((b) => b.name);
    } catch {
      compiled = [];
    }
    const fromPsgc = new Map(compiled.map((b) => [normalise(b), b]));
    const onlyOnSite = [...fromSite.keys()].filter((k) => !fromPsgc.has(k)).map((k) => fromSite.get(k));
    const onlyInPsgc = [...fromPsgc.keys()].filter((k) => !fromSite.has(k)).map((k) => fromPsgc.get(k));
    barangayCheck = {
      siteCount: facts.barangays.length,
      compiledCount: compiled.length,
      matched: [...fromSite.keys()].filter((k) => fromPsgc.has(k)).length,
      onlyOnSite,
      onlyInPsgc,
      agrees: onlyOnSite.length === 0 && onlyInPsgc.length === 0,
      note:
        'Names are compared after stripping the "(Poblacion)"/"(Pob.)" and "(Silang)" suffixes, which the two sources spell differently.',
    };
  }

  // The current legislative capture is an empty heading; when it names nobody,
  // fall back to the newest capture that does, and date the roster to it.
  const currentMembers = legislative.members;
  const fallbackMembers = namedLegislative.members.filter((m) => m.name);
  const usingFallback = currentMembers.length === 0 && fallbackMembers.length > 0;
  const members = usingFallback ? fallbackMembers : currentMembers;
  const vacantSeats = usingFallback ? namedLegislative.vacantSeats : legislative.vacantSeats;
  const councilorsAsOf = usingFallback
    ? snapshotDate(namedCouncilorSnap.timestamp)
    : snapshotDate(legislativeSnap?.timestamp ?? '');

  await writeStableJson(paths.lgu, {
    municipality: 'Labo',
    province: 'Camarines Norte',
    source: {
      name: src.title,
      url: src.portalUrl,
      publisher: src.publisher,
      license: src.license,
      accessedVia:
        'Internet Archive Wayback Machine — the live host answers every path with a Cloudflare challenge (403, Cf-Mitigated: challenge).',
    },
    snapshots: {
      officials: {
        timestamp: officialsSnap.timestamp,
        date: snapshotDate(officialsSnap.timestamp),
        iso: snapshotIso(officialsSnap.timestamp),
        url: snapshotUrl(pages.officials, officialsSnap.timestamp),
        liveUrl: pages.officials,
      },
      executiveNames: namedExecSnap
        ? {
            timestamp: namedExecSnap.timestamp,
            date: snapshotDate(namedExecSnap.timestamp),
            url: snapshotUrl(pages.officials, namedExecSnap.timestamp),
          }
        : null,
      legislative: {
        timestamp: legislativeSnap?.timestamp ?? null,
        date: snapshotDate(legislativeSnap?.timestamp ?? ''),
        url: legislativeSnap ? snapshotUrl(pages.legislative, legislativeSnap.timestamp) : null,
        liveUrl: pages.legislative,
        namedCapture: namedCouncilorSnap
          ? {
              timestamp: namedCouncilorSnap.timestamp,
              date: snapshotDate(namedCouncilorSnap.timestamp),
              url: snapshotUrl(pages.legislative, namedCouncilorSnap.timestamp),
            }
          : null,
      },
      facts: factsSnap
        ? {
            timestamp: factsSnap.timestamp,
            date: snapshotDate(factsSnap.timestamp),
            url: snapshotUrl(pages.facts, factsSnap.timestamp),
            liveUrl: pages.facts,
          }
        : null,
      departments: departmentsSnap
        ? {
            timestamp: departmentsSnap.timestamp,
            date: snapshotDate(departmentsSnap.timestamp),
            url: snapshotUrl(pages.departments, departmentsSnap.timestamp),
            liveUrl: pages.departments,
          }
        : null,
    },
    officials: {
      executive,
      departmentHeads: roster.departmentHeads,
      sectionHeads: roster.sectionHeads,
      counts: {
        executiveOffices: executive.length,
        departmentHeads: roster.departmentHeads.length,
        sectionHeads: roster.sectionHeads.length,
        named: [...executive, ...roster.departmentHeads, ...roster.sectionHeads].filter((p) => p.name).length,
      },
      notices: [
        executiveNamesRemoved
          ? `The ${snapshotDate(officialsSnap.timestamp)} capture of the officials page names NO mayor and NO vice mayor — only "Office of the Municipal Mayor" and "Office of the Municipal Vice Mayor". Names shown here are the last ones the page stated (${snapshotDate(namedExecSnap?.timestamp ?? '')}), with their date attached.`
          : null,
        `Department and section heads are as published in the ${snapshotDate(officialsSnap.timestamp)} capture.`,
      ].filter(Boolean),
    },
    legislative: {
      asOf: councilorsAsOf,
      note: usingFallback
        ? `The ${snapshotDate(legislativeSnap?.timestamp ?? '')} capture of the legislative page is an empty "MUNICIPAL COUNCILORS" heading with no names. The members below are the last ones the page stated, as of ${councilorsAsOf}.`
        : 'Members as published in this capture.',
      members: members.map((m) => ({ ...m, asOf: councilorsAsOf })),
      vacantSeats,
      counts: {
        total: members.length,
        councilors: members.filter((m) => m.kind === 'councilor').length,
        exOfficio: members.filter((m) => m.kind === 'ex-officio').length,
        vacantSeats: vacantSeats.length,
      },
    },
    profile: facts,
    offices: {
      note:
        'The LGU groups its departments into five clusters. Each cluster page lists the offices inside it, with the barangay in the address — which is what a citizen needs in order to show up at the right building.',
      clusters,
      byCluster: officeDirectory.map((c) => ({
        cluster: c.slug,
        name: clusters.find((x) => x.slug === c.slug)?.name ?? null,
        sourceUrl: CLUSTER_PAGES[c.slug],
        snapshot: c.snapshot,
        officeCount: c.offices.length,
        note: c.note,
        offices: c.offices,
      })),
      count: allOffices.length,
      all: allOffices,
    },
    barangayCrossCheck: barangayCheck,
  });

  // The document index is its own file: ~1,500 entries and ~585 KB, which is far
  // too much to ship on a page that only needs the officials. The documents page
  // fetches it on its own.
  await writeStableJson(paths.lguDocuments, {
    municipality: 'Labo',
    note:
      'Every document the Municipal Government of Labo publishes under /docs/ — procurement notices, invitations to bid, requests for quotation, awards. ' +
      'Titles are DERIVED from the URL slug (the site exposes no separate machine-readable title) and are marked titleDerived. ' +
      'Links point at labo.gov.ph, which is behind a Cloudflare challenge for machines but renders normally in a browser.',
    sourceIndex: 'https://web.archive.org/cdx/search/cdx?url=labo.gov.ph/docs/*',
    count: documents.length,
    byKind: documents.reduce((acc, d) => {
      acc[d.kind] = (acc[d.kind] ?? 0) + 1;
      return acc;
    }, {}),
    items: documents,
  });
  const persons = [
    ...roster.executive,
    ...roster.departmentHeads,
    ...roster.sectionHeads,
  ];
  await recordProvenance({
    id: src.id,
    title: src.title,
    publisher: src.publisher,
    portalDatasetId: null,
    portalUrl: src.portalUrl,
    sourceUrl: src.portalUrl,
    license: src.license,
    licenseUrl: src.licenseUrl,
    attributionText: src.attributionText,
    retrievedAt: new Date().toISOString(),
    sourceVersion: `snapshot ${snapshotDate(officialsSnap.timestamp)}`,
    rowCount: persons.length + members.length,
    bytes: officialsSnap.html.length,
    sha256: null,
    outputs: ['apps/web/public/data/lgu.json'],
    notes:
      `Read from Wayback captures because the live host is Cloudflare-gated. Officials capture ${snapshotDate(officialsSnap.timestamp)}; ` +
      `executive names last stated ${snapshotDate(namedExecSnap?.timestamp ?? '')}; legislative roster as of ${councilorsAsOf}. ` +
      `${roster.departmentHeads.length} department heads, ${roster.sectionHeads.length} section heads, ` +
      `${members.length} legislative members. ` +
      (barangayCheck ? `The LGU's own barangay list cross-checks ${barangayCheck.matched}/${barangayCheck.compiledCount} against the PSGC-compiled index.` : ''),
    unavailable: false,
  });

  log(
    `lgu: ${roster.departmentHeads.length} department heads, ${roster.sectionHeads.length} section heads, ` +
      `${executive.length} executive offices, ${members.length} legislative members ` +
      `(officials snapshot ${snapshotDate(officialsSnap.timestamp)})`,
  );
  if (barangayCheck) {
    log(
      `lgu: barangay cross-check — site ${barangayCheck.siteCount}, compiled ${barangayCheck.compiledCount}, matched ${barangayCheck.matched}` +
        (barangayCheck.agrees ? ' (agree)' : ` — only on site: ${barangayCheck.onlyOnSite.join(', ') || 'none'}; only in PSGC: ${barangayCheck.onlyInPsgc.join(', ') || 'none'}`),
    );
  }
}
