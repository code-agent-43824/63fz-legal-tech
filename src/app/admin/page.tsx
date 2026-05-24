import { redirect } from "next/navigation";
import { getAdminFragments } from "@/lib/admin-data";
import { isAdminAuthenticated } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAdminAuthenticated())) {
    redirect("/admin/login");
  }

  const fragments = await getAdminFragments();

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
          <a
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium"
            href="/63fz"
          >
            Публичная страница
          </a>
        </div>

        <section className="mt-6 overflow-hidden rounded-md border border-slate-200 bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_160px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            <span>Фрагмент</span>
            <span>Тип</span>
            <span>Материалы</span>
          </div>
          {fragments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-600">
              Фрагменты пока не импортированы.
            </p>
          ) : (
            fragments.map((fragment) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_120px_160px] gap-4 border-b border-slate-100 px-4 py-4 text-sm last:border-b-0"
                key={fragment.id}
              >
                <div>
                  <div className="font-medium text-slate-950">{fragment.title}</div>
                  <div className="mt-1 text-slate-500">{fragment.stableId}</div>
                </div>
                <div className="text-slate-600">{fragment.type}</div>
                <div className="text-slate-600">
                  {fragment.explanationCount +
                    fragment.expertCommentCount +
                    fragment.issueCount +
                    fragment.proposedRevisionCount}
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
