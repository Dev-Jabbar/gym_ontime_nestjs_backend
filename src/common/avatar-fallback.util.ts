/**
 * Backend equivalent of the frontend's getAvatarFallback — same
 * reasoning (single source of truth, format=png forced to avoid
 * next/image's SVG rejection). Direct port of Express's
 * utils/avatarFallback.ts — no design decision here, pure relabeling.
 */
export function getAvatarFallback(name: string, size = 40): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&background=random&color=fff&size=${size}&format=png`;
}
