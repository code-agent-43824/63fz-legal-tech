import { getReaderData } from "@/lib/law-data";
import { LawReader } from "@/app/law-reader";

export const dynamic = "force-dynamic";

type HomeProps = {
  searchParams: Promise<{
    version?: string;
  }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const readerData = await getReaderData(params.version);

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <LawReader readerData={readerData} />
    </main>
  );
}
