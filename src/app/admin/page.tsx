import { redirect } from "next/navigation";
import { getAdminFragments, type AdminFragmentListItem } from "@/lib/admin-data";
import { isAdminAuthenticated } from "@/lib/auth";
import { logoutAdmin } from "./actions";

export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams: Promise<{
    article?: string;
    q?: string;
    type?: string;
  }>;
};

const FRAGMENT_TYPES = ["law", "article", "part", "point", "paragraph"];

export default async function AdminPage({ searchParams }: AdminPageProps) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const filters = await searchParams;
  const fragments = await getAdminFragments();
  const visibleFragments = filterFragments(fragments, filters);
  const groupedFragments = groupByArticle(visibleFragments);
  const typeCounts = countTypes(fragments);

  return (
    <main className="min-h-screen bg-stone-50 px-5 py-8 text-slate-950">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              63-ФЗ · админка
            </p>
            <h1 className="mt-2 text-3xl font-semibold">Фрагменты закона</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
              href="/63fz/admin/changes"
            >
              История изменений
            </a>
            <a
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
              href="/63fz/admin/export/markdown"
            >
              Markdown export
            </a>
            <a
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
              href="/63fz"
            >
              Публичная страница
            </a>
            <form action={logoutAdmin}>
              <button
                className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
                type="submit"
              >
                Выйти
              </button>
            </form>
          </div>
        </div>

        <form className="mt-6 grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-[120px_160px_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Статья</span>
            <input
              className="h-10 rounded-md border border-slate-300 px-3"
              defaultValue={filters.article ?? ""}
              name="article"
              placeholder="17.2"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Тип</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
              defaultValue={filters.type ?? ""}
              name="type"
            >
              <option value="">Все</option>
              {FRAGMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatType(type)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Поиск</span>
            <input
              className="h-10 rounded-md border border-slate-300 px-3"
              defaultValue={filters.q ?? ""}
              name="q"
              placeholder="текст, заголовок или stableId"
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white">
              Найти
            </button>
            <a
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
              href="/63fz/admin"
            >
              Сброс
            </a>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
          <span>{fragments.length} фрагментов всего</span>
          <span>·</span>
          <span>{visibleFragments.length} в выборке</span>
          {Object.entries(typeCounts).map(([type, count]) => (
            <span key={type}>· {formatType(type)}: {count}</span>
          ))}
        </div>

        <section className="mt-6 space-y-4">
          {fragments.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
              Фрагменты пока не импортированы.
            </div>
          ) : groupedFragments.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
              По таким фильтрам ничего не найдено.
            </div>
          ) : (
            groupedFragments.map((group) => (
              <article className="rounded-md border border-slate-200 bg-white" key={group.key}>
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <h2 className="text-base font-semibold">{group.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{group.items.length} фрагментов</p>
                </div>
                <div>
                  {group.items.map((fragment) => (
                    <FragmentRow fragment={fragment} key={fragment.id} />
                  ))}
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function FragmentRow({ fragment }: { fragment: AdminFragmentListItem }) {
  const materialCount =
    fragment.explanationCount +
    fragment.expertCommentCount +
    fragment.issueCount +
    fragment.proposedRevisionCount;

  return (
    <div className="grid gap-3 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_120px]">
      <div style={{ paddingLeft: `${getDepth(fragment.stableId) * 16}px` }}>
        <a
          className="font-medium text-slate-950 underline-offset-4 hover:underline"
          href={`/63fz/admin/fragments/${fragment.id}`}
        >
          {shortenTitle(fragment.title)}
        </a>
        <div className="mt-1 text-slate-500">{fragment.stableId}</div>
        <p className="mt-2 line-clamp-2 text-slate-600">{fragment.text}</p>
      </div>
      <div className="text-slate-600">{formatType(fragment.type)}</div>
      <div className="text-slate-600">{materialCount}</div>
    </div>
  );
}

function filterFragments(
  fragments: AdminFragmentListItem[],
  filters: Awaited<AdminPageProps["searchParams"]>,
) {
  const article = filters.article?.trim();
  const type = filters.type?.trim();
  const query = filters.q?.trim().toLowerCase();

  return fragments.filter((fragment) => {
    if (article && getArticleNumber(fragment.stableId) !== article) {
      return false;
    }

    if (type && fragment.type !== type) {
      return false;
    }

    if (query) {
      const haystack = `${fragment.title} ${fragment.stableId} ${fragment.text}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }

    return true;
  });
}

function groupByArticle(fragments: AdminFragmentListItem[]) {
  const groups = new Map<string, AdminFragmentListItem[]>();

  for (const fragment of fragments) {
    const articleNumber = getArticleNumber(fragment.stableId);
    const key = articleNumber ? `article-${articleNumber}` : "document";
    const current = groups.get(key) ?? [];
    current.push(fragment);
    groups.set(key, current);
  }

  return [...groups.entries()].map(([key, items]) => ({
    key,
    title:
      key === "document"
        ? "Документ"
        : items.find((item) => item.type === "article")?.title ??
          `Статья ${key.replace("article-", "")}`,
    items,
  }));
}

function countTypes(fragments: AdminFragmentListItem[]) {
  return fragments.reduce<Record<string, number>>((counts, fragment) => {
    counts[fragment.type] = (counts[fragment.type] ?? 0) + 1;
    return counts;
  }, {});
}

function getArticleNumber(stableId: string) {
  const match = stableId.match(/^63fz\.article_(\d+(?:_\d+)?)(?:\.|$)/);
  return match?.[1].replace("_", ".") ?? null;
}

function getDepth(stableId: string) {
  return Math.max(0, stableId.split(".").length - 2);
}

function shortenTitle(title: string) {
  return title.replace(/^Статья\s+([\d.]+)\.\s+.+?,\s+(часть|пункт|абзац)\s+/i, "Ст. $1, $2 ");
}

function formatType(type: string) {
  const labels: Record<string, string> = {
    law: "закон",
    article: "статья",
    part: "часть",
    point: "пункт",
    paragraph: "абзац",
  };
  return labels[type] ?? type;
}
