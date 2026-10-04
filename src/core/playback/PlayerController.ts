// PlayerController — sole writer of PlaybackState.
// Normative (07): phase=playing ONLY when adapter reports real playback
// (SDK paused=false AND position advanced >=250ms, or <audio> playing+timeupdate).
// HTTP/SDK command success sets cmdAccepted, never playing.

export type PlayPhase = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export interface PlayCommand {
  id: string;
  type: 'play' | 'pause' | 'seek' | 'next' | 'prev';
  sentAt: number;
  accepted: boolean;
}

export interface ControllerState {
  phase: PlayPhase;
  cmd: PlayCommand | null;
  itemUri: string | null;
  positionMs: number;
  positionAt: number;
  durationMs: number;
  volume: number;
  error: { code: string; message: string } | null;
  ladder: string[];
}

const initial: ControllerState = {
  phase: 'idle', cmd: null, itemUri: null,
  positionMs: 0, positionAt: 0, durationMs: 0,
  volume: 0.8, error: null, ladder: ['INITIALIZED']
};

export class PlayerController {
  private state: ControllerState = { ...initial, ladder: [...initial.ladder] };
  private listeners = new Set<(s: ControllerState) => void>();
  private lastPositionMs = 0;
  private lastAdvanceAt = 0;

  subscribe(fn: (s: ControllerState) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(): ControllerState {
    return { ...this.state, ladder: [...this.state.ladder] };
  }

  private emit(): void {
    const s = this.snapshot();
    this.listeners.forEach((fn) => fn(s));
  }

  private push(step: string): void {
    this.state.ladder = [...this.state.ladder.slice(-9), step];
  }

  commandSent(type: PlayCommand['type'], itemUri: string | null): PlayCommand {
    const cmd: PlayCommand = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, sentAt: Date.now(), accepted: false };
    this.state = { ...this.state, cmd, itemUri: itemUri ?? this.state.itemUri, phase: 'loading', error: null };
    this.push('COMMAND SENT');
    this.emit();
    return cmd;
  }

  commandAccepted(cmdId: string): void {
    if (this.state.cmd?.id !== cmdId) return;
    this.state = { ...this.state, cmd: { ...this.state.cmd, accepted: true }, phase: 'ready' };
    this.push('COMMAND ACCEPTED');
    this.emit();
  }

  // Call only from real adapter events.
  reportPlayback(paused: boolean, positionMs: number, durationMs: number): void {
    const now = Date.now();
    if (!paused && positionMs > this.lastPositionMs + 200) {
      this.lastAdvanceAt = now;
    }
    this.lastPositionMs = positionMs;
    const advanced = now - this.lastAdvanceAt < 5000 && positionMs > 250;
    let phase: PlayPhase = this.state.phase;
    if (!paused && advanced) phase = 'playing';
    else if (!paused) phase = 'buffering';
    else phase = this.state.itemUri ? 'paused' : 'idle';
    this.state = {
      ...this.state, phase,
      positionMs, positionAt: now,
      durationMs: durationMs || this.state.durationMs
    };
    if (phase === 'playing' && !this.state.ladder.includes('PLAYING')) this.push('PLAYING');
    this.emit();
  }

  reportError(code: string, message: string): void {
    this.state = { ...this.state, phase: 'error', error: { code, message } };
    this.push(`ERROR:${code}`);
    this.emit();
  }

  reportEnded(): void {
    this.state = { ...this.state, phase: 'ended' };
    this.push('ENDED');
    this.emit();
  }

  reset(): void {
    this.state = { ...initial, ladder: ['INITIALIZED'] };
    this.lastPositionMs = 0;
    this.lastAdvanceAt = 0;
    this.emit();
  }
}
