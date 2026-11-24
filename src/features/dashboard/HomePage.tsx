import { Link } from 'react-router';
import { BarChart3, Package, Plus, Store, Users, Wallet, type LucideIcon } from 'lucide-react';
import { Awning } from '@/components/Awning';
import { Logo } from '@/components/Logo';
import { SyncPill } from '@/components/SyncPill';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSyncPillState } from '@/features/sync/useSyncPillState';
import { firstName, greeting } from '@/domain/period';
import { FoodWatermark } from './FoodWatermark';

interface Shortcut {
  to: string;
  label: string;
  hint: string;
  icon: LucideIcon;
}

const MAIN_SHORTCUTS: Shortcut[] = [
  { to: '/clientes', label: 'Clientes', hint: 'Cadastrar e gerenciar', icon: Users },
  { to: '/recebimentos', label: 'Recebimentos', hint: 'Confirmar pagamentos (Pix)', icon: Wallet },
  { to: '/relatorios', label: 'Relatórios', hint: 'Vendas, recebimentos e devedores', icon: BarChart3 },
];

const MORE_SHORTCUTS: Shortcut[] = [
  { to: '/produtos', label: 'Produtos', hint: 'Preços e categorias', icon: Package },
  { to: '/estabelecimentos', label: 'Estabelecimentos', hint: 'Locais de venda', icon: Store },
];

export function HomePage() {
  const { identity } = useAuth();
  const syncState = useSyncPillState();
  const name = firstName(identity?.displayName ?? '');

  return (
    <div className="relative">
      <Awning />
      <header className="mx-auto flex max-w-lg items-start justify-between gap-2 px-4 pt-4">
        <Logo />
        <div className="max-w-[11.5rem] pt-1">
          <SyncPill state={syncState} />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pt-5 pb-8">
        <h1 className="text-[1.7rem] leading-tight font-black text-brown">
          {greeting(new Date())}
          {name ? `, ${name}` : ''}!{' '}
          <span role="img" aria-label="aceno">
            👋
          </span>
        </h1>
        <p className="mt-1 text-lg text-brown">Aqui está o resumo do seu negócio hoje.</p>

        {/* Os cartões com números (total a receber, vendas de hoje, clientes com
            saldo) entram junto com o cadastro de clientes, já lidos do banco. */}
        <div className="mt-5 rounded-card border-2 border-dashed border-line bg-white/60 px-5 py-4 text-brown-soft">
          Os números do dia aparecem aqui assim que os primeiros clientes e vendas forem cadastrados.
        </div>

        <Link
          to="/vender"
          className="mt-5 flex min-h-24 items-center gap-4 rounded-card bg-linear-to-br from-orange-deep to-orange-darker px-5 py-4 text-white shadow-warm ring-1 ring-orange/40 active:brightness-95"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-orange-deep shadow-soft">
            <Plus className="h-9 w-9" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-3xl leading-tight font-black">Nova venda</span>
            <span className="block text-base font-semibold">Registrar lanche (fiado ou pago na hora)</span>
          </span>
        </Link>

        <nav aria-label="Atalhos" className="mt-5 space-y-3">
          <ul className="grid grid-cols-3 gap-3">
            {MAIN_SHORTCUTS.map((s) => (
              <li key={s.to}>
                <ShortcutCard shortcut={s} />
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MORE_SHORTCUTS.map((s) => (
              <li key={s.to}>
                <ShortcutCard shortcut={s} compact />
              </li>
            ))}
          </ul>
        </nav>

        <FoodWatermark className="mx-auto mt-6 h-20 w-40" />
      </main>
    </div>
  );
}

function ShortcutCard({ shortcut, compact = false }: { shortcut: Shortcut; compact?: boolean }) {
  const Icon = shortcut.icon;
  if (compact) {
    return (
      <Link
        to={shortcut.to}
        className="flex min-h-16 items-center gap-3 rounded-card bg-white/90 px-3.5 py-3 shadow-soft ring-1 ring-line active:bg-cream-deep"
      >
        <Icon className="h-7 w-7 shrink-0 text-orange" strokeWidth={2.5} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.95rem] leading-tight font-extrabold text-brown">{shortcut.label}</span>
          <span className="block text-xs leading-snug text-brown-soft">{shortcut.hint}</span>
        </span>
      </Link>
    );
  }
  return (
    <Link
      to={shortcut.to}
      className="flex h-full min-h-32 flex-col items-center justify-start gap-1.5 rounded-card bg-white/90 px-2 py-4 text-center shadow-soft ring-1 ring-line active:bg-cream-deep"
    >
      <Icon className="h-9 w-9 text-orange" strokeWidth={2.5} aria-hidden="true" />
      <span className="text-[0.95rem] leading-tight font-extrabold text-brown">{shortcut.label}</span>
      <span className="text-xs leading-snug text-brown-soft">{shortcut.hint}</span>
    </Link>
  );
}
