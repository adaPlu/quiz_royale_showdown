import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockSocketEmit, mockSocketOn, mockSocketDisconnect, mockSocketConnected, mockIo } =
  vi.hoisted(() => {
    const mockSocketEmit = vi.fn();
    const mockSocketOn = vi.fn();
    const mockSocketDisconnect = vi.fn();
    // connected is a property — we use a mutable ref so tests can flip it
    let _connected = false;
    const mockSocketConnected = {
      get value() {
        return _connected;
      },
      set value(v: boolean) {
        _connected = v;
      },
    };

    const mockIo = vi.fn();

    return { mockSocketEmit, mockSocketOn, mockSocketDisconnect, mockSocketConnected, mockIo };
  });

// ─── Module mock ──────────────────────────────────────────────────────────────

vi.mock('socket.io-client', () => ({
  io: mockIo,
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

// We import the module-level singleton after the mock is registered.
// Because socketService holds internal state we reset it between tests by
// calling disconnect() and re-importing via the same cached module reference.
import { socketService } from '../socketService';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fresh fake socket and wire mockIo to return it. */
function makeFakeSocket() {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

  const fakeSocket = {
    emit: mockSocketEmit,
    disconnect: mockSocketDisconnect,
    get connected() {
      return mockSocketConnected.value;
    },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      mockSocketOn(event, handler);
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    },
    /** Test helper — trigger a socket event by name. */
    _trigger: (event: string, ...args: unknown[]) => {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };

  mockIo.mockReturnValue(fakeSocket);
  return fakeSocket;
}

// ─── Reset state between tests ────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockSocketConnected.value = false;
  // Disconnect clears all internal state on the singleton
  socketService.disconnect();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('socketService', () => {
  // TC1 — connect idempotency
  it('calls io() only once when connect() is invoked twice with the same token', () => {
    const fakeSocket = makeFakeSocket();
    mockSocketConnected.value = false;

    socketService.connect('tok');
    // Simulate the socket being connected after first call
    mockSocketConnected.value = true;
    // Wire the mock to return the same socket on a second potential call
    mockIo.mockReturnValue(fakeSocket);

    socketService.connect('tok');

    expect(mockIo).toHaveBeenCalledTimes(1);
  });

  // TC2 — connect handler re-emits room:join on reconnect
  it('re-emits room:join with the stored roomCode when the socket connect event fires', () => {
    const fakeSocket = makeFakeSocket();

    socketService.connect('tok');
    socketService.setActiveRoom('roomId', 'CODE');

    // Simulate the socket emitting its own 'connect' event (e.g. after reconnect)
    fakeSocket._trigger('connect');

    expect(mockSocketEmit).toHaveBeenCalledWith('message', {
      type: 'room:join',
      version: 'v1',
      payload: { roomCode: 'CODE' },
    });
  });

  // TC3 — handleMessage parse failure is silent
  it('does not invoke any handler and does not throw when the message fails schema parsing', () => {
    const fakeSocket = makeFakeSocket();

    socketService.connect('tok');

    const handler = vi.fn();
    socketService.on('room:state_sync', handler);

    expect(() => {
      // Feed a malformed envelope — type is valid but payload is invalid
      fakeSocket._trigger('message', {
        type: 'room:state_sync',
        version: 'v1',
        payload: { room: { totally: 'wrong' } },
      });
    }).not.toThrow();

    expect(handler).not.toHaveBeenCalled();
  });

  // TC4 — on / unsubscribe lifecycle
  it('does not invoke the handler after the returned unsubscribe function is called', () => {
    const fakeSocket = makeFakeSocket();

    socketService.connect('tok');

    const handler = vi.fn();
    const unsubscribe = socketService.on('error', handler);

    // Verify it would fire before unsubscribing
    fakeSocket._trigger('message', {
      type: 'error',
      version: 'v1',
      payload: { error: 'test error' },
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Now unsubscribe and fire again
    unsubscribe();
    fakeSocket._trigger('message', {
      type: 'error',
      version: 'v1',
      payload: { error: 'test error again' },
    });

    expect(handler).toHaveBeenCalledTimes(1); // still 1, not called again
  });

  // TC5 — disconnect clears activeRoomCode
  it('does NOT re-emit room:join after disconnect clears the active room code', () => {
    makeFakeSocket();

    socketService.connect('tok');
    socketService.setActiveRoom('roomId', 'CODE');

    // Disconnect — this should clear activeRoomCode
    socketService.disconnect();

    // Re-connect with a new socket
    const newFakeSocket = makeFakeSocket();
    socketService.connect('tok');

    // Simulate connect event on the new socket
    newFakeSocket._trigger('connect');

    // room:join should NOT have been emitted because activeRoomCode was cleared
    const roomJoinCalls = mockSocketEmit.mock.calls.filter(
      (call) => call[1]?.type === 'room:join',
    );
    expect(roomJoinCalls).toHaveLength(0);
  });
});
