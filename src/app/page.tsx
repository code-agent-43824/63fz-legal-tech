import { getReaderData } from "@/lib/law-data";
import { buildReaderView, parseReaderQuery } from "@/lib/reader-view";
import { LawReader } from "@/app/law-reader";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const version = typeof params.version === "string" ? params.version : undefined;

  // The full snapshot stays cached per version; the view is narrowed here so the browser only
  // receives the fragments it actually renders.
  const readerData = await getReaderData(version);
  const view = buildReaderView(readerData, parseReaderQuery(params));

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <LawReader view={view} />
    </main>
  );
}
