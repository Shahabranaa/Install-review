import { createWorker, type Worker } from "tesseract.js";
import { logger } from "./logger.js";

let workerPromise: Promise<Worker> | null = null;

/** Returns the shared Tesseract worker, initialising it on first call.
 *  Subsequent calls return the same cached promise (resolved after first use).
 */
export function getTesseractWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng").then((w) => {
      logger.info("Tesseract: English language worker ready");
      return w;
    }).catch((err) => {
      workerPromise = null;
      logger.error({ err }, "Tesseract: worker initialisation failed");
      throw err;
    });
  }
  return workerPromise;
}

/** Call at server startup to eagerly download language data. Fire-and-forget. */
export function warmTesseractWorker(): void {
  getTesseractWorker().catch(() => {});
}
