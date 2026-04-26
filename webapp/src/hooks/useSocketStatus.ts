import { useEffect, useState } from 'react';
import { socketService } from '@/services/socketService';

export function useSocketStatus() {
  const [connected, setConnected] = useState(() => socketService.isConnected());

  useEffect(() => {
    // Sync with current state on mount
    setConnected(socketService.isConnected());
    return socketService.onConnectionChange(setConnected);
  }, []);

  return { connected, reconnecting: !connected };
}
