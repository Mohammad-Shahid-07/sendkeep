/**
 * File-type awareness for SendKeep files and clips.
 * Maps file path/extension to category, tint color, and label.
 */

export type FileKind =
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'text'
  | 'code'
  | 'audio'
  | 'video'
  | 'image'
  | 'executable'
  | 'apk'
  | 'font'
  | 'database'
  | 'markdown'
  | 'folder'
  | 'file';

export interface FileKindInfo {
  kind: FileKind;
  label: string;
  color: string;
}

const EXT_MAP: Record<string, FileKind> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', docm: 'word', odt: 'word', rtf: 'word', pages: 'word',
  xls: 'excel', xlsx: 'excel', xlsm: 'excel', csv: 'excel', ods: 'excel', numbers: 'excel',
  ppt: 'powerpoint', pptx: 'powerpoint', pptm: 'powerpoint', odp: 'powerpoint', key: 'powerpoint',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive', iso: 'archive', dmg: 'archive',
  txt: 'text', log: 'text', rtf2: 'text',
  md: 'markdown', markdown: 'markdown', mdown: 'markdown',
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', json: 'code', html: 'code', css: 'code', scss: 'code',
  py: 'code', java: 'code', c: 'code', cpp: 'code', cs: 'code', go: 'code', rs: 'code', rb: 'code',
  php: 'code', sh: 'code', yml: 'code', yaml: 'code', xml: 'code', vue: 'code', svelte: 'code',
  sql: 'database', db: 'database', sqlite: 'database', sqlite3: 'database',
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font', eot: 'font',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', m4a: 'audio', wma: 'audio',
  mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', wmv: 'video', flv: 'video', webm: 'video', m4v: 'video',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', svg: 'image', avif: 'image', ico: 'image',
  tif: 'image', tiff: 'image', jfif: 'image', pjpeg: 'image', pjp: 'image',
  apk: 'apk', aab: 'apk', xapk: 'apk',
  exe: 'executable', msi: 'executable', bat: 'executable', cmd: 'executable', ps1: 'executable', app: 'executable', dll: 'executable',
  folder: 'folder',
};

const KIND_INFO: Record<FileKind, FileKindInfo> = {
  pdf: { kind: 'pdf', label: 'PDF', color: '#EF4444' },
  word: { kind: 'word', label: 'Word', color: '#3B82F6' },
  excel: { kind: 'excel', label: 'Excel', color: '#10B981' },
  powerpoint: { kind: 'powerpoint', label: 'Slides', color: '#F97316' },
  archive: { kind: 'archive', label: 'Archive', color: '#F59E0B' },
  text: { kind: 'text', label: 'Text', color: '#22C55E' },
  markdown: { kind: 'markdown', label: 'Markdown', color: '#818CF8' },
  code: { kind: 'code', label: 'Code', color: '#38BDF8' },
  database: { kind: 'database', label: 'Database', color: '#06B6D4' },
  font: { kind: 'font', label: 'Font', color: '#F43F5E' },
  audio: { kind: 'audio', label: 'Audio', color: '#A855F7' },
  video: { kind: 'video', label: 'Video', color: '#64748B' },
  image: { kind: 'image', label: 'Image', color: '#FB923C' },
  apk: { kind: 'apk', label: 'Android APK', color: '#10B981' },
  executable: { kind: 'executable', label: 'App', color: '#6366F1' },
  folder: { kind: 'folder', label: 'Folder', color: '#FBBF24' },
  file: { kind: 'file', label: 'File', color: '#94A3B8' },
};

/** Extract lowercase extension (no dot) from a path or file name. */
export function extOf(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot + 1).toLowerCase();
}

/** Resolve file path or filename to display metadata. */
export function getFileKind(path: string, isDirectory?: boolean): FileKindInfo {
  if (isDirectory) {
    return KIND_INFO.folder;
  }
  const ext = extOf(path);
  const kind = EXT_MAP[ext] ?? 'file';
  return KIND_INFO[kind];
}

/** Resolve from extracted extension string. */
export function getFileKindByExt(ext: string, isDirectory?: boolean): FileKindInfo {
  if (isDirectory || ext.toLowerCase() === 'folder') {
    return KIND_INFO.folder;
  }
  const kind = EXT_MAP[ext.toLowerCase()] ?? 'file';
  return KIND_INFO[kind];
}
