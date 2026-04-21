import { useEffect, useState } from 'react';
import { socketService } from '@/services/socketService';

export function useSocketStatus() {
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    return socketService.onStatusChange((status) => {
      setIsReconnecting(status === 'reconnecting' || status === 'disconnected');
    });
  }, []);

  return { isReconnecting };
}
