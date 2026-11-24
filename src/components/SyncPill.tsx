import { AlertTriangle, CheckCircle2, CloudOff, Loader2, Clock, LogIn } from 'lucide-react';
import { formatTime } from '@/domain/period';

export type SyncPillState =
  | { kind: 'checking' }
  | { kind: 'synced'; at: Date | null }
  | { kind: 'sending' }
  | { kind: 'pending'; sales: number; signatures: number }
  | { kind: 'offline'; pending: number }
  | { kind: 'auth'; pending: number }
  | { kind: 'failed'; count: number };

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Pílula do cabeçalho: conexão + sincronização + pendências, num lugar só. */
export function SyncPill({ state }: { state: SyncPillState }) {
  let icon;
  let title: string;
  let detail: string;
  let tone: string;

  switch (state.kind) {
    case 'checking':
      icon = <Loader2 className="h-5 w-5 animate-spin text-brown-soft" />;
      title = 'Conectando…';
      detail = 'Verificando a internet';
      tone = 'text-brown';
      break;
    case 'synced':
      icon = <CheckCircle2 className="h-5 w-5 text-success" strokeWidth={2.5} />;
      title = 'Sincronizado';
      detail = state.at ? `Atualizado às ${formatTime(state.at)}` : 'Tudo enviado';
      tone = 'text-success';
      break;
    case 'sending':
      icon = <Loader2 className="h-5 w-5 animate-spin text-orange-deep" />;
      title = 'Enviando…';
      detail = 'Não feche o app';
      tone = 'text-orange-deep';
      break;
    case 'pending': {
      const parts = [
        state.sales > 0 ? plural(state.sales, 'venda', 'vendas') : null,
        state.signatures > 0 ? plural(state.signatures, 'assinatura', 'assinaturas') : null,
      ].filter(Boolean);
      icon = <Clock className="h-5 w-5 text-orange-deep" strokeWidth={2.5} />;
      title = 'Aguardando envio';
      detail = parts.join(' e ') || 'Operações no celular';
      tone = 'text-orange-deep';
      break;
    }
    case 'offline':
      icon = <CloudOff className="h-5 w-5 text-brown-soft" strokeWidth={2.5} />;
      title = 'Sem internet';
      detail = state.pending > 0 ? `${plural(state.pending, 'venda', 'vendas')} no celular` : 'Vendas ficam salvas no celular';
      tone = 'text-brown';
      break;
    case 'auth':
      icon = <LogIn className="h-5 w-5 text-orange-deep" strokeWidth={2.5} />;
      title = 'Entre de novo';
      detail = state.pending > 0 ? `para enviar ${plural(state.pending, 'venda', 'vendas')}` : 'Sua sessão expirou';
      tone = 'text-orange-deep';
      break;
    case 'failed':
      icon = <AlertTriangle className="h-5 w-5 text-danger" strokeWidth={2.5} />;
      title = 'Precisa de atenção';
      detail = `${plural(state.count, 'venda não enviada', 'vendas não enviadas')}`;
      tone = 'text-danger';
      break;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 items-center gap-2 rounded-full bg-white/95 px-3.5 py-2 shadow-soft ring-1 ring-line"
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className={`block text-sm font-extrabold ${tone}`}>{title}</span>
        <span className="block truncate text-xs font-semibold text-brown-soft">{detail}</span>
      </span>
    </div>
  );
}
