// Telas carregadas só quando abertas (relatórios, portal, equipe…), para o
// primeiro acesso pelo 4G ser mais leve. O app instalado guarda todas as
// partes no celular (service worker), então isso não afeta o uso sem internet.
import { lazy, Suspense, type ComponentType } from 'react';
import { LoadingState } from '@/components/States';

const RELOAD_KEY = 'ldr.chunk-reload';

/**
 * Se o app ficou aberto durante uma atualização, a parte antiga da tela pode
 * não existir mais. Recarrega uma vez para pegar a versão nova (a fila de
 * vendas fica no IndexedDB e não se perde).
 */
async function loadWithReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    const mod = await load();
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* sem armazenamento: nada a limpar */
    }
    return mod;
  } catch (error) {
    let alreadyTried = true;
    try {
      alreadyTried = sessionStorage.getItem(RELOAD_KEY) === '1';
      if (!alreadyTried) sessionStorage.setItem(RELOAD_KEY, '1');
    } catch {
      /* sem armazenamento: não arrisca recarregar em laço */
    }
    if (alreadyTried) throw error;
    window.location.reload();
    return new Promise<T>(() => {});
  }
}

export function lazyPage<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K): ComponentType {
  const Page = lazy(async (): Promise<{ default: ComponentType }> => ({ default: (await loadWithReload(load))[name] }));
  return function LazyPage() {
    return (
      <Suspense fallback={<LoadingState />}>
        <Page />
      </Suspense>
    );
  };
}
