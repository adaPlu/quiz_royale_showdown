import { useEffect, useState } from 'react';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/stores/authStore';

export type PushState = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

type PushSupportEnvironment = {
  navigator?: Navigator;
  window?: Window & typeof globalThis;
  notification?: typeof Notification;
};

function isPushBackendEnabled(): boolean {
  const importMetaEnv = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env;
  const processEnv = (globalThis as unknown as {
    process?: { env?: Record<string, string | boolean | undefined> };
  }).process?.env;

  return importMetaEnv?.VITE_PUSH_BACKEND_ENABLED === 'true' || processEnv?.VITE_PUSH_BACKEND_ENABLED === 'true';
}

export function getInitialPushState({
  navigator: navigatorRef = globalThis.navigator,
  window: windowRef = globalThis.window,
  notification = globalThis.Notification,
}: PushSupportEnvironment = {}): PushState {
  if (!isPushBackendEnabled()) {
    return 'unsupported';
  }

  if (!navigatorRef?.serviceWorker || !windowRef || !('PushManager' in windowRef) || !notification) {
    return 'unsupported';
  }

  return notification.permission === 'denied' ? 'denied' : 'unsubscribed';
}

async function getVapidKey(): Promise<string> {
  const res = await api.get<{ key: string }>('/push/vapid-public-key');
  return res.data.key;
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

export function useWebPush() {
  const user = useAuthStore((s) => s.user);
  const [pushState, setPushState] = useState<PushState>('unsubscribed');

  useEffect(() => {
    setPushState(getInitialPushState());
  }, []);

  const subscribe = async () => {
    if (!isPushBackendEnabled()) return;
    const currentPushState = getInitialPushState();
    if (currentPushState === 'unsupported' || currentPushState === 'denied') {
      setPushState(currentPushState);
      return;
    }
    if (!user || pushState === 'unsupported' || pushState === 'denied' || !globalThis.Notification) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPushState('denied'); return; }

      const vapidKey = await getVapidKey();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      await api.post('/push/subscribe', { subscription: subscription.toJSON() });
      setPushState('subscribed');
    } catch {
      // permission denied or subscribe failed — silently ignore
    }
  };

  const unsubscribe = async () => {
    if (!isPushBackendEnabled()) return;
    const currentPushState = getInitialPushState();
    if (currentPushState === 'unsupported') {
      setPushState(currentPushState);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.delete('/push/subscribe', { data: { subscription: subscription.toJSON() } });
        await subscription.unsubscribe();
      }
      setPushState('unsubscribed');
    } catch { /* ignore */ }
  };

  return { pushState, subscribe, unsubscribe };
}
