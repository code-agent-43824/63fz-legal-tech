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
};

type RawSearchParams = Record<string, string | string[] | undefined>;

export function parseReaderQuery(params: RawSearchParams): ReaderQuery {
  return {
    mode: readParam(params, "mode") === "focus" ? "focus" : "feed",
    node: readParam(params, "node") || null,
    search: readParam(params, "q"),
    selectedChangeId: readParam(params, "change"),
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
  const fragments = filterFragmentsByChangeFilters(
    visibleFragments,
    query.filters,
    query.selectedChangeId,
  );

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
  };
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

