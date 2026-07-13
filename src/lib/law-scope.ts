export const PUBLIC_LAW_SLUG = "63fz";

export const PUBLIC_VERSION_STATUSES = ["published", "archived"] as const;

export type PublicVersionStatus = (typeof PUBLIC_VERSION_STATUSES)[number];

export function isPublicVersionStatus(status: string): status is PublicVersionStatus {
  return PUBLIC_VERSION_STATUSES.includes(status as PublicVersionStatus);
}

