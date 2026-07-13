export type ChronologicalLawVersion = {
  createdAt: Date | string;
  effectiveDate: Date | string | null;
  id: string;
};

export const lawVersionOrderByAscending: Prisma.LawVersionOrderByWithRelationInput[] = [
  { effectiveDate: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

export const lawVersionOrderByDescending: Prisma.LawVersionOrderByWithRelationInput[] = [
  { effectiveDate: "desc" },
  { createdAt: "desc" },
  { id: "desc" },
];

export function compareLawVersionsChronologically(
  left: ChronologicalLawVersion,
  right: ChronologicalLawVersion,
) {
  const leftEffective = getDateTime(left.effectiveDate) ?? 0;
  const rightEffective = getDateTime(right.effectiveDate) ?? 0;
  if (leftEffective !== rightEffective) {
    return leftEffective - rightEffective;
  }

  const leftCreatedAt = getDateTime(left.createdAt) ?? 0;
  const rightCreatedAt = getDateTime(right.createdAt) ?? 0;
  if (leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }

  return left.id.localeCompare(right.id);
}

function getDateTime(value: Date | string | null) {
  if (!value) {
    return null;
  }

  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
import type { Prisma } from "@prisma/client";
