import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/auth";
import { withBasePath } from "@/lib/base-path";
import { buildMarkdownExport, getMarkdownExportData } from "@/lib/markdown-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return new NextResponse(null, {
      status: 307,
      headers: { location: withBasePath("/admin/login") },
    });
  }

  const url = new URL(request.url);
  const versionId = url.searchParams.get("version")?.trim() || undefined;
  const data = await getMarkdownExportData(versionId);

  if (!data) {
    return new NextResponse("Markdown export is unavailable: no law version data found.", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  }

  const markdown = buildMarkdownExport(data);
  const filename = `63fz-${sanitizeFilename(data.versionId)}.md`;

  return new NextResponse(markdown, {
    status: 200,
    headers: {
      "content-disposition": `attachment; filename="${filename}"`,
      "content-type": "text/markdown; charset=utf-8",
    },
  });
}

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
}
