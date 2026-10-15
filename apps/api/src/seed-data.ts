/**
 * Sample reports for the local harness: `npm run seed`.
 *
 * Every barangay PSGC code and centroid below is copied from the compiled PSA
 * index in `apps/web/public/data/barangays.json` — nothing here invents a
 * geographic fact. Reports without a verified centroid carry `location: null`
 * rather than a guessed coordinate.
 */
import type { CreateReportInput, ReportPriority, ReportStatus } from '@betterlabo/shared';

export interface SeedWorkflow {
  status: ReportStatus;
  priority?: ReportPriority;
  assignedOffice?: string | null;
  resolutionNote?: string | null;
}

export interface SeedReport extends CreateReportInput {
  /** Console follow-up applied after creation, so the stats are not all "received". */
  workflow?: SeedWorkflow;
}

// Verified PSA PSGC codes for Labo, Camarines Norte.
const ANAHAW_POB = '0501606012';
const ANAMEAM = '0501606001';
const AWITAN = '0501606002';
const BAAY = '0501606003';
const BAGACAY = '0501606004';
const GUMAMELA_POB = '0501606013';
const KALAMUNDING_POB = '0501606015';
const PINYA_POB = '0501606046';

export const SEED_REPORTS: readonly SeedReport[] = [
  {
    category: 'flood_drainage',
    barangayPsgc: ANAMEAM,
    subject: 'Canal behind the elementary school is blocked',
    details:
      'Silt and cut bamboo have blocked the drainage canal behind Anameam Elementary School. After heavy rain the water reaches the footbridge and does not drain for two days.',
    locationLabel: 'Drainage canal behind Anameam Elementary School',
    location: { lat: 14.163929819750052, lng: 122.59342161825009 },
    reporterName: 'R. Dela Cruz',
    reporterContact: '0917-555-0142',
    contactConsent: true,
    workflow: {
      status: 'in_progress',
      priority: 'high',
      assignedOffice: 'Municipal Engineering Office (MEO)',
      resolutionNote: 'MEO scheduled desilting; equipment requested from the provincial pool.',
    },
  },
  {
    category: 'flood_drainage',
    barangayPsgc: BAAY,
    subject: 'River bank is eroding near the riverside houses',
    details:
      'The Busig-on river bank beside the purok 3 houses has been undercut by the last two typhoons. About four metres of soil is gone and two houses are now within a metre of the edge.',
    locationLabel: 'Purok 3, riverside, Baay',
    location: null,
    reporterName: null,
    reporterContact: null,
    workflow: { status: 'acknowledged', priority: 'urgent' },
  },
  {
    category: 'roads_and_public_works',
    barangayPsgc: AWITAN,
    subject: 'Deep pothole on the barangay access road',
    details:
      'There is a pothole roughly one metre wide on the barangay access road before the chapel. Motorcycles swerve into the opposite lane to avoid it and it fills with water at night.',
    locationLabel: 'Barangay access road, before the chapel, Awitan',
    location: null,
    workflow: { status: 'received' },
  },
  {
    category: 'streetlights_and_power',
    barangayPsgc: ANAHAW_POB,
    subject: 'Three streetlights along the national road are out',
    details:
      'Three consecutive streetlights along the national road are not working. The stretch is completely dark after 7pm and pedestrians walk on the road shoulder.',
    locationLabel: 'National road, Anahaw (Pob.)',
    location: { lat: 14.150574568333374, lng: 122.83828832800009 },
    reporterName: 'J. Manlangit',
    reporterContact: 'jmanlangit@example.ph',
    contactConsent: true,
    workflow: {
      status: 'resolved',
      priority: 'normal',
      resolutionNote: 'Replaced two busted lamps; the third fixture needs a new ballast on order.',
    },
  },
  {
    category: 'waste_management',
    barangayPsgc: BAGACAY,
    subject: 'Uncollected garbage piling up at the collection point',
    details:
      'The collection point has not been serviced for nine days. Household waste is now on the roadside and stray dogs are scattering it into the canal.',
    locationLabel: 'Barangay collection point, Bagacay',
    location: null,
    workflow: { status: 'in_progress', priority: 'high' },
  },
  {
    category: 'water_supply',
    barangayPsgc: GUMAMELA_POB,
    subject: 'Low water pressure in the whole purok since Monday',
    details:
      'Water only trickles between 5am and 7am in the entire purok. Most households cannot fill a pail in that window and are buying drinking water.',
    locationLabel: 'Purok 2, Gumamela (Pob.)',
    location: null,
    reporterName: 'A. Balane',
    reporterContact: '+63 918 555 0177',
    contactConsent: true,
    workflow: { status: 'acknowledged', priority: 'high' },
  },
  {
    category: 'health_and_sanitation',
    barangayPsgc: KALAMUNDING_POB,
    subject: 'Request for a barangay-wide dengue fogging schedule',
    details:
      'There have been four suspected dengue cases in the purok in two weeks. Residents are asking the RHU and the barangay for a fogging schedule and for larvicide in the open containers.',
    locationLabel: 'Purok 4, Kalamunding (Pob.)',
    location: null,
    workflow: { status: 'resolved', resolutionNote: 'Fogging completed and larvicide distributed.' },
  },
  {
    category: 'social_welfare_manide',
    barangayPsgc: PINYA_POB,
    subject: 'Manide families need help with school supplies',
    details:
      'Eight Manide children enrolled this year without notebooks or bags. The parents are seasonal farm workers and asked whether the MSWDO or NCIP can assist before the second quarter.',
    locationLabel: 'Sitio, Pinya (Pob.)',
    location: null,
    reporterName: null,
    reporterContact: null,
    workflow: { status: 'received', priority: 'normal' },
  },
];
