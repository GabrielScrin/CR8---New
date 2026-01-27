import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './cr8.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

try {
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </React.StrictMode>
  );
} catch (error) {
  console.error("Erro ao iniciar aplicação:", error);
  root.render(
    <div style={{ padding: 20, color: 'red', fontFamily: 'sans-serif' }}>
      <h1>Erro ao carregar o sistema</h1>
      <pre>{error instanceof Error ? error.message : JSON.stringify(error)}</pre>
    </div>
  );
}
