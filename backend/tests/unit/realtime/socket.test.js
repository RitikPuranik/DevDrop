const EventEmitter = require('events');

jest.mock('socket.io', () => ({
  Server: class extends EventEmitter {
    constructor() { super(); this.rooms = new Map(); }
    to(room) { return { emit: (event, payload) => { this.last = { room, event, payload }; } }; }
    connectClient() {
      const socket = new EventEmitter();
      socket.join = jest.fn();
      socket.leave = jest.fn();
      this.emit('connection', socket);
      return socket;
    }
  },
}));

const realtime = require('../../../src/shared/realtime/socket');

describe('realtime socket', () => {
  it('supports Kashi run subscriptions and emissions', () => {
    const server = new (require('socket.io').Server)();
    realtime.init(server, { allowedOrigins: ['http://localhost:5173'] });
    const client = server.connectClient();
    client.emit('kashi-fix:subscribe', 'run1');
    expect(client.join).toHaveBeenCalledWith('kashi-fix:run1');
    client.emit('kashi-fix:unsubscribe', 'run1');
    expect(client.leave).toHaveBeenCalledWith('kashi-fix:run1');
    realtime.emitToKashiRun('run1', 'kashi-fix:status', { status: 'succeeded' });
    expect(server.last).toEqual({ room: 'kashi-fix:run1', event: 'kashi-fix:status', payload: { status: 'succeeded' } });
  });
});
