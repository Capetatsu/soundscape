// Soundscape-native playlists (P12): fully local, independent of Spotify.
// accountId 'local'. Positions are dense (0..n-1), rewritten on reorder/remove.
import { db, type DbTrack } from '../db/database';
import type { SpotifyTrack } from '../../types';
import { dbTrackToUi } from '../sync/toUi';

export const LOCAL_ACCOUNT = 'local';

function newPlaylistUri(): string {
  return `local:playlist:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function trackToDb(t: SpotifyTrack): DbTrack {
  return {
    uri: t.uri,
    provider: t.uri.split(':')[0] || 'unknown',
    name: t.name,
    albumUri: null,
    durationMs: t.duration_ms,
    explicit: t.explicit,
    artistsJson: JSON.stringify((t.artists ?? []).map((a) => ({ name: a.name }))),
    imageUrl: t.album?.images?.[0]?.url ?? null,
    updatedAt: Date.now()
  };
}

export async function listLocalPlaylists(): Promise<{ uri: string; name: string; count: number; updatedAt: number }[]> {
  const all = await db.getPlaylists();
  const mine = all.filter((p) => p.accountId === LOCAL_ACCOUNT && !p.removedAt);
  const out = [];
  for (const p of mine) {
    const rows = await db.getPlaylistTrackRows(p.uri);
    out.push({ uri: p.uri, name: p.name, count: rows.length, updatedAt: p.syncedAt ?? 0 });
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createLocalPlaylist(name: string): Promise<string> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error('Playlist name is empty');
  const uri = newPlaylistUri();
  await db.putPlaylists([{
    uri, accountId: LOCAL_ACCOUNT, name: clean, description: null,
    ownerId: null, isOwner: true, collaborative: false, imageUrl: null,
    snapshotId: null, trackTotal: 0, itemsAvailable: true, syncedAt: Date.now(), removedAt: null
  }]);
  return uri;
}

export async function renameLocalPlaylist(uri: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80);
  if (!clean) throw new Error('Playlist name is empty');
  const all = await db.getPlaylists();
  const p = all.find((x) => x.uri === uri && x.accountId === LOCAL_ACCOUNT);
  if (!p) throw new Error('Playlist not found');
  await db.putPlaylists([{ ...p, name: clean, syncedAt: Date.now() }]);
}

export async function deleteLocalPlaylist(uri: string): Promise<void> {
  const all = await db.getPlaylists();
  const p = all.find((x) => x.uri === uri && x.accountId === LOCAL_ACCOUNT);
  if (!p) return;
  await db.putPlaylists([{ ...p, removedAt: Date.now() }]);
  await db.replacePlaylistItems(uri, []);
}

export async function addTrackToPlaylist(playlistUri: string, track: SpotifyTrack): Promise<'added' | 'duplicate'> {
  const rows = await db.getPlaylistTrackRows(playlistUri);
  if (rows.some((r) => r.trackUri === track.uri)) return 'duplicate';
  await db.putTrack(trackToDb(track));
  await db.replacePlaylistItems(
    playlistUri,
    [...rows, { playlistUri, position: rows.length, trackUri: track.uri, addedAt: new Date().toISOString() }]
  );
  return 'added';
}

export async function removeTrackFromPlaylist(playlistUri: string, trackUri: string): Promise<void> {
  const rows = await db.getPlaylistTrackRows(playlistUri);
  const kept = rows.filter((r) => r.trackUri !== trackUri);
  await db.replacePlaylistItems(
    playlistUri,
    kept.map((r, i) => ({ ...r, position: i }))
  );
}

export async function moveTrackInPlaylist(playlistUri: string, from: number, to: number): Promise<void> {
  const rows = await db.getPlaylistTrackRows(playlistUri);
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return;
  const [moved] = rows.splice(from, 1);
  rows.splice(to, 0, moved);
  await db.replacePlaylistItems(
    playlistUri,
    rows.map((r, i) => ({ ...r, position: i }))
  );
}

export interface LocalPlaylistDetail {
  uri: string;
  name: string;
  tracks: SpotifyTrack[];
  missing: number;
}

export async function getLocalPlaylistDetail(uri: string): Promise<LocalPlaylistDetail> {
  const all = await db.getPlaylists();
  const p = all.find((x) => x.uri === uri && x.accountId === LOCAL_ACCOUNT && !x.removedAt);
  if (!p) throw new Error('Playlist not found');
  const rows = await db.getPlaylistTrackRows(uri);
  const metas = await db.getTracksByUris(rows.map((r) => r.trackUri));
  const byUri = new Map(metas.map((m) => [m.uri, m]));
  const tracks: SpotifyTrack[] = [];
  let missing = 0;
  for (const r of rows) {
    const m = byUri.get(r.trackUri);
    if (m) tracks.push(dbTrackToUi(m));
    else missing += 1;
  }
  return { uri, name: p.name, tracks, missing };
}
