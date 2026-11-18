import { afterEach, expect, it, vi } from 'vitest';
import { joinStream } from '../src/voiceStream';

const sdk = vi.hoisted(() => ({
  call: vi.fn(),
  disconnectUser: vi.fn(),
}));
vi.mock('@stream-io/video-client', () => ({ StreamVideoClient: class { call = sdk.call; disconnectUser = sdk.disconnectUser; } }));
afterEach(() => vi.unstubAllGlobals());

it('obnoví pozastavený zvuk cez SDK a pri návrate ponechá vlastný mikrofón stlmený', async () => {
  const participant = { sessionId: 'remote-session', userId: 'remote' };
  const unsubscribe = vi.fn();
  const unbind = vi.fn();
  const call = {
    join: vi.fn(), leave: vi.fn(), resumeAudio: vi.fn().mockResolvedValue(undefined),
    bindAudioElement: vi.fn(() => unbind), blockedAudioTracker: { isBlocked: () => true },
    state: {
      participants$: { subscribe: (next: (list: typeof participant[]) => void) => { next([participant]); return { unsubscribe }; } },
      findParticipantBySessionId: () => participant,
    },
    microphone: { disable: vi.fn(), enable: vi.fn(), state: { status$: { subscribe: () => ({ unsubscribe }) } } },
  };
  sdk.call.mockReturnValue(call);
  vi.stubGlobal('Audio', class { style = {}; setAttribute() {} pause() {} remove() {} });
  vi.stubGlobal('document', { body: { appendChild: vi.fn() } });
  const hooks = { peer: vi.fn(), gone: vi.fn(), mic: vi.fn(), volume: vi.fn(() => 1) };
  const auth = { apiKey: 'key', token: 'token', userId: 'me', callType: 'default', callId: 'room' };
  const { session } = await joinStream(auth, hooks, ['remote'], true, () => true);
  try {
    expect(call.microphone.enable).not.toHaveBeenCalled();
    expect(session.playbackBlocked()).toBe(true);
    session.unlock();
    expect(call.resumeAudio).toHaveBeenCalledOnce();
    hooks.volume.mockReturnValue(0);
    session.apply();
    expect(unbind).toHaveBeenCalledOnce();
    expect(session.playbackBlocked()).toBe(false);
    hooks.volume.mockReturnValue(1);
    session.apply();
    expect(call.bindAudioElement).toHaveBeenCalledTimes(2);
  } finally {
    await session.leave();
  }
});
