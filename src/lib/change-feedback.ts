import { getTransitionChangeType, type TransitionChangeType } from "@/lib/change-history";

export const FEEDBACK_KINDS = ["useful", "unclear", "error"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export type FeedbackValidationVersion = {
  createdAt: Date | string;
  effectiveDate: Date | string | null;
  id: string;
  lawId: string;
  status: string;
};

export type FeedbackValidationFragment = {
  lawVersionId: string;
  stableId: string;
  text: string;
};

export type FeedbackValidationInput = {
  fragments: FeedbackValidationFragment[];
  fromVersion: FeedbackValidationVersion | null;
  kind: string;
  publicVersions: FeedbackValidationVersion[];
  stableId: string;
  toVersion: FeedbackValidationVersion | null;
};

export type FeedbackValidationResult =
  | { ok: true; changeType: TransitionChangeType }
  | { ok: false; reason: string };

export function validateChangeFeedbackTransition(
  input: FeedbackValidationInput,
): FeedbackValidationResult {
  if (!isFeedbackKind(input.kind)) {
    return { ok: false, reason: "unsupported-feedback-kind" };
  }

  const { fromVersion, toVersion } = input;
  if (!fromVersion || !toVersion) {
    return { ok: false, reason: "missing-version" };
  }

  if (fromVersion.lawId !== toVersion.lawId) {
    return { ok: false, reason: "cross-law-transition" };
  }

  if (!isPublicVersionStatus(fromVersion.status) || !isPublicVersionStatus(toVersion.status)) {
    return { ok: false, reason: "non-public-version" };
  }

  if (!isAdjacentPublicTransition(input.publicVersions, fromVersion, toVersion)) {
    return { ok: false, reason: "non-adjacent-transition" };
  }

  const previousFragment =
    input.fragments.find(
      (fragment) =>
        fragment.lawVersionId === fromVersion.id && fragment.stableId === input.stableId,
    ) ?? null;
  const nextFragment =
    input.fragments.find(
      (fragment) => fragment.lawVersionId === toVersion.id && fragment.stableId === input.stableId,
    ) ?? null;

  if (!previousFragment && !nextFragment) {
    return { ok: false, reason: "unknown-stable-id" };
  }

  const changeType = getTransitionChangeType(previousFragment, nextFragment);
  if (!changeType) {
    return { ok: false, reason: "unchanged-fragment" };
  }

  return { ok: true, changeType };
}

export function isFeedbackKind(value: string): value is FeedbackKind {
  return FEEDBACK_KINDS.includes(value as FeedbackKind);
}

export function createBoundedFeedbackRateLimiter({
  limit,
  maxBuckets,
  windowMs,
}: {
  limit: number;
  maxBuckets: number;
  windowMs: number;
}) {
  const buckets = new Map<string, number[]>();

  return {
    enforce(clientKey: string, now = Date.now()) {
      pruneBuckets(buckets, now, windowMs, maxBuckets - 1);
      const recent = (buckets.get(clientKey) ?? []).filter(
        (timestamp) => now - timestamp < windowMs,
      );
      if (recent.length >= limit) {
        return false;
      }

      recent.push(now);
      buckets.delete(clientKey);
      buckets.set(clientKey, recent);
      pruneBuckets(buckets, now, windowMs, maxBuckets);
      return true;
    },
    state() {
      return {
        buckets: buckets.size,
        keys: Array.from(buckets.keys()),
      };
    },
  };
}

function isPublicVersionStatus(status: string) {
  return status === "published" || status === "archived";
}

function isAdjacentPublicTransition(
  publicVersions: FeedbackValidationVersion[],
  fromVersion: FeedbackValidationVersion,
  toVersion: FeedbackValidationVersion,
) {
  const sameLawVersions = publicVersions
    .filter((version) => version.lawId === fromVersion.lawId && isPublicVersionStatus(version.status))
    .sort(compareVersionsAscending);
  const fromIndex = sameLawVersions.findIndex((version) => version.id === fromVersion.id);

  return fromIndex >= 0 && sameLawVersions[fromIndex + 1]?.id === toVersion.id;
}

function compareVersionsAscending(
  left: Pick<FeedbackValidationVersion, "createdAt" | "effectiveDate" | "id">,
  right: Pick<FeedbackValidationVersion, "createdAt" | "effectiveDate" | "id">,
) {
  const leftTime = getDateTime(left.effectiveDate) ?? 0;
  const rightTime = getDateTime(right.effectiveDate) ?? 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
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

function pruneBuckets(
  buckets: Map<string, number[]>,
  now: number,
  windowMs: number,
  maxBuckets: number,
) {
  for (const [key, timestamps] of buckets) {
    const recent = timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (recent.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, recent);
    }
  }

  while (buckets.size > maxBuckets) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) {
      break;
    }
    buckets.delete(oldestKey);
  }
}
