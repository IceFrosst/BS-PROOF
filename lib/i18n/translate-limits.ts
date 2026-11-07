/*
 * Size limits of the display-translation request. Plain constants with no
 * server imports, so the browser queue (translate-client.tsx) and the server
 * (lib/analyze/translate.ts, app/api/scan/translate/route.ts) share ONE number.
 */

/** Strings per request. The browser sends fewer (see BATCH_*): the model answer has to fit its token budget. */
export const TRANSLATE_MAX_ITEMS = 24;
/** One string. A longer one is never sent: it would 400 the whole batch. */
export const TRANSLATE_MAX_ITEM_CHARS = 4_000;
export const TRANSLATE_MAX_TOTAL_CHARS = 24_000;
/**
 * Hard cap on the request BODY in bytes, enforced while it is read (before any
 * JSON parse): 6 bytes per character is the worst case of JSON escaping
 * (\u00XX), plus slack for the envelope.
 */
export const TRANSLATE_MAX_BODY_BYTES = TRANSLATE_MAX_TOTAL_CHARS * 6 + 4_096;
