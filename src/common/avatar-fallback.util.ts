/**
 * Builds a fallback avatar URL for users without one. The backend counterpart
 * of the frontend's getAvatarFallback: it uses the same service and forces
 * `format=png`, because next/image rejects SVG responses.
 */
export function getAvatarFallback(name: string, size = 40): string {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name,
  )}&background=random&color=fff&size=${size}&format=png`;
}
