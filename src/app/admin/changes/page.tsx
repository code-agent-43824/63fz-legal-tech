import { redirect } from "next/navigation";
import {
  getAdminChangeTransitions,
  getActiveEditorialExperts,
  type ActiveEditorialExpert,
  type AdminChangeTransition,
} from "@/lib/admin-data";
import { getCurrentEditorialActor } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { logoutAdmin } from "../actions";
import { deleteChangeExplanation, publishReviewedChange, saveChangeExplanation, submitChangeForReview, unpublishChange } from "./actions";

export const dynamic = "force-dynamic";

type AdminChangesPageProps = {
  searchParams: Promise<{
    article?: string;
    fromVersionId?: string;
    q?: string;
    source?: string;
    status?: string;
    toVersionId?: string;
    type?: string;
  }>;
};

export default async function AdminChangesPage({ searchParams }: AdminChangesPageProps) {
  const actor = await getCurrentEditorialActor();
  if (!actor) {
    redirect("/admin/login");
  }
  const filters = await searchParams;
  const [allTransitions, experts] = await Promise.all([getAdminChangeTransitions(filters), getActiveEditorialExperts()]);
  const transitions = actor.role === "admin" ? allTransitions : allTransitions.filter((item) => item.explanation?.reviewerId === actor.id);
  const filledCount = transitions.filter((transition) => transition.explanation).length;

  return (
    <main className="min-h-screen bg-stone-50 px-3 py-6 text-slate-950 sm:px-5 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex min-w-0 flex-col gap-3 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <a className="text-sm text-slate-600 underline-offset-4 hover:underline" href={withBasePath("/admin")}>
              ← Фрагменты закона
            </a>
            <p className="mt-4 text-sm font-medium uppercase tracking-wide text-slate-500">
              63-ФЗ · админка
            </p>
            <h1 className="wrap-anywhere mt-2 text-3xl font-semibold">История изменений</h1>
          </div>
          <a
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
            href={withBasePath("/")}
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

        <form className="mt-6 grid gap-3 rounded-md border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-[90px_150px_150px_150px_minmax(0,1fr)_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Статья</span>
            <input
              className="h-10 rounded-md border border-slate-300 px-3"
              defaultValue={filters.article ?? ""}
              name="article"
              placeholder="18"
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
              <option value="introduced">Введено</option>
              <option value="changed">Изменено</option>
              <option value="deleted">Удалено</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Статус</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
              defaultValue={filters.status ?? ""}
              name="status"
            >
              <option value="">Все</option>
              <option value="missing">Не заполнено</option>
              <option value="draft">Черновик</option>
              <option value="in_review">На проверке</option>
              <option value="published">Опубликовано</option>
              <option value="unpublished">Снято</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Источники</span>
            <select
              className="h-10 rounded-md border border-slate-300 bg-white px-3"
              defaultValue={filters.source ?? ""}
              name="source"
            >
              <option value="">Все</option>
              <option value="with">Есть</option>
              <option value="without">Нет</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Поиск</span>
            <input
              className="h-10 rounded-md border border-slate-300 px-3"
              defaultValue={filters.q ?? ""}
              name="q"
              placeholder="текст, stableId, источник"
            />
          </label>
          <div className="flex items-end gap-2">
            <button className="h-10 rounded-md bg-slate-950 px-4 text-sm font-medium text-white">
              Найти
            </button>
            <a
              className="inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
              href={withBasePath("/admin/changes")}
            >
              Сброс
            </a>
          </div>
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span className="font-medium text-slate-700">Из редакции</span>
            <input
              className="h-10 rounded-md border border-slate-300 px-3"
              defaultValue={filters.fromVersionId ?? ""}
              name="fromVersionId"
              placeholder="version id"
            />
          </label>
          <label className="grid gap-1 text-sm xl:col-span-2">
            <span className="font-medium text-slate-700">В редакцию</span>
            <input
              className="h-10 rounded-md border border-slate-300 px-3"
              defaultValue={filters.toVersionId ?? ""}
              name="toVersionId"
              placeholder="version id"
            />
          </label>
        </form>

        <div className="mt-4 flex flex-wrap gap-2 text-sm text-slate-600">
          <span>{transitions.length} переходов в выборке</span>
          <span>·</span>
          <span>{filledCount} с пояснениями</span>
          <span>·</span>
          <span>{Math.max(0, transitions.length - filledCount)} не заполнено</span>
        </div>

        <section className="mt-6 space-y-4">
          {transitions.length === 0 ? (
            <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
              По таким фильтрам изменений не найдено.
            </div>
          ) : (
            transitions.map((transition) => (
              <ChangeEditor actor={actor} experts={experts} transition={transition} key={transitionKey(transition)} />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function ChangeEditor({ actor, experts, transition }: { actor: NonNullable<Awaited<ReturnType<typeof getCurrentEditorialActor>>>; experts: ActiveEditorialExpert[]; transition: AdminChangeTransition }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${changeTypeClass(transition.changeType)}`}>
            {formatChangeType(transition.changeType)}
          </span>
          <span className="text-sm text-slate-600">{formatType(transition.type)}</span>
          <span className="text-sm text-slate-400">·</span>
          <span className="wrap-anywhere min-w-0 text-sm text-slate-600">{transition.stableId}</span>
          {transition.explanation ? (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
              {transition.explanation.status}
            </span>
          ) : (
            <span className="rounded-full border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-600">
              не заполнено
            </span>
          )}
        </div>
        <h2 className="wrap-anywhere mt-2 text-base font-semibold">{transition.title}</h2>
        <p className="wrap-anywhere mt-1 text-sm text-slate-600">
          {transition.fromVersionLabel} → {transition.toVersionLabel}
        </p>
      </div>

      <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className="grid min-w-0 gap-3 text-sm leading-6">
          <Snippet
            emptyText="Фрагмент отсутствовал в этой редакции."
            text={transition.beforeSnippet}
            title="Было"
          />
          <Snippet
            emptyText="Фрагмент отсутствует в этой редакции."
            text={transition.afterSnippet}
            title="Стало"
          />
        </div>

        <div className="min-w-0">
          <form action={saveChangeExplanation} className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <input name="stableId" type="hidden" value={transition.stableId} />
            <input name="fromVersionId" type="hidden" value={transition.fromVersionId} />
            <input name="toVersionId" type="hidden" value={transition.toVersionId} />
            <div className="grid gap-3">
              {actor.role === "admin" ? <Select defaultValue={transition.explanation?.reviewerId ?? ""} label="Ответственный эксперт" name="reviewerId" options={["", ...experts.map((item) => item.id)]} labels={["Выберите эксперта", ...experts.map((item) => item.displayName)]} /> : <p className="text-sm">Ответственный: <strong>{actor.displayName}</strong></p>}
              <Select defaultValue={transition.explanation?.origin ?? "human"} label="Происхождение черновика" name="origin" options={["human", "ai_assisted"]} labels={["Авторский текст", "Подготовлен с помощью ИИ"]} />
              <TextArea
                defaultValue={transition.explanation?.reason ?? ""}
                label="Причина изменения"
                name="reason"
              />
              <TextArea
                defaultValue={transition.explanation?.purpose ?? ""}
                label="Цель изменения"
                name="purpose"
              />
              <TextArea
                defaultValue={transition.explanation?.practicalMeaning ?? ""}
                label="Практический смысл"
                name="practicalMeaning"
              />
              <TextArea
                defaultValue={transition.explanation?.sourceLinks ?? ""}
                label="Источники"
                name="sourceLinks"
              />
            </div>
            <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
              Сохранить как черновик
            </button>
          </form>

          {transition.explanation && actor.role === "expert" && transition.explanation.reviewerId === actor.id && (transition.explanation.status === "draft" || transition.explanation.status === "unpublished") ? <form action={submitChangeForReview} className="mt-3"><input name="id" type="hidden" value={transition.explanation.id} /><button className="rounded-md border border-slate-400 bg-white px-4 py-2 text-sm font-medium">Передать на проверку</button></form> : null}
          {transition.explanation && actor.role === "expert" && transition.explanation.reviewerId === actor.id && transition.explanation.status === "in_review" ? <form action={publishReviewedChange} className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm font-semibold">Проверка перед публикацией</p>{[["factualAccuracy","Факты и трактовка проверены"],["sources","Источники проверены"],["scope","Редакционный текст отделён от закона"],["version","Редакция закона проверена"],["responsibility","Принимаю именную ответственность"]].map(([name,label])=><label className="mt-2 flex gap-2 text-sm" key={name}><input name={name} required type="checkbox" value="yes" />{label}</label>)}<input name="id" type="hidden" value={transition.explanation.id}/><button className="mt-3 rounded-md bg-emerald-900 px-4 py-2 text-sm font-medium text-white">Опубликовать</button></form> : null}
          {transition.explanation && transition.explanation.status === "published" && (actor.role === "admin" || transition.explanation.reviewerId === actor.id) ? <form action={unpublishChange} className="mt-3"><input name="id" type="hidden" value={transition.explanation.id}/><button className="rounded-md border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-medium">Снять с публикации</button></form> : null}

          {transition.explanation && actor.role === "admin" ? (
            <form action={deleteChangeExplanation} className="mt-2">
              <input name="id" type="hidden" value={transition.explanation.id} />
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input className="h-4 w-4" name="confirmDelete" type="checkbox" value="yes" />
                Подтверждаю удаление
              </label>
              <button className="mt-2 text-sm text-red-700 underline-offset-4 hover:underline" type="submit">
                Удалить пояснение
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function Snippet({
  emptyText,
  text,
  title,
}: {
  emptyText: string;
  text: string;
  title: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <p className="wrap-anywhere mt-2 text-slate-700">{text || emptyText}</p>
    </div>
  );
}

function Select({
  defaultValue,
  label,
  name,
  options,
  labels,
}: {
  defaultValue: string;
  label: string;
  name: string;
  options: string[];
  labels?: string[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm" defaultValue={defaultValue} name={name}>
        {options.map((option, index) => (
          <option key={option} value={option}>
            {labels?.[index] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
  defaultValue,
  label,
  name,
}: {
  defaultValue?: string;
  label: string;
  name: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea className="mt-1 min-h-24 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" defaultValue={defaultValue} name={name} />
    </label>
  );
}

function transitionKey(transition: AdminChangeTransition) {
  return `${transition.stableId}-${transition.fromVersionId}-${transition.toVersionId}`;
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

function formatChangeType(type: AdminChangeTransition["changeType"]) {
  const labels: Record<AdminChangeTransition["changeType"], string> = {
    changed: "изменено",
    deleted: "удалено",
    introduced: "введено",
  };
  return labels[type];
}

function changeTypeClass(type: AdminChangeTransition["changeType"]) {
  const classes: Record<AdminChangeTransition["changeType"], string> = {
    changed: "border-amber-300 bg-amber-50 text-amber-900",
    deleted: "border-rose-300 bg-rose-50 text-rose-900",
    introduced: "border-blue-300 bg-blue-50 text-blue-900",
  };
  return classes[type];
}
