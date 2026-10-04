// Radio Browser provider (P-D): live community radio. No key, public-domain data.
// Honest constraints: LIVE streams (unskippable, no on-demand), HTTPS-only (browser
// mixed-content policy), non-HLS (element playback). Click counting is API etiquette.
// Docs: https://www.radio-browser.info (verified Oct 2026).

const SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
];
const UA = 'Soundscape/2.0';

export interface RadioStation {
  uuid: string;
  name: string;
  streamUrl: string;
  codec: string;
  bitrate: number;
  country: string;
  tags: string;
  favicon: string | null;
  votes: number;
}

interface RawStation {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  codec?: string;
  bitrate?: number;
  country?: string;
  tags?: string;
  favicon?: string;
  votes?: number;
  hls?: number;
}

async function get<T>(path: string): Promise<T> {
  let lastError: unknown = null;
  for (const base of SERVERS) {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(12000),
        headers: { 'User-Agent': UA, Accept: 'application/json' }
      });
      if (!res.ok) throw new Error(`Radio HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Radio servers unreachable');
}

function mapStation(raw: RawStation): RadioStation | null {
  const url = raw.url_resolved || '';
  // Browser reality: HTTPS direct streams only, no HLS playlists.
  if (!raw.stationuuid || !raw.name?.trim() || !/^https:\/\//i.test(url)) return null;
  if (raw.hls === 1) return null;
  return {
    uuid: raw.stationuuid,
    name: raw.name.trim(),
    streamUrl: url,
    codec: raw.codec || 'MP3',
    bitrate: raw.bitrate || 0,
    country: raw.country || '',
    tags: raw.tags || '',
    favicon: raw.favicon || null,
    votes: raw.votes || 0
  };
}

const rankCodec = (codec: string): number => {
  const c = codec.toUpperCase();
  if (c.includes('MP3')) return 0;
  if (c.includes('AAC')) return 1;
  if (c.includes('OGG')) return 2;
  return 3;
};

export async function radioSearchStations(query: string, limit = 12): Promise<RadioStation[]> {
  const data = await get<RawStation[]>(
    `/json/stations/search?name=${encodeURIComponent(query.slice(0, 60))}&hidebroken=true&limit=${limit * 3}`
  );
  return data
    .map(mapStation)
    .filter((s): s is RadioStation => !!s)
    .sort((a, b) => rankCodec(a.codec) - rankCodec(b.codec) || b.votes - a.votes)
    .slice(0, limit);
}

export async function radioTopStations(limit = 12): Promise<RadioStation[]> {
  const data = await get<RawStation[]>(`/json/stations/topvote/${limit * 3}`);
  return data
    .map(mapStation)
    .filter((s): s is RadioStation => !!s)
    .slice(0, limit);
}

export async function radioStationsByTag(tag: string, limit = 12): Promise<RadioStation[]> {
  const data = await get<RawStation[]>(
    `/json/stations/bytag/${encodeURIComponent(tag)}?hidebroken=true&limit=${limit * 3}`
  );
  return data
    .map(mapStation)
    .filter((s): s is RadioStation => !!s)
    .sort((a, b) => b.votes - a.votes)
    .slice(0, limit);
}

/** Click counting (fire-and-forget): keeps the community directory accurate. */
export function radioCountClick(uuid: string): void {
  const path = `/json/url/${encodeURIComponent(uuid)}`;
  (async () => {
    for (const base of SERVERS) {
      try {
        await fetch(`${base}${path}`, {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: { 'User-Agent': UA }
        });
        return;
      } catch {}
    }
  })();
}
