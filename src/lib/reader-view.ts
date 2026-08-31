// Narrows a cached reader snapshot down to what one request actually displays.
//
// Every input that decides what the reader shows already lives in the URL: the view mode, the
// selected node, the search query, and the change-history filters. Before this module those
// parameters were read in the browser, which meant the server serialized the whole law into the
// page as hydration props and the client filtered it a second time. The predicates below used to
// live in `law-reader.tsx`; they are unchanged in behaviour, they just run on the server now.
//
// `getReaderData()` stays the cached full-snapshot loader, so the database work is still done once
// per version. This layer is pure and cheap: it only decides which of those fragments to send.

import { withBasePath } from "@/lib/base-path";
import type { ReaderData, ReaderFragment, ReaderTocItem } from "@/lib/law-data";
import { buildReaderSearchResults, type ReaderSearchResult } from "@/lib/reader-search";

export type ReaderViewMode = "feed" | "focus";

export type ChangeFilters = {
  article: string;
  fromVersionId: string;
  source: string;
  status: string;
  toVersionId: string;
  type: string;
};

export type ReaderQuery = {
  mode: ReaderViewMode;
  node: string | null;
  search: string;
  selectedChangeId: string;
  filters: ChangeFilters;
  /**
   * Feed page. A number is 1-based; "all" renders the whole law in one document; `{ of }` asks for
   * whichever page holds that fragment, which is how table-of-contents navigation crosses pages
   * without the browser needing to know how the law is paged.
   */
  page: ReaderPageRequest;
};

export type ReaderPageRequest = number | "all" | { of: string };

/**
 * How many fragments a feed page aims to hold. Pages only break between articles, so a page can
 * overshoot: article 13 alone is 32 fragments. The budget keeps a page around a tenth of the law
 * instead of all of it, without ever splitting an article across two pages.
 */
const PAGE_FRAGMENT_BUDGET = 60;

export type ReaderPagination = {
  page: number;
  pageCount: number;
  /** True when the reader asked for the whole law in one page. */
  showingAll: boolean;
  totalFragments: number;
};

/** What the client component receives: the same snapshot minus the fragments it never renders. */
export type ReaderView = Omit<ReaderData, "fragments"> & {
  fragments: ReaderFragment[];
  searchResults: ReaderSearchResult[];
  mode: ReaderViewMode;
  selectedStableId: string | null;
  selectedChangeId: string;
  filters: ChangeFilters;
  hasChangeFilters: boolean;
  pagination: ReaderPagination | null;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseReaderQuery(params: RawSearchParams): ReaderQuery {
  return {
    mode: readParam(params, "mode") === "focus" ? "focus" : "feed",
    node: readParam(params, "node") || null,
    search: readParam(params, "q"),
    selectedChangeId: readParam(params, "change"),
    page: parsePage(readParam(params, "page")),
    filters: {
      article: readParam(params, "changeArticle"),
      fromVersionId: readParam(params, "changeFrom"),
      source: readParam(params, "changeSource"),
      status: readParam(params, "changeStatus"),
      toVersionId: readParam(params, "changeTo"),
      type: readParam(params, "changeType"),
    },
  };
}

export function buildReaderView(readerData: ReaderData, query: ReaderQuery): ReaderView {
  const selectedStableId = query.node ?? getDefaultNodeStableId(readerData.toc);
  const visibleFragments = selectVisibleFragments(readerData, selectedStableId, query.mode);
  const filtered = filterFragmentsByChangeFilters(
    visibleFragments,
    query.filters,
    query.selectedChangeId,
  );
  // Only the unfiltered feed is paginated. A focused node is already narrow, and a filtered view is
  // a deliberately short answer to a question — splitting either one would hide results.
  const paginate =
    query.mode === "feed" && !hasActiveChangeFilters(query.filters, query.selectedChangeId);
  const { fragments, pagination } = paginate
    ? paginateFragments(filtered, query.page)
    : { fragments: filtered, pagination: null };

  return {
    isDemo: readerData.isDemo,
    versions: readerData.versions,
    selectedVersionId: readerData.selectedVersionId,
    currentVersionId: readerData.currentVersionId,
    selectedVersionLabel: readerData.selectedVersionLabel,
    toc: readerData.toc,
    changeSummary: readerData.changeSummary,
    fragments,
    // Search deliberately runs over the whole snapshot, not the narrowed view: a reader searching
    // while focused on one article still expects hits from the rest of the law.
    searchResults: buildReaderSearchResults(readerData, query.search),
    mode: query.mode,
    selectedStableId,
    selectedChangeId: query.selectedChangeId,
    filters: query.filters,
    hasChangeFilters: hasActiveChangeFilters(query.filters, query.selectedChangeId),
    pagination,
  };
}

/** Splits the feed into pages that never cut an article in half. */
export function buildFeedPages(fragments: ReaderFragment[]): ReaderFragment[][] {
  const pages: ReaderFragment[][] = [];
  let current: ReaderFragment[] = [];
  let currentArticle: string | null = null;

  for (const fragment of fragments) {
    const article = getArticleKey(fragment.stableId);
    const startsArticle = currentArticle !== null && article !== currentArticle;
    if (startsArticle && current.length >= PAGE_FRAGMENT_BUDGET) {
      pages.push(current);
      current = [];
    }
    current.push(fragment);
    currentArticle = article;
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return pages.length > 0 ? pages : [[]];
}

function paginateFragments(fragments: ReaderFragment[], requested: ReaderPageRequest) {
  const pages = buildFeedPages(fragments);

  if (typeof requested === "object") {
    const page = findPageIndex(pages, requested.of);
    return {
      fragments: pages[page - 1] ?? [],
      pagination: {
        page,
        pageCount: pages.length,
        showingAll: false,
        totalFragments: fragments.length,
      },
    };
  }

  if (requested === "all") {
    return {
      fragments,
      pagination: {
        page: 1,
        pageCount: pages.length,
        showingAll: true,
        totalFragments: fragments.length,
      },
    };
  }

  const page = Math.min(Math.max(requested, 1), pages.length);
  return {
    fragments: pages[page - 1] ?? [],
    pagination: {
      page,
      pageCount: pages.length,
      showingAll: false,
      totalFragments: fragments.length,
    },
  };
}

/** Which feed page a fragment lives on, so navigation can jump straight to it. */
export function findFeedPageOf(fragments: ReaderFragment[], stableId: string): number {
  return findPageIndex(buildFeedPages(fragments), stableId);
}

function findPageIndex(pages: ReaderFragment[][], stableId: string): number {
  for (let index = 0; index < pages.length; index += 1) {
    const hit = pages[index].some(
      (fragment) => fragment.stableId === stableId || isSameOrDescendant(fragment, stableId),
    );
    if (hit) {
      return index + 1;
    }
  }
  return 1;
}

/**
 * The article a fragment belongs to, as the first two segments of its stable id.
 *
 * The importer does not always emit a fragment for the article heading itself — in the current
 * 63-FZ text every fragment is a part, point, or paragraph — so a page break has to be detected
 * from the article prefix changing rather than from meeting an article-level fragment.
 */
function getArticleKey(stableId: string) {
  return stableId.split(".").slice(0, 2).join(".");
}

function parsePage(raw: string): ReaderPageRequest {
  if (raw === "all") {
    return "all";
  }
  if (raw.startsWith("of:")) {
    const stableId = raw.slice(3).trim();
    return stableId ? { of: stableId } : 1;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function selectVisibleFragments(
  readerData: ReaderData,
  selectedStableId: string | null,
  mode: ReaderViewMode,
) {
  if (mode === "feed" || !selectedStableId) {
    return readerData.fragments;
  }

  // Selecting the document root means "the whole law", the same as feed mode. This used to be a
  // hardcoded `63fz.document` comparison; deriving it from the node type keeps the behaviour and
  // drops the literal id.
  const selectedItem = readerData.toc.find((item) => item.stableId === selectedStableId);
  if (selectedItem?.type === "law") {
    return readerData.fragments;
  }

  return readerData.fragments.filter((fragment) =>
    isSameOrDescendant(fragment, selectedStableId),
  );
}

export function getDefaultNodeStableId(toc: ReaderTocItem[]) {
  // Mirrors how the client builds its tree: a node is a root when it has no parent, or when its
  // parent is not part of the table of contents at all (an orphan is shown at the top level).
  const present = new Set(toc.map((item) => item.stableId));
  const roots = toc.filter(
    (item) => !item.parentStableId || !present.has(item.parentStableId),
  );
  const documentNode = roots.find((item) => item.type === "law") ?? roots[0];
  return documentNode?.stableId ?? null;
}

export function isSameOrDescendant(fragment: ReaderFragment, stableId: string) {
  return fragment.stableId === stableId || fragment.stableId.startsWith(`${stableId}.`);
}

export function filterFragmentsByChangeFilters(
  fragments: ReaderFragment[],
  filters: ChangeFilters,
  selectedChangeId: string,
) {
  if (!hasActiveChangeFilters(filters, selectedChangeId)) {
    return fragments;
  }

  return fragments
    .map((fragment) => ({
      ...fragment,
      changeHistory: fragment.changeHistory.filter((entry) =>
        matchesChangeFilters(fragment, entry, filters, selectedChangeId),
      ),
      blocks: selectedChangeId || hasNonArticleChangeFilters(filters) ? [] : fragment.blocks,
    }))
    .filter((fragment) => fragment.changeHistory.length > 0);
}

function matchesChangeFilters(
  fragment: ReaderFragment,
  entry: ReaderFragment["changeHistory"][number],
  filters: ChangeFilters,
  selectedChangeId: string,
) {
  if (selectedChangeId && entry.changeId !== selectedChangeId) {
    return false;
  }

  if (filters.article && getArticleNumber(fragment.stableId) !== filters.article) {
    return false;
  }

  if (filters.fromVersionId && entry.fromVersionId !== filters.fromVersionId) {
    return false;
  }

  if (filters.toVersionId && entry.toVersionId !== filters.toVersionId) {
    return false;
  }

  if (
    (filters.type === "changed" ||
      filters.type === "introduced" ||
      filters.type === "deleted") &&
    entry.status !== filters.type
  ) {
    return false;
  }

  if (filters.status === "missing" && entry.hasPublishedExplanation) {
    return false;
  }

  if (filters.status === "published" && !entry.hasPublishedExplanation) {
    return false;
  }

  if (filters.source === "with" && entry.sourceLinks.length === 0) {
    return false;
  }

  if (filters.source === "without" && entry.sourceLinks.length > 0) {
    return false;
  }

  return true;
}

export function hasActiveChangeFilters(filters: ChangeFilters, selectedChangeId: string) {
  return Boolean(
    selectedChangeId ||
      filters.article ||
      filters.fromVersionId ||
      filters.source ||
      filters.status ||
      filters.toVersionId ||
      filters.type,
  );
}

function hasNonArticleChangeFilters(filters: ChangeFilters) {
  return Boolean(
    filters.fromVersionId ||
      filters.source ||
      filters.status ||
      filters.toVersionId ||
      filters.type,
  );
}

export function changeFilterQueryName(name: keyof ChangeFilters) {
  const names: Record<keyof ChangeFilters, string> = {
    article: "changeArticle",
    fromVersionId: "changeFrom",
    source: "changeSource",
    status: "changeStatus",
    toVersionId: "changeTo",
    type: "changeType",
  };
  return names[name];
}

function getArticleNumber(stableId: string) {
  const match = stableId.match(/^63fz\.article_(\d+(?:_\d+)?)(?:\.|$)/);
  return match?.[1].replace("_", ".") ?? "";
}

function readParam(params: RawSearchParams, name: string) {
  const value = params[name];
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

/**
 * Builds an in-app reader link.
 *
 * These are plain `<a href>` values. Unlike `router.replace()`, Next does not prepend the
 * configured base path to them, and `usePathname()` returns the path without it — so a naive
 * `${pathname}?${query}` sends the reader out of the application entirely.
 *
 * The rule cuts both ways, so keep them apart: a raw `<a href>` needs the base path added here,
 * while `router.push()` / `router.replace()` must be given the bare pathname or the base path
 * ends up doubled (`/63fz/63fz?...`).
 */
export function buildReaderHref(
  pathname: string,
  params: URLSearchParams,
  hash: string,
): string {
  const query = params.toString();
  const base = withBasePath(pathname);
  return `${base}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

export function buildChangeHref(
  pathname: string,
  currentParams: URLSearchParams,
  stableId: string,
  changeId: string,
): string {
  const params = new URLSearchParams(currentParams.toString());
  params.set("mode", "focus");
  params.set("node", stableId);
  params.set("change", changeId);
  return buildReaderHref(pathname, params, `change-${changeId}`);
}

export function buildSearchResultHref(
  pathname: string,
  currentParams: URLSearchParams,
  stableId: string,
  fragmentAnchor: string,
): string {
  const params = new URLSearchParams(currentParams.toString());
  params.set("mode", "focus");
  params.set("node", stableId);
  return buildReaderHref(pathname, params, fragmentAnchor);
}
