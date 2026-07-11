import { notFound, redirect } from "next/navigation";
import { getAdminFragmentDetails } from "@/lib/admin-data";
import { isAdminAuthenticated } from "@/lib/auth";
import { logoutAdmin } from "../../actions";
import { createContent, deleteContent, updateContent } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminFragmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const fragment = await getAdminFragmentDetails(id);

  if (!fragment) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-stone-50 px-3 py-6 text-slate-950 sm:px-5 sm:py-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <a className="text-sm text-slate-600 underline-offset-4 hover:underline" href="/63fz/admin">
            ← Все фрагменты
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
        <div className="mt-4 min-w-0 border-b border-slate-200 pb-6">
          <p className="wrap-anywhere text-sm font-medium uppercase tracking-wide text-slate-500">
            {fragment.type} · {fragment.stableId}
          </p>
          <h1 className="wrap-anywhere mt-2 text-3xl font-semibold">{fragment.title}</h1>
          <p className="wrap-anywhere mt-2 text-sm text-slate-600">#{fragment.anchor}</p>
        </div>

        <section className="mt-6 rounded-md border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Оригинальный текст</h2>
          <p className="wrap-anywhere mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {fragment.originalText}
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Оригинальный текст в MVP не редактируется через админку.
          </p>
        </section>

        <div className="mt-6 grid gap-6">
          <ExplanationSection fragmentId={fragment.id} items={fragment.plainExplanations} />
          <ExpertSection fragmentId={fragment.id} items={fragment.expertComments} />
          <IssueSection fragmentId={fragment.id} items={fragment.issues} />
          <RevisionSection
            fragmentId={fragment.id}
            originalText={fragment.originalText}
            items={fragment.proposedRevisions}
          />
        </div>
      </div>
    </main>
  );
}

function ExplanationSection({
  fragmentId,
  items,
}: {
  fragmentId: string;
  items: Array<{ id: string; text: string; status: string; authorName: string | null }>;
}) {
  return (
    <AdminSection title="Простыми словами">
      <CreateForm fragmentId={fragmentId} kind="explanation">
        <TextInput label="Автор" name="authorName" />
        <StatusSelect />
        <TextArea label="Текст" name="text" required />
      </CreateForm>
      {items.map((item) => (
        <EditForm fragmentId={fragmentId} id={item.id} key={item.id} kind="explanation">
          <TextInput defaultValue={item.authorName ?? ""} label="Автор" name="authorName" />
          <StatusSelect defaultValue={item.status} />
          <TextArea defaultValue={item.text} label="Текст" name="text" required />
        </EditForm>
      ))}
    </AdminSection>
  );
}

function ExpertSection({
  fragmentId,
  items,
}: {
  fragmentId: string;
  items: Array<{
    id: string;
    expertName: string;
    expertTitle: string | null;
    text: string;
    status: string;
  }>;
}) {
  return (
    <AdminSection title="Комментарии экспертов">
      <CreateForm fragmentId={fragmentId} kind="comment">
        <TextInput label="Эксперт" name="expertName" required />
        <TextInput label="Должность/титул" name="expertTitle" />
        <StatusSelect />
        <TextArea label="Комментарий" name="text" required />
      </CreateForm>
      {items.map((item) => (
        <EditForm fragmentId={fragmentId} id={item.id} key={item.id} kind="comment">
          <TextInput defaultValue={item.expertName} label="Эксперт" name="expertName" required />
          <TextInput defaultValue={item.expertTitle ?? ""} label="Должность/титул" name="expertTitle" />
          <StatusSelect defaultValue={item.status} />
          <TextArea defaultValue={item.text} label="Комментарий" name="text" required />
        </EditForm>
      ))}
    </AdminSection>
  );
}

function IssueSection({
  fragmentId,
  items,
}: {
  fragmentId: string;
  items: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    severity: string;
    status: string;
  }>;
}) {
  return (
    <AdminSection title="Ошибки и спорные места">
      <CreateForm fragmentId={fragmentId} kind="issue">
        <IssueFields />
      </CreateForm>
      {items.map((item) => (
        <EditForm fragmentId={fragmentId} id={item.id} key={item.id} kind="issue">
          <IssueFields item={item} />
        </EditForm>
      ))}
    </AdminSection>
  );
}

function RevisionSection({
  fragmentId,
  originalText,
  items,
}: {
  fragmentId: string;
  originalText: string;
  items: Array<{
    id: string;
    originalText: string;
    proposedText: string;
    rationale: string;
    status: string;
  }>;
}) {
  return (
    <AdminSection title="Предложенная редакция">
      <CreateForm fragmentId={fragmentId} kind="revision">
        <TextArea defaultValue={originalText} label="Оригинальный текст" name="originalText" required />
        <TextArea label="Предложенный текст" name="proposedText" required />
        <TextArea label="Обоснование" name="rationale" required />
        <RevisionStatusSelect />
      </CreateForm>
      {items.map((item) => (
        <EditForm fragmentId={fragmentId} id={item.id} key={item.id} kind="revision">
          <TextArea defaultValue={item.originalText} label="Оригинальный текст" name="originalText" required />
          <TextArea defaultValue={item.proposedText} label="Предложенный текст" name="proposedText" required />
          <TextArea defaultValue={item.rationale} label="Обоснование" name="rationale" required />
          <RevisionStatusSelect defaultValue={item.status} />
        </EditForm>
      ))}
    </AdminSection>
  );
}

function AdminSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="min-w-0 rounded-md border border-slate-200 bg-white p-5">
      <h2 className="wrap-anywhere text-lg font-semibold">{title}</h2>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

function CreateForm({
  children,
  fragmentId,
  kind,
}: {
  children: React.ReactNode;
  fragmentId: string;
  kind: string;
}) {
  return (
    <form action={createContent} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 p-4">
      <input name="fragmentId" type="hidden" value={fragmentId} />
      <input name="kind" type="hidden" value={kind} />
      <div className="grid gap-3">{children}</div>
      <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
        Добавить
      </button>
    </form>
  );
}

function EditForm({
  children,
  fragmentId,
  id,
  kind,
}: {
  children: React.ReactNode;
  fragmentId: string;
  id: string;
  kind: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 p-4">
      <form action={updateContent}>
        <input name="fragmentId" type="hidden" value={fragmentId} />
        <input name="kind" type="hidden" value={kind} />
        <input name="id" type="hidden" value={id} />
        <div className="grid gap-3">{children}</div>
        <button className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white" type="submit">
          Сохранить
        </button>
      </form>
      <form action={deleteContent} className="mt-2">
        <input name="fragmentId" type="hidden" value={fragmentId} />
        <input name="kind" type="hidden" value={kind} />
        <input name="id" type="hidden" value={id} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input className="h-4 w-4" name="confirmDelete" type="checkbox" value="yes" />
          Подтверждаю удаление
        </label>
        <button className="mt-2 text-sm text-red-700 underline-offset-4 hover:underline" type="submit">
          Удалить
        </button>
      </form>
    </div>
  );
}

function IssueFields({
  item,
}: {
  item?: {
    type: string;
    title: string;
    description: string;
    severity: string;
    status: string;
  };
}) {
  return (
    <>
      <Select
        defaultValue={item?.type ?? "other"}
        label="Тип"
        name="type"
        options={[
          "typo",
          "contradiction",
          "ambiguity",
          "outdated_norm",
          "technical_error",
          "enforcement_problem",
          "other",
        ]}
      />
      <TextInput defaultValue={item?.title ?? ""} label="Заголовок" name="title" required />
      <TextArea defaultValue={item?.description ?? ""} label="Описание" name="description" required />
      <Select defaultValue={item?.severity ?? "low"} label="Серьёзность" name="severity" options={["low", "medium", "high"]} />
      <Select
        defaultValue={item?.status ?? "hypothesis"}
        label="Статус"
        name="status"
        options={["hypothesis", "confirmed", "rejected", "fixed_in_proposal"]}
      />
    </>
  );
}

function StatusSelect({ defaultValue = "draft" }: { defaultValue?: string }) {
  return <Select defaultValue={defaultValue} label="Статус" name="status" options={["draft", "published"]} />;
}

function RevisionStatusSelect({ defaultValue = "draft" }: { defaultValue?: string }) {
  return <Select defaultValue={defaultValue} label="Статус" name="status" options={["draft", "proposed", "accepted", "rejected"]} />;
}

function Select({
  defaultValue,
  label,
  name,
  options,
}: {
  defaultValue: string;
  label: string;
  name: string;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm" defaultValue={defaultValue} name={name}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextInput({
  defaultValue,
  label,
  name,
  required,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input className="mt-1 h-10 w-full min-w-0 rounded-md border border-slate-300 px-3 text-sm" defaultValue={defaultValue} name={name} required={required} />
    </label>
  );
}

function TextArea({
  defaultValue,
  label,
  name,
  required,
}: {
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <textarea className="mt-1 min-h-28 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm leading-6" defaultValue={defaultValue} name={name} required={required} />
    </label>
  );
}
