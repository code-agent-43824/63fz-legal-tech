import { getReaderData } from "@/lib/law-data";
import { LawReader } from "@/app/law-reader";

export const dynamic = "force-dynamic";

export default async function Home() {
  const readerData = await getReaderData();

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 md:flex-row md:items-end md:justify-between">
          <div>
            {readerData.isDemo ? (
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                DEMO DATA · MVP scaffold
              </p>
            ) : null}
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight md:text-5xl">
              63-ФЗ об электронной подписи
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              Структурированный интерфейс для чтения закона, экспертных комментариев,
              спорных мест и предложений новой редакции.
            </p>
          </div>
          <a
            className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-5 text-sm font-medium text-white"
            href="#law"
          >
            Открыть закон
          </a>
        </div>
      </header>

      <LawReader readerData={readerData} />
    </main>
  );
}
