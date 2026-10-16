/**
 * Every backend route the app is allowed to reach. The team account has no
 * limits, so the proxy must not become an open door to the rest of the API.
 * Paths are relative to `/tools/`.
 */
const ALLOWED: Array<[method: string, pattern: RegExp]> = [
  ["POST", /^parse-document$/],

  ["POST", /^humanizer\/jobs$/],
  ["GET", /^humanizer\/jobs\/[\w-]+$/],
  ["DELETE", /^humanizer\/jobs\/[\w-]+$/],

  ["GET", /^ai-detect\/config$/],
  ["POST", /^ai-detect$/],
  ["POST", /^ai-detect\/ocr$/],
  ["POST", /^ai-detect\/report$/],

  ["POST", /^plagiarism-check$/],
  ["POST", /^plagiarism-check\/extract$/],
  ["POST", /^plagiarism-check\/report\/pdf$/],
  ["GET", /^plagiarism-check\/[\w-]+$/],
  ["DELETE", /^plagiarism-check\/[\w-]+$/],
];

export function isAllowedRoute(method: string, path: string): boolean {
  return ALLOWED.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
}
