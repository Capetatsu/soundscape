// QueueManager — owns order, shuffle (Fisher-Yates, preserve current),
// repeat, play-next, history. Framework-free.
import type { TrackRef } from '../providers/types';

export type RepeatMode = 'off' | 'all' | 'one';

export interface QueueItem {
  track: TrackRef;
  contextUri: string | null;
  source: 'spotify' | 'local' | 'subsonic' | 'audius' | 'jamendo' | 'archive' | 'radio';
}

export class QueueManager {
  private items: QueueItem[] = [];
  private index = -1;
  private shuffle = false;
  private order: number[] = [];
  private repeat: RepeatMode = 'off';
  private history: number[] = [];

  setQueue(items: QueueItem[], startIndex = 0): void {
    this.items = items;
    this.index = items.length ? Math.max(0, Math.min(startIndex, items.length - 1)) : -1;
    this.rebuildOrder();
  }

  private rebuildOrder(): void {
    this.order = this.items.map((_, i) => i);
    if (this.shuffle && this.order.length > 1) {
      const cur = this.order[this.index] ?? -1;
      const rest = this.order.filter((i) => i !== cur);
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      this.order = cur >= 0 ? [cur, ...rest] : rest;
    }
  }

  current(): QueueItem | null {
    if (this.index < 0 || this.index >= this.items.length) return null;
    return this.items[this.index];
  }

  next(): QueueItem | null {
    if (!this.items.length) return null;
    if (this.repeat === 'one') return this.current();
    const seq = this.shuffle ? this.order : this.items.map((_, i) => i);
    const curPos = seq.indexOf(this.index);
    if (curPos < seq.length - 1) {
      this.history.push(this.index);
      this.index = seq[curPos + 1];
      return this.current();
    }
    if (this.repeat === 'all') {
      this.history.push(this.index);
      this.index = seq[0];
      return this.current();
    }
    return null;
  }

  prev(): QueueItem | null {
    const last = this.history.pop();
    if (last !== undefined) {
      this.index = last;
      return this.current();
    }
    return this.current();
  }

  playNext(item: QueueItem): void {
    if (this.index < 0) {
      this.items.push(item);
      this.index = 0;
    } else {
      this.items.splice(this.index + 1, 0, item);
    }
    this.rebuildOrder();
  }

  enqueue(item: QueueItem): void {
    this.items.push(item);
    this.rebuildOrder();
  }

  removeAt(i: number): void {
    this.items.splice(i, 1);
    this.history = this.history
      .filter((h) => h !== i)
      .map((h) => (h > i ? h - 1 : h));
    if (this.index >= this.items.length) this.index = this.items.length - 1;
    this.rebuildOrder();
  }

  clear(): void {
    this.items = [];
    this.index = -1;
    this.history = [];
    this.rebuildOrder();
  }

  setShuffle(on: boolean): void {
    this.shuffle = on;
    this.rebuildOrder();
  }
  setRepeat(mode: RepeatMode): void {
    this.repeat = mode;
  }
  getShuffle(): boolean {
    return this.shuffle;
  }
  getRepeat(): RepeatMode {
    return this.repeat;
  }
  getItems(): QueueItem[] {
    return [...this.items];
  }
  getIndex(): number {
    return this.index;
  }
}
