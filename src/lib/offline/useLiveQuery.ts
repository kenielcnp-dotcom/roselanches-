// Consulta ao banco local que se atualiza sozinha quando os dados mudam
// (liveQuery do Dexie), sem dependência extra.
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

export function useLiveQuery<T>(query: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [value, setValue] = useState<{ deps: readonly unknown[]; value: T } | undefined>(undefined);

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (v) => setValue({ deps, value: v }),
      error: (e: unknown) => console.error('Erro ao ler o banco do celular', e),
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // Enquanto a consulta nova não responde, não mostra o resultado da antiga.
  return value && sameDeps(value.deps, deps) ? value.value : undefined;
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}
