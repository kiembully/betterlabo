/**
 * Aggregate counts for the public transparency page and the console dashboard.
 *
 * Everything here is computed by the database (`countDocuments` + `aggregate`),
 * never by loading reports into memory — the public endpoint is unauthenticated,
 * so it must stay cheap no matter how large the collection grows. No field that
 * could identify a reporter is touched.
 */
import type { ReportCategory, ReportStats, ReportStatus } from '@betterlabo/shared';
import { ReportModel } from '../models/report.js';

/** Statuses that still need someone to act. */
export const OPEN_STATUSES: ReportStatus[] = ['received', 'acknowledged', 'in_progress'];

/** Statuses that are finished from the citizen's point of view. */
export const RESOLVED_STATUSES: ReportStatus[] = ['resolved', 'closed'];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface StatusGroup {
  _id: ReportStatus;
  count: number;
}

interface CategoryGroup {
  _id: ReportCategory;
  count: number;
}

interface BarangayGroup {
  _id: { psgc: string; name: string };
  count: number;
}

function byCountDesc<T extends { count: number }>(a: T, b: T): number {
  return b.count - a.count;
}

export async function computeReportStats(now: Date = new Date()): Promise<ReportStats> {
  const since = new Date(now.getTime() - THIRTY_DAYS_MS);

  const [total, open, resolved, last30Days, statusGroups, categoryGroups, barangayGroups] =
    await Promise.all([
      ReportModel.countDocuments({}).exec(),
      ReportModel.countDocuments({ status: { $in: OPEN_STATUSES } }).exec(),
      ReportModel.countDocuments({ status: { $in: RESOLVED_STATUSES } }).exec(),
      ReportModel.countDocuments({ createdAt: { $gte: since } }).exec(),
      ReportModel.aggregate<StatusGroup>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]).exec(),
      ReportModel.aggregate<CategoryGroup>([
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]).exec(),
      ReportModel.aggregate<BarangayGroup>([
        { $group: { _id: { psgc: '$barangayPsgc', name: '$barangayName' }, count: { $sum: 1 } } },
        { $sort: { count: -1, '_id.name': 1 } },
        { $limit: 100 },
      ]).exec(),
    ]);

  return {
    total,
    open,
    resolved,
    last30Days,
    byStatus: statusGroups
      .map((group) => ({ status: group._id, count: group.count }))
      .sort(byCountDesc),
    byCategory: categoryGroups
      .map((group) => ({ category: group._id, count: group.count }))
      .sort(byCountDesc),
    byBarangay: barangayGroups.map((group) => ({
      barangayPsgc: group._id.psgc,
      barangayName: group._id.name,
      count: group.count,
    })),
  };
}
