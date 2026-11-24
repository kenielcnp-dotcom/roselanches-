import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router/dom';
import { ToastProvider } from '@/components/Toast';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { configProblem } from './config';
import { ConnectionProvider } from './ConnectionProvider';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true },
    // Escritas nunca "esperam a internet" escondidas: ou vão para a fila do
    // celular (vendas) ou falham na hora com mensagem clara.
    mutations: { retry: false, networkMode: 'always' },
  },
});

export function App() {
  const problem = configProblem();
  if (problem) {
    return (
      <main role="alert" className="mx-auto max-w-md px-4 py-16">
        <h1 className="text-2xl font-black text-danger">Configuração incompleta</h1>
        <p className="mt-3 text-brown">{problem}</p>
      </main>
    );
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider>
        <AuthProvider>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </AuthProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  );
}
