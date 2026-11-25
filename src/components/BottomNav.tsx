import { NavLink } from 'react-router';
import { BarChart3, CirclePlus, House, ReceiptText, Settings, Users, type LucideIcon } from 'lucide-react';
import { useIsOwner } from '@/features/auth/roles';

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const HOME: Tab = { to: '/', label: 'Início', icon: House, end: true };
const SELL: Tab = { to: '/vender', label: 'Vender', icon: CirclePlus };
const CUSTOMERS: Tab = { to: '/clientes', label: 'Clientes', icon: Users };
const SETTINGS: Tab = { to: '/config', label: 'Config.', icon: Settings };

// Vendedor: no lugar dos relatórios (só da dona), as vendas que ele fez.
const OWNER_TABS: Tab[] = [HOME, SELL, CUSTOMERS, { to: '/relatorios', label: 'Relatórios', icon: BarChart3 }, SETTINGS];
const SELLER_TABS: Tab[] = [HOME, SELL, CUSTOMERS, { to: '/vendas', label: 'Vendas', icon: ReceiptText }, SETTINGS];

export function BottomNav() {
  const tabs = useIsOwner() ? OWNER_TABS : SELLER_TABS;
  return (
    <nav
      aria-label="Navegação principal"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 rounded-t-3xl bg-brown-nav shadow-[0_-6px_20px_-8px_rgb(84_39_19/0.5)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-2 pt-2 pb-2">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[0.8rem] font-bold transition-colors ${
                  isActive ? 'bg-orange-deep text-white' : 'text-white/90 active:bg-white/10'
                }`
              }
            >
              <Icon className="h-6 w-6" strokeWidth={2.2} aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
