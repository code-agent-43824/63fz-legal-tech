import assert from "node:assert/strict";
import test from "node:test";
import type { ReaderChangeHistoryEntry, ReaderData, ReaderFragment } from "../src/lib/law-data";
import {
  buildChangeHref,
  buildReaderHref,
  buildReaderView,
  buildSearchResultHref,
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
