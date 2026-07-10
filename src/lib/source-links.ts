export type SafeSourceLink = {
  href: string;
  label: string;
};

export function makeSafeSourceLink(href: string | null | undefined, label?: string | null) {
  if (!href) {
    return null;
  }

  const safeHref = normalizeHttpsUrl(href);
  if (!safeHref) {
    return null;
  }

  return {
    href: safeHref,
    label: label?.trim() || formatSourceLinkLabel(safeHref),
  };
}

export function parseSafeSourceLinks(value: string | null | undefined): SafeSourceLink[] {
  if (!value) {
    return [];
  }

  const links = new Map<string, SafeSourceLink>();
  const matches = value.match(/https:\/\/[^\s<>"')]+/gi) ?? [];

  for (const match of matches) {
    const link = makeSafeSourceLink(stripTrailingPunctuation(match));
    if (link) {
      links.set(link.href, link);
    }
  }

  return [...links.values()];
}

function normalizeHttpsUrl(value: string) {
  try {
    const parsed = new URL(stripTrailingPunctuation(value.trim()));
    if (parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[),.;:]+$/g, "");
}

function formatSourceLinkLabel(href: string) {
  const parsed = new URL(href);
  return parsed.hostname.replace(/^www\./, "");
}
