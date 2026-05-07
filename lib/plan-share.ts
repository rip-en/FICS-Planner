import {
  validatePlanImportJson,
  type PlanImportPayload,
} from "@/lib/plan-import";

/** Fragment prefix: `#plan=<base64url(json)>` */
export const PLAN_SHARE_HASH_PREFIX = "plan=";

/** Stay under typical browser URL limits when copying a full URL with hash. */
export const PLAN_SHARE_MAX_URL_CHARS = 48_000;

export function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToUtf8(b64url: string): string {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodePlansPayloadForShare(payload: PlanImportPayload): string {
  return utf8ToBase64Url(JSON.stringify(payload));
}

export function decodePlansFromSharePayload(encoded: string) {
  try {
    const json = base64UrlToUtf8(encoded.trim());
    return validatePlanImportJson(json);
  } catch {
    return { ok: false as const, error: "Could not decode share data." };
  }
}

export function parseHashPlanFragment(hash: string): string | null {
  const h = hash.replace(/^#/, "");
  if (!h.startsWith(PLAN_SHARE_HASH_PREFIX)) return null;
  const rest = h.slice(PLAN_SHARE_HASH_PREFIX.length);
  return rest.length > 0 ? rest : null;
}

export function buildPlanShareUrl(encodedPayload: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}${window.location.search}#${PLAN_SHARE_HASH_PREFIX}${encodedPayload}`;
}
