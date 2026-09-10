import { z } from "zod";

const date = z.iso.date();
const weight = z.number().positive().max(1500).nullable();

export const historicalContextSchema = z.object({
  anchor: z
    .object({
      date,
      bodyFatLow: z.number().min(0).max(100),
      bodyFatHigh: z.number().min(0).max(100),
      note: z.string().max(1000),
    })
    .refine((anchor) => anchor.bodyFatLow <= anchor.bodyFatHigh),
  strength: z
    .array(
      z.object({
        date,
        lift: z.string().max(100),
        value: z.number().positive().max(3000),
      }),
    )
    .max(15000),
});

export type HistoricalContext = z.infer<typeof historicalContextSchema>;

export const weightLogSchema = z.object({
  version: z.literal(1),
  importedAt: z.string(),
  sourceModifiedAt: z.string(),
  historicalContext: historicalContextSchema.optional(),
  setPoints: z
    .array(
      z.object({ label: z.string(), weight: z.number().positive().max(1500) }),
    )
    .max(20)
    .default([]),
  phases: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        kind: z.enum(["bulk", "cut", "maintenance", "other"]),
        start: date,
        end: date,
      }),
    )
    .max(500),
  weeks: z
    .array(
      z.object({
        date,
        phaseId: z.string(),
        weights: z.array(weight).length(7),
        averageDays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        target: weight,
        originalTarget: weight,
      }),
    )
    .max(10000),
  scans: z
    .array(
      z.object({
        date,
        weight: z.number().positive(),
        leanMass: weight,
        fatMass: weight,
        bodyFatPercent: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(2000),
});

export type WeightLog = z.infer<typeof weightLogSchema>;
