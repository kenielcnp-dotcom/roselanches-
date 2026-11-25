import { CloudOff } from 'lucide-react';
import { formatDateTime } from '@/domain/period';
import { cachedAt } from '@/lib/offline/fallback';

/** Aviso de que a tela mostra a cópia guardada no celular (sem conexão com o servidor). */
export function CachedNotice({ data }: { data: unknown }) {
  const at = cachedAt(data);
  if (at === null) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-2xl bg-peach px-4 py-3 text-sm font-semibold text-brown">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-orange-darker" aria-hidden="true" />
      Sem conexão com o servidor. Mostrando os dados guardados no celular em {formatDateTime(new Date(at))}.
    </p>
  );
}
