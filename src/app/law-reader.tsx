"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReaderData, ReaderFragment, ReaderTocItem, ReaderVersion } from "@/lib/law-data";
import {
  buildReaderSearchResults,
  type ReaderSearchResult,
} from "@/lib/reader-search";
import { submitChangeFeedback } from "@/app/feedback-actions";

type ViewMode = "feed" | "focus";
type TocNode = ReaderTocItem & { children: TocNode[] };
type ChangeFilters = {
  article: string;
  fromVersionId: string;
  source: string;
  status: string;
  toVersionId: string;
  type: string;
};

const TYPE_LABELS: Record<string, string> = {
  law: "Закон",
  article: "Статья",
  part: "Часть",
  point: "Пункт",
  paragraph: "Абзац",
};

export function LawReader({ readerData }: { readerData: ReaderData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode: ViewMode = searchParams.get("mode") === "focus" ? "focus" : "feed";
  const searchQuery = searchParams.get("q") ?? "";
  const changeFilters: ChangeFilters = useMemo(
    () => ({
      article: searchParams.get("changeArticle") ?? "",
      fromVersionId: searchParams.get("changeFrom") ?? "",
      source: searchParams.get("changeSource") ?? "",
      status: searchParams.get("changeStatus") ?? "",
      toVersionId: searchParams.get("changeTo") ?? "",
      type: searchParams.get("changeType") ?? "",
    }),
    [searchParams],
  );
  const selectedChangeId = searchParams.get("change") ?? "";
  const tree = useMemo(() => buildTree(readerData.toc), [readerData.toc]);
  const tocByStableId = useMemo(
    () => new Map(readerData.toc.map((item) => [item.stableId, item])),
    [readerData.toc],
  );
  const defaultNodeStableId = useMemo(() => getDefaultNodeStableId(tree), [tree]);
  const selectedStableId = searchParams.get("node") ?? defaultNodeStableId;
  const selectedItem = selectedStableId ? tocByStableId.get(selectedStableId) : null;
  const [expandedStableIds, setExpandedStableIds] = useState<Set<string>>(
    () => new Set(getDefaultExpandedStableIds(tree, selectedStableId)),
  );
  const [activeStableId, setActiveStableId] = useState<string | null>(selectedStableId);
  const visibleExpandedStableIds = useMemo(() => {
    const next = new Set(expandedStableIds);
    for (const stableId of getAncestorStableIds(readerData.toc, selectedStableId)) {
      next.add(stableId);
    }
    return next;
  }, [expandedStableIds, readerData.toc, selectedStableId]);
  const tocActiveStableId = mode === "focus" ? selectedStableId : activeStableId;
  const selectedVersion = useMemo(
    () => readerData.versions.find((version) => version.id === readerData.selectedVersionId) ?? null,
    [readerData.selectedVersionId, readerData.versions],
  );
  const currentVersion = useMemo(
    () => readerData.versions.find((version) => version.id === readerData.currentVersionId) ?? null,
    [readerData.currentVersionId, readerData.versions],
  );
  const searchResults = useMemo(
    () => buildReaderSearchResults(readerData, searchQuery),
    [readerData, searchQuery],
  );

  const visibleFragments = useMemo(() => {
    if (mode === "feed" || !selectedStableId || selectedStableId === "63fz.document") {
      return readerData.fragments;
    }

    return readerData.fragments.filter((fragment) => isSameOrDescendant(fragment, selectedStableId));
  }, [mode, readerData.fragments, selectedStableId]);
  const filteredFragments = useMemo(
    () => filterFragmentsByChangeFilters(visibleFragments, changeFilters, selectedChangeId),
    [changeFilters, selectedChangeId, visibleFragments],
  );
  const hasChangeFilters = hasActiveChangeFilters(changeFilters, selectedChangeId);
  const hasVisibleSupplementalContent = filteredFragments.some((fragment) =>
    hasSupplementalContent(fragment),
  );

  useEffect(() => {
    if (mode !== "feed") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        const stableId = visible?.target.getAttribute("data-stable-id");
        if (stableId) {
          setActiveStableId(stableId);
        }
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.1, 0.35] },
    );

    for (const fragment of visibleFragments) {
      const element = document.getElementById(fragment.id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [mode, selectedStableId, visibleFragments]);

  function updateMode(nextMode: ViewMode) {
    const nextNode = mode === "feed" ? (activeStableId ?? selectedStableId) : selectedStableId;
    replaceUrl(nextMode, nextMode === "focus" ? nextNode : null);
  }

  function selectNode(item: ReaderTocItem) {
    setExpandedStableIds((current) => {
      const next = new Set(current);
      next.add(item.stableId);
      for (const stableId of getAncestorStableIds(readerData.toc, item.stableId)) {
        next.add(stableId);
      }
      return next;
    });

    if (mode === "focus") {
      replaceUrl("focus", item.stableId);
      return;
    }

    const element = document.getElementById(item.id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      window.history.replaceState(null, "", `#${item.id}`);
    }
  }

  function replaceUrl(nextMode: ViewMode, nextNode: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextMode === "focus") {
      params.set("mode", "focus");
      if (nextNode) {
        params.set("node", nextNode);
      }
    } else {
      params.delete("mode");
      params.delete("node");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    const formData = new FormData(event.currentTarget);
    const nextQuery = String(formData.get("q") ?? "").trim();

    if (nextQuery) {
      params.set("q", nextQuery);
    } else {
      params.delete("q");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearSearch() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function updateChangeFilter(name: keyof ChangeFilters, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    const queryName = changeFilterQueryName(name);
    if (value) {
      params.set(queryName, value);
    } else {
      params.delete(queryName);
    }
    params.delete("change");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function clearChangeFilters() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of [
      "change",
      "changeArticle",
      "changeFrom",
      "changeSource",
      "changeStatus",
      "changeTo",
      "changeType",
    ]) {
      params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function getChangeHref(fragment: ReaderFragment, entry: ReaderFragment["changeHistory"][number]) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "focus");
    params.set("node", fragment.stableId);
    params.set("change", entry.changeId);
    const query = params.toString();
    return `${pathname}?${query}#change-${entry.changeId}`;
  }

  function getSearchResultHref(result: ReaderSearchResult) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("mode", "focus");
    params.set("node", result.stableId);
    const query = params.toString();
    return `${pathname}?${query}#${result.fragmentId}`;
  }

  function updateVersion(versionId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (versionId === readerData.currentVersionId) {
      params.delete("version");
    } else {
      params.set("version", versionId);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toggleNode(stableId: string) {
    setExpandedStableIds((current) => {
      const next = new Set(current);
      if (next.has(stableId)) {
        next.delete(stableId);
      } else {
        next.add(stableId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedStableIds(new Set(readerData.toc.map((item) => item.stableId)));
  }

  function collapseAll() {
    setExpandedStableIds(new Set(getDefaultExpandedStableIds(tree, selectedStableId)));
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="rounded-md border border-slate-200 bg-white lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto">
        <div className="border-b border-slate-200 p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="version-select">
            Редакция
          </label>
          <select
            className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
            disabled={readerData.versions.length <= 1}
            id="version-select"
            onChange={(event) => updateVersion(event.target.value)}
            value={readerData.selectedVersionId ?? ""}
          >
            {readerData.versions.length > 0 ? (
              readerData.versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                  {version.isCurrent ? " · текущая" : ""}
                </option>
              ))
            ) : (
              <option value="">Текущая редакция</option>
            )}
          </select>
          {readerData.currentVersionId &&
          readerData.selectedVersionId &&
          readerData.selectedVersionId !== readerData.currentVersionId ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px] text-slate-600 md:grid-cols-4">
              <VersionStat label="Без изменений" value={readerData.changeSummary.unchanged} />
              <VersionStat label="Изменено" value={readerData.changeSummary.changed} />
              <VersionStat label="Введено" value={readerData.changeSummary.introduced} />
              <VersionStat label="Удалено" value={readerData.changeSummary.deleted} />
            </div>
          ) : null}
        </div>

        <div className="p-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Оглавление
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Дерево закона с раскрытием до частей и пунктов.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1 text-sm">
            <button
              className={modeButtonClass(mode === "feed")}
              onClick={() => updateMode("feed")}
              type="button"
            >
              Лента
            </button>
            <button
              className={modeButtonClass(mode === "focus")}
              onClick={() => updateMode("focus")}
              type="button"
            >
              Фокус
            </button>
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={expandAll}
              type="button"
            >
              Раскрыть всё
            </button>
            <button
              className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={collapseAll}
              type="button"
            >
              Свернуть
            </button>
          </div>
        </div>

        <ReaderSearch
          onClear={clearSearch}
          onSubmit={submitSearch}
          resultHref={getSearchResultHref}
          results={searchResults}
          searchQuery={searchQuery}
        />

        <ChangeFilterPanel
          filters={changeFilters}
          hasFilters={hasChangeFilters}
          onClear={clearChangeFilters}
          onUpdate={updateChangeFilter}
          versions={readerData.versions}
        />

        <nav aria-label="Оглавление закона" className="border-t border-slate-200 p-3">
          {tree.map((node) => (
            <TocTreeNode
              activeStableId={tocActiveStableId}
              expandedStableIds={visibleExpandedStableIds}
              key={node.stableId}
              node={node}
              onSelect={selectNode}
              onToggle={toggleNode}
              selectedStableId={selectedStableId}
            />
          ))}
        </nav>
      </aside>

      <div className="min-w-0" id="law">
        <div className="mb-5 rounded-md border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {readerData.selectedVersionLabel ?? "Текущая редакция"} ·{" "}
                {mode === "focus" ? "режим фокуса" : "режим ленты"}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-950">
                {mode === "focus"
                  ? (selectedItem?.title ?? "Выбранный фрагмент")
                  : "Весь закон одной лентой"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {mode === "focus"
                  ? "Показывается выбранный узел дерева и его дочерние фрагменты."
                  : "Переходы из оглавления прокручивают длинный текст к нужному месту."}
              </p>
            </div>
            {mode === "focus" ? (
              <button
                className="h-10 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => updateMode("feed")}
                type="button"
              >
                Показать всё
              </button>
            ) : null}
          </div>
          <ReaderMetadata currentVersion={currentVersion} selectedVersion={selectedVersion} />
        </div>

        {filteredFragments.length > 0 ? (
          <>
            {!hasVisibleSupplementalContent ? (
              <div className="mb-5 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                Для выбранной области пока нет опубликованных редакционных секций.
              </div>
            ) : null}
            {hasChangeFilters ? (
              <div className="mb-5 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
                История отфильтрована: {filteredFragments.length} фрагментов в текущей области.
              </div>
            ) : null}
            <div className="space-y-5">
              {filteredFragments.map((fragment) => (
                <FragmentArticle
                  changeHref={getChangeHref}
                  fragment={fragment}
                  key={fragment.id}
                  selectedChangeId={selectedChangeId}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-8 text-sm text-slate-600">
            {hasChangeFilters
              ? "По выбранным фильтрам истории изменений ничего не найдено."
              : "В выбранном узле нет отображаемого текста. Выберите статью, часть или пункт ниже по дереву."}
          </div>
        )}
      </div>
    </section>
  );
}

function VersionStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2">
      <div className="text-sm font-semibold text-slate-950">{value}</div>
      <div>{label}</div>
    </div>
  );
}

function ReaderSearch({
  onClear,
  onSubmit,
  resultHref,
  results,
  searchQuery,
}: {
  onClear: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  resultHref: (result: ReaderSearchResult) => string;
  results: ReaderSearchResult[];
  searchQuery: string;
}) {
  const hasCommittedQuery = searchQuery.trim().length > 0;
  const hasSearchableQuery = searchQuery.trim().length >= 2;

  return (
    <section className="border-t border-slate-200 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Поиск</h2>
      <form className="mt-3 flex gap-2" onSubmit={onSubmit}>
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-900"
          defaultValue={searchQuery}
          key={searchQuery}
          name="q"
          placeholder="Текст, источник, изменение"
          type="search"
        />
        <button
          className="h-10 rounded-md bg-slate-950 px-3 text-sm font-medium text-white hover:bg-slate-800"
          type="submit"
        >
          Найти
        </button>
      </form>
      {hasCommittedQuery ? (
        <div className="mt-3">
          <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              {hasSearchableQuery
                ? `Найдено: ${results.length}`
                : "Минимум 2 символа"}
            </span>
            <button
              className="font-medium text-slate-700 underline-offset-4 hover:underline"
              onClick={onClear}
              type="button"
            >
              Сбросить
            </button>
          </div>
          {hasSearchableQuery && results.length === 0 ? (
            <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Ничего не найдено.
            </p>
          ) : null}
          {results.length > 0 ? (
            <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-1">
              {results.map((result) => (
                <a
                  className="block rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50"
                  href={resultHref(result)}
                  key={result.id}
                >
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {searchKindLabel(result.kind)} · {result.label}
                  </span>
                  <span className="mt-1 block font-medium text-slate-950">
                    {result.fragmentTitle}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-600">
                    {result.excerpt}
                  </span>
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChangeFilterPanel({
  filters,
  hasFilters,
  onClear,
  onUpdate,
  versions,
}: {
  filters: ChangeFilters;
  hasFilters: boolean;
  onClear: () => void;
  onUpdate: (name: keyof ChangeFilters, value: string) => void;
  versions: ReaderVersion[];
}) {
  return (
    <section className="border-t border-slate-200 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          История
        </h2>
        {hasFilters ? (
          <button
            className="text-xs font-medium text-slate-700 underline-offset-4 hover:underline"
            onClick={onClear}
            type="button"
          >
            Сбросить
          </button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Статья</span>
          <input
            className="h-9 rounded-md border border-slate-300 px-3"
            onChange={(event) => onUpdate("article", event.target.value.trim())}
            placeholder="18"
            value={filters.article}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Тип изменения</span>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-3"
            onChange={(event) => onUpdate("type", event.target.value)}
            value={filters.type}
          >
            <option value="">Все</option>
            <option value="introduced">Введено</option>
            <option value="changed">Изменено</option>
            <option value="deleted">Удалено</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Пояснение</span>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-3"
            onChange={(event) => onUpdate("status", event.target.value)}
            value={filters.status}
          >
            <option value="">Все</option>
            <option value="missing">Нет опубликованного</option>
            <option value="published">Опубликовано</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Источники</span>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-3"
            onChange={(event) => onUpdate("source", event.target.value)}
            value={filters.source}
          >
            <option value="">Все</option>
            <option value="with">С источниками</option>
            <option value="without">Без источников</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">Из редакции</span>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-3"
            onChange={(event) => onUpdate("fromVersionId", event.target.value)}
            value={filters.fromVersionId}
          >
            <option value="">Любая</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-medium text-slate-600">В редакцию</span>
          <select
            className="h-9 rounded-md border border-slate-300 bg-white px-3"
            onChange={(event) => onUpdate("toVersionId", event.target.value)}
            value={filters.toVersionId}
          >
            <option value="">Любая</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function searchKindLabel(kind: ReaderSearchResult["kind"]) {
  const labels: Record<ReaderSearchResult["kind"], string> = {
    "change-history": "История изменений",
    editorial: "Редакционный материал",
    "law-text": "Текст закона",
  };
  return labels[kind];
}

function ReaderMetadata({
  currentVersion,
  selectedVersion,
}: {
  currentVersion: ReaderVersion | null;
  selectedVersion: ReaderVersion | null;
}) {
  return (
    <dl className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm md:grid-cols-2 xl:grid-cols-4">
      <MetadataItem label="Статус редакции">
        {selectedVersion?.isCurrent ? "Текущая редакция" : "Историческая редакция"}
        {currentVersion && !selectedVersion?.isCurrent ? (
          <span className="mt-1 block text-xs text-slate-500">
            Текущая: {currentVersion.label}
          </span>
        ) : null}
      </MetadataItem>
      <MetadataItem label="Дата начала действия">
        {formatDate(selectedVersion?.effectiveDate) ?? "Не указана"}
      </MetadataItem>
      <MetadataItem label="Источник текста">
        {selectedVersion?.sourceLink ? (
          <>
            <a
              className="text-blue-700 underline-offset-4 hover:underline"
              href={selectedVersion.sourceLink.href}
              rel="noreferrer"
              target="_blank"
            >
              {selectedVersion.sourceLink.label}
            </a>
            <span className="mt-1 block text-xs text-slate-500">
              Консолидированный источник; официальные акты указаны в истории изменений.
            </span>
          </>
        ) : (
          selectedVersion?.sourceName ?? "Источник не указан"
        )}
      </MetadataItem>
      <MetadataItem label="Дата проверки источника">
        {formatDateTime(selectedVersion?.sourceRetrievedAt) ?? "Не зафиксирована"}
      </MetadataItem>
    </dl>
  );
}

function MetadataItem({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}

function TocTreeNode({
  activeStableId,
  expandedStableIds,
  node,
  onSelect,
  onToggle,
  selectedStableId,
}: {
  activeStableId: string | null;
  expandedStableIds: Set<string>;
  node: TocNode;
  onSelect: (item: ReaderTocItem) => void;
  onToggle: (stableId: string) => void;
  selectedStableId: string | null;
}) {
  const isExpanded = expandedStableIds.has(node.stableId);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedStableId === node.stableId;
  const isActive = activeStableId === node.stableId || Boolean(activeStableId?.startsWith(`${node.stableId}.`));

  return (
    <div>
      <div className={treeRowClass(node.type, isSelected, isActive)}>
        {hasChildren ? (
          <button
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Свернуть раздел" : "Раскрыть раздел"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent text-base font-semibold text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-950"
            onClick={() => onToggle(node.stableId)}
            type="button"
          >
            {isExpanded ? "−" : "+"}
          </button>
        ) : (
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-300">
            •
          </span>
        )}
        <button
          className="min-h-9 min-w-0 flex-1 rounded-md px-2 text-left hover:bg-white/80"
          onClick={() => onSelect(node)}
          title={node.title}
          type="button"
        >
          <span className="block truncate">
            <span className="mr-2 text-[11px] font-semibold uppercase text-slate-400">
              {TYPE_LABELS[node.type] ?? node.type}
            </span>
            {node.title}
          </span>
        </button>
      </div>
      {hasChildren && isExpanded ? (
        <div className="ml-4 border-l border-slate-100 pl-2">
          {node.children.map((child) => (
            <TocTreeNode
              activeStableId={activeStableId}
              expandedStableIds={expandedStableIds}
              key={child.stableId}
              node={child}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedStableId={selectedStableId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FragmentArticle({
  changeHref,
  fragment,
  selectedChangeId,
}: {
  changeHref: (
    fragment: ReaderFragment,
    entry: ReaderFragment["changeHistory"][number],
  ) => string;
  fragment: ReaderFragment;
  selectedChangeId: string;
}) {
  const hasAside = hasSupplementalContent(fragment);

  return (
    <article
      className={fragmentArticleClass(fragment.changeStatus, hasAside)}
      data-stable-id={fragment.stableId}
      id={fragment.id}
    >
      <section className={lawTextSectionClass(hasAside)}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
            Официальный текст
          </span>
          <h2 className="text-xl font-semibold">{fragment.title}</h2>
          <ChangeBadge status={fragment.changeStatus} />
          <a className="text-sm text-blue-700 underline-offset-4 hover:underline" href={`#${fragment.id}`}>
            #{fragment.id}
          </a>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-slate-800">
          {fragment.text}
        </p>
      </section>

      {hasAside ? (
      <section className="bg-slate-50 p-5">
        <ChangeHistory
          changeHref={(entry) => changeHref(fragment, entry)}
          entries={fragment.changeHistory}
          selectedChangeId={selectedChangeId}
        />
        {fragment.commentarySource === "current" ? (
          <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900">
            Текст этого фрагмента совпадает с текущей редакцией, поэтому показаны действующие
            комментарии.
          </p>
        ) : fragment.changeStatus === "changed" || fragment.changeStatus === "deleted" ? (
          <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
            Фрагмент отличается от текущей редакции. Комментарии текущего текста здесь не
            подставляются автоматически.
          </p>
        ) : null}
        <div className="grid gap-4">
          {fragment.blocks.map((block) => (
            <CommentBlock key={block.title} title={block.title} text={block.text} />
          ))}
        </div>
      </section>
      ) : null}
    </article>
  );
}

function ChangeHistory({
  changeHref,
  entries,
  selectedChangeId,
}: {
  changeHref: (entry: ReaderFragment["changeHistory"][number]) => string;
  entries: ReaderFragment["changeHistory"];
  selectedChangeId: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">История изменений фрагмента</h3>
      <div className="mt-3 space-y-3">
        {entries.map((entry) => (
          <div
            className={`scroll-mt-6 rounded-md border p-3 ${historyEntryClass(entry.status, selectedChangeId === entry.changeId)}`}
            id={`change-${entry.changeId}`}
            key={entry.changeId}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border bg-white px-2 py-1 text-xs font-medium ${historyBadgeClass(entry.status)}`}>
                {formatHistoryStatus(entry.status)}
              </span>
              {!entry.hasPublishedExplanation ? (
                <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                  нет опубликованного пояснения
                </span>
              ) : null}
              <p className="text-sm font-medium text-slate-950">
                {entry.previousVersionLabel
                  ? `${entry.previousVersionLabel} → ${entry.versionLabel}`
                  : entry.versionLabel}
              </p>
              <a
                className="ml-auto text-xs font-medium text-blue-700 underline-offset-4 hover:underline"
                href={changeHref(entry)}
              >
                Ссылка
              </a>
            </div>
            {entry.beforeSnippet || entry.afterSnippet ? (
              <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-700">
                {entry.beforeSnippet ? (
                <p>
                  <span className="font-semibold text-slate-900">Было: </span>
                  <DiffSegments fallback={entry.beforeSnippet} segments={entry.beforeSegments} />
                </p>
                ) : null}
                {entry.afterSnippet ? (
                <p>
                  <span className="font-semibold text-slate-900">Стало: </span>
                  <DiffSegments fallback={entry.afterSnippet} segments={entry.afterSegments} />
                </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-600">
              <p>
                <span className="font-semibold text-slate-900">Причина: </span>
                {entry.reason}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Цель: </span>
                {entry.purpose}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Практический смысл: </span>
                {entry.practicalMeaning}
              </p>
              {entry.sourceLinks.length > 0 ? (
                <div>
                  <span className="font-semibold text-slate-900">Источники: </span>
                  <SourceLinks links={entry.sourceLinks} />
                </div>
              ) : null}
            </div>
            <ChangeFeedbackForm entry={entry} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DiffSegments({
  fallback,
  segments,
}: {
  fallback: string;
  segments: ReaderFragment["changeHistory"][number]["beforeSegments"];
}) {
  if (segments.length === 0) {
    return <>{fallback}</>;
  }

  return (
    <>
      {segments.map((segment, index) => (
        <span
          className={
            segment.changed
              ? "rounded-sm bg-yellow-200 px-0.5 font-medium text-slate-950"
              : undefined
          }
          key={`${segment.text}-${index}`}
        >
          {index > 0 ? " " : ""}
          {segment.text}
        </span>
      ))}
    </>
  );
}

function ChangeFeedbackForm({
  entry,
}: {
  entry: ReaderFragment["changeHistory"][number];
}) {
  return (
    <form action={submitChangeFeedback} className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/70 pt-3 text-xs">
      <input name="stableId" type="hidden" value={entry.stableId} />
      <input name="fromVersionId" type="hidden" value={entry.fromVersionId} />
      <input name="toVersionId" type="hidden" value={entry.toVersionId} />
      <span className="font-medium text-slate-600">Оценить:</span>
      <button className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50" name="kind" type="submit" value="useful">
        Полезно
      </button>
      <button className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50" name="kind" type="submit" value="unclear">
        Непонятно
      </button>
      <button className="rounded-md border border-slate-200 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-50" name="kind" type="submit" value="error">
        Ошибка
      </button>
    </form>
  );
}

function SourceLinks({ links }: { links: ReaderFragment["changeHistory"][number]["sourceLinks"] }) {
  if (links.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1">
      {links.map((link) => (
        <a
          className="text-blue-700 underline-offset-4 hover:underline"
          href={link.href}
          key={link.href}
          rel="noreferrer"
          target="_blank"
        >
          {link.label}
        </a>
      ))}
    </span>
  );
}

function ChangeBadge({ status }: { status: ReaderFragment["changeStatus"] }) {
  if (status === "current") {
    return null;
  }

  const labels: Record<ReaderFragment["changeStatus"], string> = {
    changed: "изменено",
    current: "",
    deleted: "удалено в текущей",
    unchanged: "без изменений",
  };
  const classes: Record<ReaderFragment["changeStatus"], string> = {
    changed: "border-amber-300 bg-amber-50 text-amber-900",
    current: "",
    deleted: "border-rose-300 bg-rose-50 text-rose-900",
    unchanged: "border-emerald-300 bg-emerald-50 text-emerald-900",
  };

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${classes[status]}`}>
      {labels[status]}
    </span>
  );
}

function formatHistoryStatus(status: ReaderFragment["changeHistory"][number]["status"]) {
  const labels: Record<ReaderFragment["changeHistory"][number]["status"], string> = {
    changed: "изменено",
    deleted: "удалено",
    introduced: "введено",
  };
  return labels[status];
}

function historyEntryClass(
  status: ReaderFragment["changeHistory"][number]["status"],
  isSelected: boolean,
) {
  const classes: Record<ReaderFragment["changeHistory"][number]["status"], string> = {
    changed: "border-amber-200 bg-amber-50",
    deleted: "border-rose-200 bg-rose-50",
    introduced: "border-blue-200 bg-blue-50",
  };
  return `${classes[status]} ${isSelected ? "ring-2 ring-blue-400" : ""}`;
}

function historyBadgeClass(status: ReaderFragment["changeHistory"][number]["status"]) {
  const classes: Record<ReaderFragment["changeHistory"][number]["status"], string> = {
    changed: "border-amber-300 text-amber-900",
    deleted: "border-rose-300 text-rose-900",
    introduced: "border-blue-300 text-blue-900",
  };
  return classes[status];
}

function CommentBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{text}</p>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

function buildTree(items: ReaderTocItem[]) {
  const nodes = new Map<string, TocNode>();
  const roots: TocNode[] = [];

  for (const item of items) {
    nodes.set(item.stableId, { ...item, children: [] });
  }

  for (const node of nodes.values()) {
    if (node.parentStableId && nodes.has(node.parentStableId)) {
      nodes.get(node.parentStableId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function getDefaultNodeStableId(tree: TocNode[]) {
  const documentNode = tree.find((node) => node.type === "law") ?? tree[0];
  return documentNode?.stableId ?? null;
}

function getDefaultExpandedStableIds(tree: TocNode[], selectedStableId: string | null) {
  const expanded = new Set<string>();
  const documentNode = tree.find((node) => node.type === "law") ?? tree[0];
  if (documentNode) {
    expanded.add(documentNode.stableId);
  }

  if (selectedStableId) {
    expanded.add(selectedStableId);
  }

  return Array.from(expanded);
}

function getAncestorStableIds(items: ReaderTocItem[], stableId: string | null) {
  if (!stableId) {
    return [];
  }

  const byStableId = new Map(items.map((item) => [item.stableId, item]));
  const ancestors: string[] = [];
  let cursor = byStableId.get(stableId);
  while (cursor?.parentStableId) {
    ancestors.push(cursor.parentStableId);
    cursor = byStableId.get(cursor.parentStableId);
  }
  return ancestors;
}

function isSameOrDescendant(fragment: ReaderFragment, stableId: string) {
  return fragment.stableId === stableId || fragment.stableId.startsWith(`${stableId}.`);
}

function modeButtonClass(isActive: boolean) {
  const base = "h-9 rounded px-3 text-sm font-medium transition";
  return isActive
    ? `${base} bg-white text-slate-950 shadow-sm`
    : `${base} text-slate-600 hover:text-slate-950`;
}

function treeRowClass(type: string, isSelected: boolean, isActive: boolean) {
  const base = "my-1 flex min-w-0 items-center gap-1 rounded-md py-1 pr-1 text-sm text-slate-700";
  const depth =
    type === "part" ? "text-xs" : type === "point" || type === "paragraph" ? "text-xs text-slate-600" : "";
  if (isSelected) {
    return `${base} ${depth} bg-slate-950 text-white [&_span]:text-white`;
  }
  if (isActive) {
    return `${base} ${depth} bg-blue-50 text-blue-900`;
  }
  return `${base} ${depth} hover:bg-slate-50`;
}

function hasCommentaryNotice(fragment: ReaderFragment) {
  return (
    fragment.commentarySource === "current" ||
    fragment.changeStatus === "changed" ||
    fragment.changeStatus === "deleted"
  );
}

function hasSupplementalContent(fragment: ReaderFragment) {
  return fragment.changeHistory.length > 0 || hasCommentaryNotice(fragment) || fragment.blocks.length > 0;
}

function filterFragmentsByChangeFilters(
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

function hasActiveChangeFilters(filters: ChangeFilters, selectedChangeId: string) {
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

function changeFilterQueryName(name: keyof ChangeFilters) {
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

function fragmentArticleClass(status: ReaderFragment["changeStatus"], hasAside: boolean) {
  const base = `scroll-mt-6 grid gap-0 overflow-hidden rounded-md border bg-white ${hasAside ? "lg:grid-cols-2" : ""}`;
  if (status === "changed") {
    return `${base} border-amber-300`;
  }
  if (status === "deleted") {
    return `${base} border-rose-300`;
  }
  if (status === "unchanged") {
    return `${base} border-emerald-200`;
  }
  return `${base} border-slate-200`;
}

function lawTextSectionClass(hasAside: boolean) {
  const base = "p-5";
  return hasAside ? `${base} border-b border-slate-200 lg:border-b-0 lg:border-r` : base;
}
