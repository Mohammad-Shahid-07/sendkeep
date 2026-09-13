/**
 * Formatting helpers for SendKeep cards, sizes, and timestamps.
 */

export function previewText(text: string, max = 160): string {
  if (!text) return '';
  const head = text.length > max * 4 ? text.slice(0, max * 4) : text;
  const single = head.replace(/\s+/g, ' ').trim();
  if (single.length <= max) return single;
  return single.slice(0, max - 1) + '…';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function basename(p: string): string {
  const norm = p.replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico|tiff?|jfif|pjpeg|pjp)$/i;
export function isImagePath(p: string): boolean {
  return IMG_EXT.test(p);
}
