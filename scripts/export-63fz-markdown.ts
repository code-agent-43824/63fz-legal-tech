import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildMarkdownExport, getMarkdownExportData } from "../src/lib/markdown-export";

type CliOptions = {
  outputFile: string;
  versionId?: string;
};

const DEFAULT_OUTPUT_FILE = ".import/63fz-markdown/63fz-current.md";

async function main() {
  const options = parseCliOptions(process.argv.slice(2));
  const data = await getMarkdownExportData(options.versionId);

  if (!data) {
    throw new Error("No law version data found for Markdown export.");
  }

  const markdown = buildMarkdownExport(data);
  await mkdir(path.dirname(options.outputFile), { recursive: true });
  await writeFile(options.outputFile, markdown, "utf8");

  console.log(`Markdown export written: ${options.outputFile}`);
  console.log(`Version: ${data.versionId}`);
  console.log(`Fragments: ${data.fragments.length}`);
  console.log(`Bytes: ${Buffer.byteLength(markdown, "utf8")}`);
}

export function parseCliOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    outputFile: DEFAULT_OUTPUT_FILE,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--output-file" && next) {
      options.outputFile = next;
      index += 1;
      continue;
    }

    if (arg === "--version-id" && next) {
      options.versionId = next;
      index += 1;
      continue;
    }

    if (arg === "--help") {
      printHelpAndExit();
    }

    throw new Error(`Unknown or incomplete option: ${arg}`);
  }

  return options;
}

function printHelpAndExit(): never {
  console.log(`Usage: pnpm law:export:markdown -- [options]

Options:
  --version-id <id>       Export a specific published or archived law version.
  --output-file <path>    Markdown output file. Default: ${DEFAULT_OUTPUT_FILE}
`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
