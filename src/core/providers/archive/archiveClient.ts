// Internet Archive provider (P-C): Live Music Archive (etree) + netlabels.
// No key, no auth. Recordings resolve to per-track files; VBR MP3 preferred for
// streaming (FLAC originals can be 40MB+/track — playable but heavy).
// Docs: https://archive.org/advancedsearch.php, https://archive.org/metadata/{id}

export interface ArchiveRecording {
  identifier: string;
  title: string;
  artist: string;
  date: string | null;
  downloads: number;
}

export interface ArchiveTrack {
  identifier: string;
  fileName: string;
  title: string;
  format: string;
  size: number;
  url: string;
}

interface Doc {
  identifier?: string;
  title?: string | string[];
  creator?: string | string[];
  date?: string;
  downloads?: string | number;
}

interface RawFile {
  name?: string;
  format?: string;
  size?: string | number;
  length?: string | number;
}

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return v ?? '';
}

const SEARCH_SCOPE = 'collection:(etree OR netlabels)';

export async function archiveSearchRecordings(query: string, limit = 6): Promise<ArchiveRecording[]> {
  const q = `${query.slice(0, 80)} AND mediatype:audio AND ${SEARCH_SCOPE}`;
  // NOTE: fl[] is a repeated param — assembled manually.
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}` +
    `&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&fl[]=downloads` +
    `&rows=${Math.min(10, Math.max(1, limit))}&output=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`Archive HTTP ${res.status}`);
  const data = (await res.json()) as { response?: { docs?: Doc[] } };
  return (data.response?.docs ?? [])
    .filter((d) => d.identifier)
    .map((d) => ({
      identifier: String(d.identifier),
      title: first(d.title) || String(d.identifier),
      artist: first(d.creator) || 'Unknown artist',
      date: d.date ?? null,
      downloads: Number(d.downloads ?? 0) || 0
    }));
}

const STREAM_PREFERENCE = ['VBR MP3', 'MP3', 'Ogg Vorbis', 'FLAC', 'M4A', 'Apple Lossless'];

function humanizeFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  return base
    .replace(/^[0-9]+[.\-_ ]+/, '')
    .replace(/[_+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || base;
}

function stem(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

export function archiveFileUrl(identifier: string, fileName: string): string {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName).replace(/%2F/g, '/')}`;
}

export async function archiveResolveTracks(identifier: string): Promise<ArchiveTrack[]> {
  const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error(`Archive HTTP ${res.status}`);
  const data = (await res.json()) as { files?: RawFile[] };
  const audio = (data.files ?? []).filter(
    (f) => f.name && /\.(mp3|ogg|oga|flac|m4a)$/i.test(f.name) && Number(f.size ?? 0) > 100_000
  );
  // Dedupe stems (01.Song.mp3 + 01.Song.ogg + 01.Song.flac → one track, best stream format).
  const byStem = new Map<string, RawFile[]>();
  for (const f of audio) {
    const s = stem(f.name as string);
    const list = byStem.get(s) ?? [];
    list.push(f);
    byStem.set(s, list);
  }
  const rank = (format: string | undefined): number => {
    const i = STREAM_PREFERENCE.indexOf(format ?? '');
    return i < 0 ? 99 : i;
  };
  const tracks: ArchiveTrack[] = [];
  for (const [, variants] of byStem) {
    variants.sort((a, b) => rank(a.format) - rank(b.format));
    const best = variants[0];
    if (!best?.name) continue;
    tracks.push({
      identifier,
      fileName: best.name,
      title: humanizeFileName(best.name),
      format: best.format ?? 'audio',
      size: Number(best.size ?? 0),
      url: archiveFileUrl(identifier, best.name)
    });
  }
  // Keep filename order (track order) — stems sort lexicographically with track numbers.
  tracks.sort((a, b) => a.fileName.localeCompare(b.fileName));
  return tracks;
}

export function archiveToRef(identifier: string, index: number): {
  id: string;
  uri: string;
} {
  return { id: `archive-${identifier}-${index}`, uri: `archive:track:${identifier}:${index}` };
}
