/**
 * Reads dropped files locally in the browser – nothing is uploaded.
 * PDF: page count, page shape, bookmarks (pdf.js, loaded on demand).
 * PPTX: slide count (it's a zip file; fflate, loaded on demand).
 * Video: length from the file's metadata.
 */
import { fileKind, type DetectedFile, type OutlineEntry } from "./importer";

/** A file plus its path inside a dropped folder. */
export interface PickedFile {
  file: File;
  path: string;
}

export async function readFiles(
  picked: PickedFile[],
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<DetectedFile[]> {
  const out: DetectedFile[] = [];
  let done = 0;
  for (const { file, path } of picked) {
    onProgress?.(done, picked.length, file.name);
    const kind = fileKind(file.name);
    try {
      if (kind === "pdf") out.push({ path, kind, ...(await readPdf(file)) });
      else if (kind === "pptx") out.push({ path, kind, pages: await countPptxSlides(file) });
      else if (kind === "video") out.push({ path, kind, durationMinutes: await videoMinutes(file) });
      else out.push({ path, kind });
    } catch (e) {
      out.push({ path, kind, error: e instanceof Error ? `couldn't read it (${e.message})` : "couldn't read it" });
    }
    done++;
  }
  onProgress?.(done, picked.length, "");
  return out;
}

type PdfJs = typeof import("pdfjs-dist");
let pdfjsPromise: Promise<PdfJs> | undefined;

function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return pdfjsPromise;
}

interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
}

/** Headings of a table of contents page, in a few languages. */
const TOC_HEADING = /\b(inhalt|inhaltsverzeichnis|contents|table of contents|sommaire|table des matières|índice|indice|sommario|inhoud)\b/i;

/** Text of one page, one line per text line. */
async function pageText(doc: { getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }> }, n: number): Promise<string> {
  const content = await (await doc.getPage(n)).getTextContent();
  return (content.items as { str?: string; hasEOL?: boolean }[]).map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join("");
}

/**
 * Pages near the start that look like a table of contents: a page with a
 * "Contents"/"Inhalt" heading, plus the pages right after it that are full
 * of page numbers too.
 */
async function findTocPages(doc: Parameters<typeof pageText>[0] & { numPages: number }): Promise<string[]> {
  const found: string[] = [];
  const last = Math.min(doc.numPages, 24);
  for (let n = 1; n <= last; n++) {
    const text = await pageText(doc, n);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const head = lines.slice(0, 6).join(" ");
    const numeric = lines.filter((l) => /\d{1,4}\W?$/.test(l)).length / Math.max(1, lines.length);
    if (TOC_HEADING.test(head) || (found.length > 0 && lines.length >= 8 && numeric > 0.2)) found.push(text);
    else if (found.length > 0) break;
    if (found.length >= 4) break;
  }
  return found;
}

async function readPdf(file: File): Promise<Pick<DetectedFile, "pages" | "landscape" | "outline" | "tocPages">> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const first = await doc.getPage(1);
    const viewport = first.getViewport({ scale: 1 });
    const outline: OutlineEntry[] = [];

    const raw = ((await doc.getOutline()) ?? []) as RawOutlineItem[];
    const walk = async (items: RawOutlineItem[], level: number) => {
      for (const item of items) {
        if (outline.length >= 400) return;
        const page = await destinationPage(doc, item.dest);
        if (page !== undefined && item.title?.trim()) outline.push({ title: item.title.trim(), page, level });
        if (level < 2 && item.items?.length) await walk(item.items, level + 1);
      }
    };
    await walk(raw, 0);

    // Books without bookmarks: read the printed table of contents instead.
    const tocPages = outline.length < 3 && doc.numPages >= 30 ? await findTocPages(doc).catch(() => []) : undefined;
    return { pages: doc.numPages, landscape: viewport.width > viewport.height, outline, ...(tocPages?.length ? { tocPages } : {}) };
  } finally {
    await doc.destroy();
  }
}

/** 1-based page number of a PDF bookmark destination. */
async function destinationPage(
  doc: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]>,
  dest: string | unknown[] | null,
): Promise<number | undefined> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    const target = explicit?.[0];
    if (target == null) return undefined;
    if (typeof target === "number") return target + 1;
    return (await doc.getPageIndex(target as Parameters<typeof doc.getPageIndex>[0])) + 1;
  } catch {
    return undefined;
  }
}

async function countPptxSlides(file: File): Promise<number> {
  const { unzip } = await import("fflate");
  const data = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(data, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) }, (err, result) =>
      err ? reject(err) : resolve(result),
    ),
  );
  return Object.keys(entries).length;
}

function videoMinutes(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | undefined) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    // Some formats (e.g. .mkv in Safari) can't be read – the user enters the length.
    const timer = setTimeout(() => done(undefined), 8000);
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration / 60 : undefined);
    video.onerror = () => done(undefined);
    video.src = url;
  });
}

/** Files from a drop event, including folders (with their paths). */
export async function filesFromDrop(items: DataTransferItemList): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: prefix + file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length > 0);
    }
  };
  const entries = Array.from(items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  for (const entry of entries) await walk(entry, "");
  return out;
}

/** Files from an <input type="file">, with folder paths when a folder was picked. */
export function filesFromInput(list: FileList): PickedFile[] {
  return Array.from(list).map((file) => ({ file, path: file.webkitRelativePath || file.name }));
}
