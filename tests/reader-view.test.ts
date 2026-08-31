import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ReaderChangeHistoryEntry, ReaderData, ReaderFragment } from "../src/lib/law-data";
import {
  buildChangeHref,
  buildReaderHref,
  buildReaderView,
  buildSearchResultHref,
  findFeedPageOf,
  getDefaultNodeStableId,
  parseReaderQuery,
} from "../src/lib/reader-view";

function makeEntry(overrides: Partial<ReaderChangeHistoryEntry> = {}): ReaderChangeHistoryEntry {
  return {
    changeId: "change-1",
    status: "changed",
    stableId: "63fz.article_13",
    fromVersionId: "v1",
    toVersionId: "v2",
    versionId: "v2",
    versionLabel: "Редакция 2",
    previousVersionLabel: "Редакция 1",
    beforeSnippet: null,
    afterSnippet: null,
    beforeSegments: [],
    afterSegments: [],
    hasPublishedExplanation: false,
    reason: "Причина",
    purpose: "Цель",
    practicalMeaning: "Смысл",
    sourceLinks: [],
    ...overrides,
  };
}

function makeFragment(
  stableId: string,
  overrides: Partial<ReaderFragment> = {},
): ReaderFragment {
  return {
    id: stableId,
    stableId,
    parentStableId: null,
    type: "article",
    title: stableId,
    text: `Текст ${stableId}`,
    changeStatus: "current",
    commentarySource: "selected",
    changeHistory: [],
    blocks: [],
    references: [],
    ...overrides,
  };
}

function makeReaderData(): ReaderData {
  return {
    isDemo: false,
    versions: [],
    selectedVersionId: "v2",
    currentVersionId: "v2",
    selectedVersionLabel: "Редакция 2",
    toc: [
      { id: "63fz.document", stableId: "63fz.document", parentStableId: null, title: "Закон", type: "law" },
      { id: "63fz.article_13", stableId: "63fz.article_13", parentStableId: "63fz.document", title: "Статья 13", type: "article" },
      { id: "63fz.article_13.part_1", stableId: "63fz.article_13.part_1", parentStableId: "63fz.article_13", title: "Часть 1", type: "part" },
      { id: "63fz.article_18", stableId: "63fz.article_18", parentStableId: "63fz.document", title: "Статья 18", type: "article" },
    ],
    fragments: [
      makeFragment("63fz.document", { type: "law" }),
      makeFragment("63fz.article_13", {
        changeHistory: [makeEntry({ changeId: "c13", stableId: "63fz.article_13" })],
      }),
      makeFragment("63fz.article_13.part_1", { type: "part", parentStableId: "63fz.article_13" }),
      makeFragment("63fz.article_18", {
        text: "Текст про нотариальную доверенность",
        changeHistory: [
          makeEntry({
            changeId: "c18",
            stableId: "63fz.article_18",
            status: "introduced",
            hasPublishedExplanation: true,
          }),
        ],
      }),
    ],
    changeSummary: { introduced: 1, unchanged: 2, changed: 1, deleted: 0 },
  };
}

const EMPTY_FILTERS = {
  article: "",
  fromVersionId: "",
  source: "",
  status: "",
  toVersionId: "",
  type: "",
};

test("parseReaderQuery defaults to feed mode with no filters", () => {
  const query = parseReaderQuery({});

  assert.equal(query.mode, "feed");
  assert.equal(query.node, null);
  assert.equal(query.search, "");
  assert.equal(query.selectedChangeId, "");
  assert.deepEqual(query.filters, EMPTY_FILTERS);
});

test("parseReaderQuery reads focus mode, node, search and change filters", () => {
  const query = parseReaderQuery({
    mode: "focus",
    node: "63fz.article_13",
    q: "подпись",
    change: "c13",
    changeArticle: "13",
    changeType: "changed",
  });

  assert.equal(query.mode, "focus");
  assert.equal(query.node, "63fz.article_13");
  assert.equal(query.search, "подпись");
  assert.equal(query.selectedChangeId, "c13");
  assert.equal(query.filters.article, "13");
  assert.equal(query.filters.type, "changed");
});

test("parseReaderQuery takes the first value of a repeated parameter", () => {
  const query = parseReaderQuery({ mode: ["focus", "feed"], node: ["63fz.article_18"] });

  assert.equal(query.mode, "focus");
  assert.equal(query.node, "63fz.article_18");
});

test("feed mode sends every fragment", () => {
  const view = buildReaderView(makeReaderData(), parseReaderQuery({}));

  assert.equal(view.fragments.length, 4);
  assert.equal(view.mode, "feed");
  assert.equal(view.hasChangeFilters, false);
});

test("focus mode sends only the selected node and its descendants", () => {
  const view = buildReaderView(
    makeReaderData(),
    parseReaderQuery({ mode: "focus", node: "63fz.article_13" }),
  );

  assert.deepEqual(
    view.fragments.map((fragment) => fragment.stableId),
    ["63fz.article_13", "63fz.article_13.part_1"],
    "article 18 and the document root must not be sent",
  );
  assert.equal(view.selectedStableId, "63fz.article_13");
});

test("focusing the document root still shows the whole law", () => {
  const view = buildReaderView(
    makeReaderData(),
    parseReaderQuery({ mode: "focus", node: "63fz.document" }),
  );

  assert.equal(view.fragments.length, 4);
});

test("a leaf node sends just itself", () => {
  const view = buildReaderView(
    makeReaderData(),
    parseReaderQuery({ mode: "focus", node: "63fz.article_13.part_1" }),
  );

  assert.deepEqual(
    view.fragments.map((fragment) => fragment.stableId),
    ["63fz.article_13.part_1"],
  );
});

test("change filters narrow the fragments and report themselves as active", () => {
  const view = buildReaderView(makeReaderData(), parseReaderQuery({ changeType: "introduced" }));

  assert.equal(view.hasChangeFilters, true);
  assert.deepEqual(
    view.fragments.map((fragment) => fragment.stableId),
    ["63fz.article_18"],
  );
});

test("a change permalink narrows to that single transition", () => {
  const view = buildReaderView(
    makeReaderData(),
    parseReaderQuery({ mode: "focus", node: "63fz.article_18", change: "c18" }),
  );

  assert.equal(view.fragments.length, 1);
  assert.deepEqual(
    view.fragments[0].changeHistory.map((entry) => entry.changeId),
    ["c18"],
  );
  assert.equal(view.selectedChangeId, "c18");
});

test("the published/missing explanation filter is applied server-side", () => {
  const data = makeReaderData();

  assert.deepEqual(
    buildReaderView(data, parseReaderQuery({ changeStatus: "published" })).fragments.map(
      (fragment) => fragment.stableId,
    ),
    ["63fz.article_18"],
  );
  assert.deepEqual(
    buildReaderView(data, parseReaderQuery({ changeStatus: "missing" })).fragments.map(
      (fragment) => fragment.stableId,
    ),
    ["63fz.article_13"],
  );
});

test("search runs over the whole law even while focused on one article", () => {
  const view = buildReaderView(
    makeReaderData(),
    parseReaderQuery({ mode: "focus", node: "63fz.article_13", q: "нотариальную" }),
  );

  assert.equal(view.fragments.length, 2, "the focused view stays narrow");
  assert.ok(
    view.searchResults.some((result) => result.stableId === "63fz.article_18"),
    "but a hit outside the focused node is still findable",
  );
});

test("a short query returns no search results", () => {
  const view = buildReaderView(makeReaderData(), parseReaderQuery({ q: "п" }));

  assert.deepEqual(view.searchResults, []);
});

test("the table of contents and version data are passed through untouched", () => {
  const data = makeReaderData();
  const view = buildReaderView(data, parseReaderQuery({ mode: "focus", node: "63fz.article_13" }));

  assert.equal(view.toc.length, data.toc.length, "the tree still needs every node");
  assert.equal(view.selectedVersionId, data.selectedVersionId);
  assert.deepEqual(view.changeSummary, data.changeSummary);
});

test("the default node is the law root when there is one", () => {
  assert.equal(getDefaultNodeStableId(makeReaderData().toc), "63fz.document");
});

test("without a law root, the first top-level node wins, orphans included", () => {
  const toc = [
    { id: "a1", stableId: "63fz.article_1", parentStableId: null, title: "Статья 1", type: "article" },
    // Parent is absent from the table of contents, so this behaves as a top-level node.
    { id: "a2p1", stableId: "63fz.article_2.part_1", parentStableId: "63fz.article_2", title: "Часть 1", type: "part" },
  ];

  assert.equal(getDefaultNodeStableId(toc), "63fz.article_1");
});

test("an empty table of contents has no default node", () => {
  assert.equal(getDefaultNodeStableId([]), null);
});

// Regression: these are plain <a href> values. `usePathname()` returns the path without the
// configured base path and Next does not prepend it to raw links, so building them from the bare
// pathname sent readers to the site root instead of into the reader — reproduced on production
// 2026-08-31, where all 93 search and permalink hrefs on a search page pointed outside the app.
test("search result links keep the base path", () => {
  const href = buildSearchResultHref(
    "/",
    new URLSearchParams("q=подпись"),
    "63fz.article_2.point_1",
    "63fz.article_2.point_1",
  );

  assert.ok(href.startsWith("/63fz?"), `link must stay inside the app, got: ${href}`);
  assert.match(href, /mode=focus/);
  assert.match(href, /node=63fz\.article_2\.point_1/);
  assert.ok(href.endsWith("#63fz.article_2.point_1"));
});

test("change permalinks keep the base path", () => {
  const href = buildChangeHref("/", new URLSearchParams(), "63fz.article_18", "c18");

  assert.ok(href.startsWith("/63fz?"), `link must stay inside the app, got: ${href}`);
  assert.ok(href.endsWith("#change-c18"));
});

test("reader links preserve existing query parameters", () => {
  const href = buildChangeHref(
    "/",
    new URLSearchParams("version=v1&q=подпись"),
    "63fz.article_18",
    "c18",
  );

  assert.match(href, /version=v1/, "the selected version must survive the jump");
  assert.match(href, /q=/, "an active search must survive the jump");
});

test("a link with no query and no hash is still base-path prefixed", () => {
  assert.equal(buildReaderHref("/", new URLSearchParams(), ""), "/63fz");
});

// --- Feed pagination (point 21, step 2) ---

function makeWideReaderData(articleCount: number, partsPerArticle: number): ReaderData {
  const toc: ReaderData["toc"] = [
    { id: "63fz.document", stableId: "63fz.document", parentStableId: null, title: "Закон", type: "law" },
  ];
  const fragments: ReaderFragment[] = [makeFragment("63fz.document", { type: "law" })];

  for (let a = 1; a <= articleCount; a += 1) {
    const article = `63fz.article_${a}`;
    toc.push({ id: article, stableId: article, parentStableId: "63fz.document", title: `Статья ${a}`, type: "article" });
    fragments.push(makeFragment(article));
    for (let p = 1; p <= partsPerArticle; p += 1) {
      const part = `${article}.part_${p}`;
      toc.push({ id: part, stableId: part, parentStableId: article, title: `Часть ${p}`, type: "part" });
      fragments.push(makeFragment(part, { type: "part", parentStableId: article }));
    }
  }

  return {
    isDemo: false,
    versions: [],
    selectedVersionId: "v1",
    currentVersionId: "v1",
    selectedVersionLabel: "Редакция",
    toc,
    fragments,
    changeSummary: { introduced: 0, unchanged: 0, changed: 0, deleted: 0 },
  };
}

test("a short law is not paginated at all", () => {
  const view = buildReaderView(makeReaderData(), parseReaderQuery({}));

  assert.equal(view.pagination?.pageCount, 1);
  assert.equal(view.fragments.length, 4, "everything still fits on one page");
});

test("a long feed is split into pages and the first page is served by default", () => {
  const data = makeWideReaderData(30, 9); // 30 articles x 10 fragments + root = 301
  const view = buildReaderView(data, parseReaderQuery({}));

  assert.ok(view.pagination!.pageCount > 1, "the law must be split");
  assert.equal(view.pagination!.page, 1);
  assert.ok(
    view.fragments.length < data.fragments.length,
    "the first page must be shorter than the whole law",
  );
  assert.equal(view.pagination!.totalFragments, data.fragments.length);
});

test("pages never split an article across a boundary", () => {
  const data = makeWideReaderData(30, 9);
  const pageCount = buildReaderView(data, parseReaderQuery({})).pagination!.pageCount;
  const seen = new Map<string, number>();

  for (let page = 1; page <= pageCount; page += 1) {
    for (const fragment of buildReaderView(data, parseReaderQuery({ page: String(page) })).fragments) {
      const article = fragment.stableId.split(".").slice(0, 2).join(".");
      const previous = seen.get(article);
      assert.ok(
        previous === undefined || previous === page,
        `article ${article} appeared on pages ${previous} and ${page}`,
      );
      seen.set(article, page);
    }
  }
});

test("every fragment appears exactly once across all pages", () => {
  const data = makeWideReaderData(30, 9);
  const pageCount = buildReaderView(data, parseReaderQuery({})).pagination!.pageCount;
  const collected: string[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    collected.push(
      ...buildReaderView(data, parseReaderQuery({ page: String(page) })).fragments.map(
        (fragment) => fragment.stableId,
      ),
    );
  }

  assert.deepEqual(
    collected,
    data.fragments.map((fragment) => fragment.stableId),
    "paging must lose nothing and reorder nothing",
  );
});

test("page=all returns the whole law and says so", () => {
  const data = makeWideReaderData(30, 9);
  const view = buildReaderView(data, parseReaderQuery({ page: "all" }));

  assert.equal(view.fragments.length, data.fragments.length);
  assert.equal(view.pagination!.showingAll, true);
});

test("page=of:<stableId> resolves to the page holding that fragment", () => {
  const data = makeWideReaderData(30, 9);
  const target = "63fz.article_25.part_3";
  const view = buildReaderView(data, parseReaderQuery({ page: `of:${target}` }));

  assert.ok(
    view.fragments.some((fragment) => fragment.stableId === target),
    "the requested fragment must be on the served page",
  );
  assert.equal(view.pagination!.page, findFeedPageOf(data.fragments, target));
});

test("an out-of-range or malformed page falls back to a valid one", () => {
  const data = makeWideReaderData(30, 9);

  assert.equal(buildReaderView(data, parseReaderQuery({ page: "9999" })).pagination!.page,
    buildReaderView(data, parseReaderQuery({})).pagination!.pageCount);
  assert.equal(buildReaderView(data, parseReaderQuery({ page: "0" })).pagination!.page, 1);
  assert.equal(buildReaderView(data, parseReaderQuery({ page: "чепуха" })).pagination!.page, 1);
  assert.equal(buildReaderView(data, parseReaderQuery({ page: "of:" })).pagination!.page, 1);
});

test("focus mode and filtered views are never paginated", () => {
  const data = makeWideReaderData(30, 9);

  assert.equal(
    buildReaderView(data, parseReaderQuery({ mode: "focus", node: "63fz.article_25" })).pagination,
    null,
    "a focused node is already narrow",
  );
  assert.equal(
    buildReaderView(data, parseReaderQuery({ changeType: "changed" })).pagination,
    null,
    "a filtered view is a short answer and must not hide results behind paging",
  );
});

// Regression: the importer emits no fragment for an article heading itself — in the real 63-FZ
// text every fragment is a part, point, or paragraph, so ids look like `63fz.article_2.point_1`
// and never `63fz.article_2`. A first implementation looked for article-level fragments to break
// pages on, found none, and silently served the whole law on every page.
test("pages break on the article prefix even with no article-level fragments", () => {
  const fragments: ReaderFragment[] = [makeFragment("63fz.document", { type: "law" })];
  const toc: ReaderData["toc"] = [
    { id: "63fz.document", stableId: "63fz.document", parentStableId: null, title: "Закон", type: "law" },
  ];
  for (let a = 1; a <= 30; a += 1) {
    for (let p = 1; p <= 10; p += 1) {
      const id = `63fz.article_${a}.point_${p}`;
      fragments.push(makeFragment(id, { type: "point" }));
      toc.push({ id, stableId: id, parentStableId: "63fz.document", title: id, type: "point" });
    }
  }

  const data: ReaderData = {
    isDemo: false,
    versions: [],
    selectedVersionId: "v1",
    currentVersionId: "v1",
    selectedVersionLabel: "Редакция",
    toc,
    fragments,
    changeSummary: { introduced: 0, unchanged: 0, changed: 0, deleted: 0 },
  };

  const view = buildReaderView(data, parseReaderQuery({}));

  assert.ok(view.pagination!.pageCount > 1, "the law must still be split into pages");
  assert.ok(
    view.fragments.length < fragments.length,
    "a page must be shorter than the whole law",
  );
  const articles = new Set(
    view.fragments
      .filter((fragment) => fragment.stableId !== "63fz.document")
      .map((fragment) => fragment.stableId.split(".").slice(0, 2).join(".")),
  );
  assert.ok(articles.size >= 1 && articles.size < 30, "a page holds some articles, not all of them");
});

// The base path has now caused two bugs in opposite directions: a plain <a href> built from the
// bare pathname sent readers out of the app, and a router.push() given an already-prefixed href
// produced /63fz/63fz. Next adds the base path for router navigation and not for raw links, so the
// two must never share a builder. This guard keeps them apart.
test("router navigation never uses the href builders", () => {
  const source = readFileSync("src/app/law-reader.tsx", "utf8");

  for (const call of source.matchAll(/router\.(?:push|replace)\(([^\n]*)/g)) {
    assert.doesNotMatch(
      call[1],
      /buildReaderHref|buildChangeHref|buildSearchResultHref|withBasePath/,
      `router navigation must take the bare pathname, got: ${call[1].trim()}`,
    );
  }
});

test("every raw reader link goes through a base-path-aware builder", () => {
  const source = readFileSync("src/app/law-reader.tsx", "utf8");

  // `href={...}` values built from a template literal must not start from the bare pathname.
  for (const match of source.matchAll(/href=\{`([^`]*)`\}/g)) {
    assert.doesNotMatch(
      match[1],
      /^\$\{pathname\}/,
      `raw link must not be built from the bare pathname: ${match[1]}`,
    );
  }
});
