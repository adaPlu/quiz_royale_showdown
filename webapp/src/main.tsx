import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './navigation';

import { App } from './App';
import { configureApiClient } from './services/apiClient';
import { cleanupLegacyServiceWorkers } from './serviceWorkerCleanup';
import { useAuthStore } from './stores/authStore';
import './styles.css';

configureApiClient({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => null,
  setTokens: (tokens) => useAuthStore.getState().setTokens(tokens),
  clearAuth: () => useAuthStore.getState().clearAuth(),
});

void cleanupLegacyServiceWorkers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
