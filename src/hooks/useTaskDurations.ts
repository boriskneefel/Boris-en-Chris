import { createPersistentStore } from "../lib/persistentStore";

const durationsStore = createPersistentStore<Record<string, number>>(
  "durations_v1",
  {},
);

const pdfUrlsStore = createPersistentStore<Record<string, string | null>>(
  "pdf_urls_v1",
  {},
);

export function useTaskDurations() {
  const durations = durationsStore.useValue();

  function setDuration(column: string, seconds: number) {
    durationsStore.set((prev) => ({ ...prev, [column]: seconds }));
  }

  return { durations, setDuration };
}

export function usePdfUrls() {
  const pdfUrls = pdfUrlsStore.useValue();

  function setPdfUrl(column: string, url: string | null) {
    pdfUrlsStore.set((prev) => ({ ...prev, [column]: url }));
  }

  return { pdfUrls, setPdfUrl };
}

export { durationsStore, pdfUrlsStore };
