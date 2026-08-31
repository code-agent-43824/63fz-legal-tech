"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReaderFragment, ReaderTocItem, ReaderVersion } from "@/lib/law-data";
import { formatLawReferenceLabel, type LawReference } from "@/lib/law-references";
import type { ReaderSearchResult } from "@/lib/reader-search";
import {
  changeFilterQueryName,
  type ChangeFilters,
  type ReaderView,
  type ReaderViewMode,
} from "@/lib/reader-view";
import { submitChangeFeedback } from "@/app/feedback-actions";

type ViewMode = ReaderViewMode;
type TocNode = ReaderTocItem & { children: TocNode[] };

const TYPE_LABELS: Record<string, string> = {
  law: "Закон",
  article: "Статья",
  part: "Часть",
  point: "Пункт",
  paragraph: "Абзац",
};

export function LawReader({ view }: { view: ReaderView }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The server already resolved what this URL displays; the client renders it rather than
  // recomputing it from the query string.
  const { mode, selectedChangeId, selectedStableId } = view;
  const changeFilters = view.filters;
  const searchQuery = searchParams.get("q") ?? "";
  const tree = useMemo(() => buildTree(view.toc), [view.toc]);
  const tocByStableId = useMemo(
    () => new Map(view.toc.map((item) => [item.stableId, item])),
    [view.toc],
  );
  const selectedItem = selectedStableId ? tocByStableId.get(selectedStableId) : null;
  const [expandedStableIds, setExpandedStableIds] = useState<Set<string>>(
    () => new Set(getDefaultExpandedStableIds(tree, selectedStableId)),
  );
  const [activeStableId, setActiveStableId] = useState<string | null>(selectedStableId);
  const [isTocOpen, setTocOpen] = useState(false);
  const visibleExpandedStableIds = useMemo(() => {
    const next = new Set(expandedStableIds);
    for (const stableId of getAncestorStableIds(view.toc, selectedStableId)) {
      next.add(stableId);
    }
    return next;
  }, [expandedStableIds, view.toc, selectedStableId]);
  const tocActiveStableId = mode === "focus" ? selectedStableId : activeStableId;
  const selectedVersion = useMemo(
    () => view.versions.find((version) => version.id === view.selectedVersionId) ?? null,
    [view.selectedVersionId, view.versions],
  );
  const currentVersion = useMemo(
    () => view.versions.find((version) => version.id === view.currentVersionId) ?? null,
    [view.currentVersionId, view.versions],
  );
  // Filtering and search now happen on the server; these arrive ready to render.
  const searchResults = view.searchResults;
  const filteredFragments = view.fragments;
  const hasChangeFilters = view.hasChangeFilters;
  const hasVisibleSupplementalContent = filteredFragments.some((fragment) =>
    hasSupplementalContent(fragment),
  );

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", isTocOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [isTocOpen]);

  useEffect(() => {
    if (!isTocOpen) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTocOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isTocOpen]);

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

    for (const fragment of filteredFragments) {
      const element = document.getElementById(fragment.id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => observer.disconnect();
  }, [filteredFragments, mode, selectedStableId]);

  function updateMode(nextMode: ViewMode) {
    const nextNode = mode === "feed" ? (activeStableId ?? selectedStableId) : selectedStableId;
    replaceUrl(nextMode, nextMode === "focus" ? nextNode : null);
  }

  function selectNode(item: ReaderTocItem) {
    setTocOpen(false);
    setExpandedStableIds((current) => {
      const next = new Set(current);
      next.add(item.stableId);
      for (const stableId of getAncestorStableIds(view.toc, item.stableId)) {
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
    if (versionId === view.currentVersionId) {
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
    setExpandedStableIds(new Set(view.toc.map((item) => item.stableId)));
  }

  function collapseAll() {
    setExpandedStableIds(new Set(getDefaultExpandedStableIds(tree, selectedStableId)));
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-3 sm:px-5">
          <button
            aria-expanded={isTocOpen}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
            aria-label="Открыть оглавление"
            onClick={() => setTocOpen(true)}
            type="button"
          >
            <span aria-hidden="true">☰</span>
            <span className="hidden sm:inline">Оглавление</span>
          </button>
          <h1 className="flex min-w-0 items-baseline gap-2">
            <span className="law-text shrink-0 text-lg font-bold tracking-tight">63-ФЗ</span>
            <span className="hidden truncate text-sm text-slate-500 md:block">
              Об электронной подписи
            </span>
          </h1>
          {view.isDemo ? (
            <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              DEMO DATA
            </span>
          ) : null}
          <div className="ml-auto flex min-w-0 items-center">
            <label className="sr-only" htmlFor="version-select">
              Редакция
            </label>
            <select
              className="h-9 w-full min-w-0 max-w-[45vw] rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-900 sm:max-w-[240px]"
              disabled={view.versions.length <= 1}
              id="version-select"
              onChange={(event) => updateVersion(event.target.value)}
              value={view.selectedVersionId ?? ""}
            >
              {view.versions.length > 0 ? (
                view.versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.label}
                    {version.isCurrent ? " · текущая" : ""}
                  </option>
                ))
              ) : (
                <option value="">Текущая редакция</option>
              )}
            </select>
          </div>
        </div>
      </header>

      {isTocOpen ? (
        <button
          aria-label="Закрыть оглавление"
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
          onClick={() => setTocOpen(false)}
          type="button"
        />
      ) : null}

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-3 py-5 sm:px-5 sm:py-6 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <aside className={asideClass(isTocOpen)}>
        <div className="flex items-center justify-between border-b border-slate-200 p-3 lg:hidden">
          <span className="text-sm font-semibold text-slate-900">Навигация</span>
          <button
            className="h-8 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setTocOpen(false)}
            type="button"
          >
            Закрыть
          </button>
        </div>
        {view.currentVersionId &&
        view.selectedVersionId &&
        view.selectedVersionId !== view.currentVersionId ? (
          <div className="border-b border-slate-200 p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Сравнение с текущей редакцией
            </h2>
            <div className="mt-2 grid grid-cols-2 gap-2 text-center text-[11px] text-slate-600 md:grid-cols-4">
              <VersionStat label="Без изменений" value={view.changeSummary.unchanged} />
              <VersionStat label="Изменено" value={view.changeSummary.changed} />
              <VersionStat label="Введено" value={view.changeSummary.introduced} />
              <VersionStat label="Удалено" value={view.changeSummary.deleted} />
            </div>
          </div>
        ) : null}

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
          onNavigate={() => setTocOpen(false)}
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
          versions={view.versions}
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
          <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="wrap-anywhere text-xs font-semibold uppercase tracking-wide text-slate-500">
                {view.selectedVersionLabel ?? "Текущая редакция"} ·{" "}
                {mode === "focus" ? "режим фокуса" : "режим ленты"}
              </p>
              <h2 className="wrap-anywhere mt-1 text-lg font-semibold text-slate-950">
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
                className="h-10 shrink-0 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
    </>
  );
}

function asideClass(isOpen: boolean) {
  const mobile = `fixed inset-y-0 left-0 z-50 w-[85vw] max-w-sm transform overflow-auto border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
    isOpen ? "translate-x-0" : "-translate-x-full"
  }`;
  const desktop =
    "lg:sticky lg:inset-auto lg:top-[4.5rem] lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:rounded-md lg:border lg:shadow-none lg:max-h-[calc(100vh-5.5rem)]";
  return `min-w-0 ${mobile} ${desktop}`;
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
  onNavigate,
  onSubmit,
  resultHref,
  results,
  searchQuery,
}: {
  onClear: () => void;
  onNavigate: () => void;
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
            <div className="mt-3 max-h-80 min-w-0 space-y-2 overflow-auto pr-1">
              {results.map((result) => (
                <a
                  className="block min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm hover:border-blue-200 hover:bg-blue-50"
                  href={resultHref(result)}
                  key={result.id}
                  onClick={onNavigate}
                >
                  <span className="wrap-anywhere block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {searchKindLabel(result.kind)} · {result.label}
                  </span>
                  <span className="wrap-anywhere mt-1 block font-medium text-slate-950">
                    {result.fragmentTitle}
                  </span>
                  <span className="wrap-anywhere mt-1 block text-xs leading-5 text-slate-600">
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
  const isCurrent = Boolean(selectedVersion?.isCurrent);
  const effectiveDate = formatDate(selectedVersion?.effectiveDate);
  const checkedAt = formatDateTime(selectedVersion?.sourceRetrievedAt);

  return (
    <div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            isCurrent ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"
          }`}
        >
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
          {isCurrent ? "Текущая редакция" : "Историческая редакция"}
        </span>
        {effectiveDate ? (
          <span className="wrap-anywhere">
            действует с <span className="font-medium text-slate-900">{effectiveDate}</span>
          </span>
        ) : (
          <span className="wrap-anywhere">дата вступления не указана</span>
        )}
        <span className="wrap-anywhere min-w-0">
          источник:{" "}
          {selectedVersion?.sourceLink ? (
            <a
              className="text-blue-700 underline-offset-4 hover:underline"
              href={selectedVersion.sourceLink.href}
              rel="noreferrer"
              target="_blank"
            >
              {selectedVersion.sourceLink.label}
            </a>
          ) : (
            (selectedVersion?.sourceName ?? "не указан")
          )}
        </span>
        {checkedAt ? <span className="wrap-anywhere">проверено {checkedAt}</span> : null}
      </div>
      {(!isCurrent && currentVersion) || selectedVersion?.sourceLink ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">
          {!isCurrent && currentVersion ? `Текущая редакция: ${currentVersion.label}. ` : null}
          {selectedVersion?.sourceLink
            ? "Консолидированный источник; официальные акты указаны в истории изменений."
            : null}
        </p>
      ) : null}
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
          <span className="block truncate text-sm leading-5">
            <span className="mr-2 text-[11px] font-semibold uppercase text-slate-500">
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
        <div className="group flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-2">
          <h2 className={fragmentTitleClass(fragment.type)}>{fragment.title}</h2>
          <ChangeBadge status={fragment.changeStatus} />
          <AnchorCopyButton anchor={fragment.id} stableId={fragment.stableId} />
        </div>
        <p className="law-text wrap-anywhere mt-4 max-w-[70ch] whitespace-pre-wrap text-[17px] leading-[1.75] text-slate-900">
          {fragment.text}
        </p>
        <LawReferences references={fragment.references} />
      </section>

      {hasAside ? (
      <section className="min-w-0 bg-slate-50 p-5">
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

function LawReferences({ references }: { references: LawReference[] }) {
  if (references.length === 0) {
    return null;
  }

  return (
    <section className="mt-4 max-w-[70ch] border-t border-slate-100 pt-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Отсылки в официальном тексте
      </h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {references.map((reference) => (
          <li
            className="wrap-anywhere min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs leading-5 text-slate-700"
            key={reference.id}
            title={`Федеральный закон от ${reference.dateLabel} N ${reference.number}`}
          >
            {formatLawReferenceLabel(reference)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function fragmentTitleClass(type: string) {
  const base = "law-text wrap-anywhere min-w-0 leading-snug text-slate-950";
  return type === "article" || type === "law"
    ? `${base} text-2xl font-bold`
    : `${base} text-lg font-semibold`;
}

function AnchorCopyButton({ anchor, stableId }: { anchor: string; stableId: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#${anchor}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.history.replaceState(null, "", `#${anchor}`);
    }
    setCopied(true);
  }

  return (
    <button
      className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100"
      onClick={copyLink}
      title={`Скопировать ссылку на ${stableId}`}
      type="button"
    >
      {copied ? "Скопировано" : "§ ссылка"}
    </button>
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
      <div className="mt-3 min-w-0 space-y-3">
        {entries.map((entry) => (
          <div
            className={`scroll-mt-24 rounded-md border p-3 ${historyEntryClass(entry.status, selectedChangeId === entry.changeId)}`}
            id={`change-${entry.changeId}`}
            key={entry.changeId}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={`rounded-full border bg-white px-2 py-1 text-xs font-medium ${historyBadgeClass(entry.status)}`}>
                {formatHistoryStatus(entry.status)}
              </span>
              {!entry.hasPublishedExplanation ? (
                <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                  нет опубликованного пояснения
                </span>
              ) : null}
              <p className="wrap-anywhere min-w-0 text-sm font-medium text-slate-950">
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
              <div className="mt-3 grid min-w-0 gap-2 text-xs leading-5 text-slate-700">
                {entry.beforeSnippet ? (
                <p className="wrap-anywhere">
                  <span className="font-semibold text-slate-900">Было: </span>
                  <DiffSegments fallback={entry.beforeSnippet} segments={entry.beforeSegments} tone="before" />
                </p>
                ) : null}
                {entry.afterSnippet ? (
                <p className="wrap-anywhere">
                  <span className="font-semibold text-slate-900">Стало: </span>
                  <DiffSegments fallback={entry.afterSnippet} segments={entry.afterSegments} tone="after" />
                </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-3 grid min-w-0 gap-2 text-xs leading-5 text-slate-600">
              <p className="wrap-anywhere">
                <span className="font-semibold text-slate-900">Причина: </span>
                {entry.reason}
              </p>
              <p className="wrap-anywhere">
                <span className="font-semibold text-slate-900">Цель: </span>
                {entry.purpose}
              </p>
              <p className="wrap-anywhere">
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
  tone,
}: {
  fallback: string;
  segments: ReaderFragment["changeHistory"][number]["beforeSegments"];
  tone: "before" | "after";
}) {
  if (segments.length === 0) {
    return <>{fallback}</>;
  }

  const changedClass =
    tone === "before"
      ? "rounded-sm bg-rose-100 px-0.5 font-medium text-slate-950"
      : "rounded-sm bg-emerald-100 px-0.5 font-medium text-slate-950";

  return (
    <>
      {segments.map((segment, index) => (
        <span
          className={segment.changed ? changedClass : undefined}
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
    <form action={submitChangeFeedback} className="mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t border-white/70 pt-3 text-xs">
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
    <span className="inline-flex min-w-0 flex-wrap gap-x-2 gap-y-1">
      {links.map((link) => (
        <a
          className="wrap-anywhere min-w-0 text-blue-700 underline-offset-4 hover:underline"
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
    introduced: "border-emerald-200 bg-emerald-50",
  };
  return `${classes[status]} ${isSelected ? "ring-2 ring-blue-400" : ""}`;
}

function historyBadgeClass(status: ReaderFragment["changeHistory"][number]["status"]) {
  const classes: Record<ReaderFragment["changeHistory"][number]["status"], string> = {
    changed: "border-amber-300 text-amber-900",
    deleted: "border-rose-300 text-rose-900",
    introduced: "border-emerald-300 text-emerald-900",
  };
  return classes[status];
}

function CommentBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="wrap-anywhere mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{text}</p>
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







function fragmentArticleClass(status: ReaderFragment["changeStatus"], hasAside: boolean) {
  const base = `scroll-mt-20 grid min-w-0 gap-0 overflow-hidden rounded-md border bg-white ${hasAside ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`;
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
  const base = "min-w-0 p-5";
  return hasAside ? `${base} border-b border-slate-200 lg:border-b-0 lg:border-r` : base;
}
