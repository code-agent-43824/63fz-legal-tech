const DEFAULT_BASE_PATH = "/63fz";
const BASE_PATH_PATTERN = /^\/[a-z0-9/_-]*$/i;

export function normalizeBasePath(configured: string | null | undefined) {
  if (configured === undefined || configured === null) {
    return DEFAULT_BASE_PATH;
  }

  const trimmed = configured.trim();
  if (trimmed === "" || trimmed === "/") {
    return "";
  }

  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash = prefixed.replace(/\/+$/, "");
  if (!BASE_PATH_PATTERN.test(withoutTrailingSlash) || withoutTrailingSlash.includes("//")) {
    return DEFAULT_BASE_PATH;
  }

  return withoutTrailingSlash;
}

export function getBasePath() {
  return normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
}

export function withBasePath(path: string) {
  const basePath = getBasePath();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (suffix === "/") {
    return basePath || "/";
  }
  return `${basePath}${suffix}`;
}

export function getCookieBasePath() {
  return getBasePath() || "/";
}
