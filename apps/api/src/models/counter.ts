/**
 * Atomic per-year sequence counter.
 *
 * One document per sequence key (`report:2026`), incremented with `$inc` in a
 * single `findByIdAndUpdate`, so the reservation is atomic on the server and
 * needs no transaction.
 */
import mongoose from 'mongoose';
import type { Model } from 'mongoose';

export interface CounterAttrs {
  _id: string;
  seq: number;
}

const counterSchema = new mongoose.Schema<CounterAttrs>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false, collection: 'counters' },
);

export const CounterModel: Model<CounterAttrs> =
  (mongoose.models['Counter'] as Model<CounterAttrs> | undefined) ??
  mongoose.model<CounterAttrs>('Counter', counterSchema);

/** Reserves the next value in the named sequence. */
export async function nextSequence(key: string): Promise<number> {
  const doc = await CounterModel.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  ).exec();
  return doc?.seq ?? 1;
}
