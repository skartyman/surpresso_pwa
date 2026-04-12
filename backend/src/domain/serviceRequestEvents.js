import { EventEmitter } from 'node:events';

export function createServiceRequestEventBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(200);

  return {
    emitChange(payload = {}) {
      emitter.emit('change', {
        type: payload.type || 'service_request_changed',
        requestId: payload.requestId || null,
        status: payload.status || null,
        at: new Date().toISOString(),
      });
    },
    onChange(listener) {
      emitter.on('change', listener);
      return () => emitter.off('change', listener);
    },
  };
}
