/**
 * Site-wide configuration: navigation, metadata and the standing notices that
 * every page must carry.
 */

export const SITE = {
  name: 'BetterLabo',
  shortName: 'BetterLabo',
  domain: 'betterlabo.org',
  tagline: 'Transparency and civic data for Labo, Camarines Norte',
  description:
    'An independent, open-source portal for the Municipality of Labo, Camarines Norte: all 52 barangays on an interactive map, FY 2024 local fiscal data compiled from BLGF, flood and landslide hazard layers from Project NOAH, and a citizen reporting channel.',
  locale: 'en_PH',
} as const;

export const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/map', label: 'Map' },
  { href: '/barangays', label: 'Barangays' },
  { href: '/services', label: 'Services' },
  { href: '/officials', label: 'Officials' },
  { href: '/updates', label: 'Updates' },
  { href: '/appointments', label: 'Appointments' },
  { href: '/budget', label: 'Budget' },
  { href: '/projects', label: 'Projects' },
  { href: '/documents', label: 'Documents' },
  { href: '/report', label: 'Report an issue' },
  { href: '/data', label: 'Data & sources' },
  { href: '/about', label: 'About' },
] as const;

/** Standard independence notice — repeated in the footer and on About. */
export const INDEPENDENCE_NOTICE =
  'BetterLabo is an independent, volunteer-built civic technology project. It is not an official website of the Municipality of Labo, and it is not affiliated with any political party or candidate. Every figure links to the government source it came from.';

export const EMERGENCY_NOTICE =
  'This portal is not an emergency channel. In a life-threatening emergency, call 911 or the MDRC/MDRRMO hotline directly.';
