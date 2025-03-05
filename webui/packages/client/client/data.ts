import type { ClientConfig, Events, WebSocket } from '@cordisjs/plugin-webui';
import type { Promisify } from 'cosmokit';
import { markRaw, ref } from 'vue';
import type { Context } from './context';
import { root } from '.';

declare const CLIENT_CONFIG: ClientConfig;
export const global = CLIENT_CONFIG;

export const event = ref<EventSource>();
export const clientId = ref<number>();

export function send<T extends keyof Events>(
  type: T,
  ...args: Parameters<Events[T]>
): Promisify<ReturnType<Events[T]>>;
export async function send(type: string, ...args: any[]) {
  if (global.static) {
    console.debug('[request]', type, ...args);
    const result = root.webui.listeners[type]?.(...args);
    console.debug('[response]', result);
    return result;
  }
  if (!event.value) return;
  console.debug('[request]', type, ...args);
  const response = await fetch(`${global.endpoint}/${type}`, {
    method: 'POST',
    body: JSON.stringify(args[0]),
    headers: new Headers({
      'Content-Type': 'application/json',
      'X-Client-ID': clientId.value ?? '',
    }),
  });
  if (!response.ok) {
    throw new Error(response.statusText);
  }
  const result = await response.json();
  console.debug('[response]', result);
  return result;
}

export function connect(ctx: Context, callback: () => EventSource) {
  const value = callback();

  value.onmessage = console.log

  let closeTimer: number;
  const refresh = () => {
    if (!global.heartbeat) return;

    clearTimeout(closeTimer);
    closeTimer = +setTimeout(() => {
      value?.close();
    }, global.heartbeat.timeout);
  };

  const reconnect = () => {
    event.value = undefined;
    console.log('[cordis] events disconnected, will retry in 1s...');
    setTimeout(() => {
      connect(ctx, callback).then(location.reload, () => {
        console.log('[cordis] events disconnected, will retry in 1s...');
      });
    }, 1000);
  };

  value.addEventListener('entry:init', (ev) => {
    ctx.emit('entry:init', JSON.parse(ev.data))
  })
  value.addEventListener('message', (ev) => {
    refresh();
    const data = JSON.parse(ev.data);
    if (data.type !== 'heartbeat')
      console.debug('↓%c', 'color:purple', data.type, data.body);

    ctx.emit(data.type, data.body);
  });

  value.addEventListener('close', reconnect);

  return new Promise<Event>((resolve, reject) => {
    value.addEventListener('open', (ev) => {
      event.value = markRaw(value);
      resolve(ev);
    });
    value.addEventListener('error', reject);
  });
}
