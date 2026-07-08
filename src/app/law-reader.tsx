"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReaderData, ReaderFragment, ReaderTocItem } from "@/lib/law-data";

type ViewMode = "feed" | "focus";
type TocNode = ReaderTocItem & { children: TocNode[] };

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

  const visibleFragments = useMemo(() => {
    if (mode === "feed" || !selectedStableId || selectedStableId === "63fz.document") {
      return readerData.fragments;
    }

    return readerData.fragments.filter((fragment) => isSameOrDescendant(fragment, selectedStableId));
  }, [mode, readerData.fragments, selectedStableId]);

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
        </div>

        {visibleFragments.length > 0 ? (
          <div className="space-y-5">
            {visibleFragments.map((fragment) => (
              <FragmentArticle fragment={fragment} key={fragment.id} />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white p-8 text-sm text-slate-600">
            В выбранном узле нет отображаемого текста. Выберите статью, часть или пункт ниже по
            дереву.
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

function FragmentArticle({ fragment }: { fragment: ReaderFragment }) {
  return (
    <article
      className={fragmentArticleClass(fragment.changeStatus)}
      data-stable-id={fragment.stableId}
      id={fragment.id}
    >
      <section className="border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-2">
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

      <section className="bg-slate-50 p-5">
        <ChangeHistory entries={fragment.changeHistory} />
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
    </article>
  );
}

function ChangeHistory({ entries }: { entries: ReaderFragment["changeHistory"] }) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">История изменений фрагмента</h3>
      <div className="mt-3 space-y-3">
        {entries.map((entry) => (
          <div className={`rounded-md border p-3 ${historyEntryClass(entry.status)}`} key={`${entry.versionId}-${entry.versionLabel}-${entry.status}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border bg-white px-2 py-1 text-xs font-medium ${historyBadgeClass(entry.status)}`}>
                {formatHistoryStatus(entry.status)}
              </span>
              <p className="text-sm font-medium text-slate-950">
                {entry.previousVersionLabel
                  ? `${entry.previousVersionLabel} → ${entry.versionLabel}`
                  : entry.versionLabel}
              </p>
            </div>
            {entry.beforeSnippet || entry.afterSnippet ? (
              <div className="mt-3 grid gap-2 text-xs leading-5 text-slate-700">
                {entry.beforeSnippet ? (
                <p>
                  <span className="font-semibold text-slate-900">Было: </span>
                  {entry.beforeSnippet}
                </p>
                ) : null}
                {entry.afterSnippet ? (
                <p>
                  <span className="font-semibold text-slate-900">Стало: </span>
                  {entry.afterSnippet}
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
              {entry.sourceLinks ? (
                <p>
                  <span className="font-semibold text-slate-900">Источники: </span>
                  {entry.sourceLinks}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
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

function historyEntryClass(status: ReaderFragment["changeHistory"][number]["status"]) {
  const classes: Record<ReaderFragment["changeHistory"][number]["status"], string> = {
    changed: "border-amber-200 bg-amber-50",
    deleted: "border-rose-200 bg-rose-50",
    introduced: "border-blue-200 bg-blue-50",
  };
  return classes[status];
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

function fragmentArticleClass(status: ReaderFragment["changeStatus"]) {
  const base = "scroll-mt-6 grid gap-0 overflow-hidden rounded-md border bg-white lg:grid-cols-2";
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
