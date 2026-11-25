import { createBrowserRouter, Link } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { lazyPage } from './lazyPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { NoAccessPage } from '@/features/auth/NoAccessPage';
import { PublicOnly, RequireAuth, RequireCustomer, RequireStaff } from '@/features/auth/guards';
import { OwnerOnly } from '@/features/auth/roles';
import { HomePage } from '@/features/dashboard/HomePage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomerFormPage } from '@/features/customers/CustomerFormPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { EntryDetailPage } from '@/features/payments/EntryDetailPage';
import { EntryFormPage } from '@/features/payments/EntryFormPage';
import { PaymentDetailPage } from '@/features/payments/PaymentDetailPage';
import { PaymentFormPage } from '@/features/payments/PaymentFormPage';
import { ReceivablesPage } from '@/features/payments/ReceivablesPage';
import { NewSalePage } from '@/features/sales/NewSalePage';
import { SaleDetailPage } from '@/features/sales/SaleDetailPage';
import { SalesPage } from '@/features/sales/SalesPage';

// Partes usadas de vez em quando: baixadas só quando abertas.
const TeamInvitePage = lazyPage(() => import('@/features/team/TeamInvitePage'), 'TeamInvitePage');
const TeamPage = lazyPage(() => import('@/features/team/TeamPage'), 'TeamPage');
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const ReportsPage = lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const DisputesPage = lazyPage(() => import('@/features/client-portal/DisputesPage'), 'DisputesPage');
const InvitePage = lazyPage(() => import('@/features/client-portal/InvitePage'), 'InvitePage');
const PortalHomePage = lazyPage(() => import('@/features/client-portal/PortalHomePage'), 'PortalHomePage');
const PortalLayout = lazyPage(() => import('@/features/client-portal/PortalLayout'), 'PortalLayout');
const PortalPixPage = lazyPage(() => import('@/features/client-portal/PortalPixPage'), 'PortalPixPage');
const PortalPrivacyPage = lazyPage(() => import('@/features/client-portal/PortalPrivacyPage'), 'PortalPrivacyPage');
const PortalSalePage = lazyPage(() => import('@/features/client-portal/PortalSalePage'), 'PortalSalePage');
const EstablishmentDetailPage = lazyPage(() => import('@/features/establishments/EstablishmentDetailPage'), 'EstablishmentDetailPage');
const EstablishmentFormPage = lazyPage(() => import('@/features/establishments/EstablishmentFormPage'), 'EstablishmentFormPage');
const EstablishmentsPage = lazyPage(() => import('@/features/establishments/EstablishmentsPage'), 'EstablishmentsPage');
const ProductFormPage = lazyPage(() => import('@/features/products/ProductFormPage'), 'ProductFormPage');
const ProductsPage = lazyPage(() => import('@/features/products/ProductsPage'), 'ProductsPage');

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-black text-brown">Página não encontrada</h1>
      <Link to="/" className="font-extrabold text-orange-darker">
        Voltar para o início
      </Link>
    </main>
  );
}

export const router = createBrowserRouter([
  { path: '/entrar', element: <PublicOnly><LoginPage /></PublicOnly> },
  { path: '/criar-conta', element: <PublicOnly><SignupPage /></PublicOnly> },
  { path: '/sem-acesso', element: <RequireAuth><NoAccessPage /></RequireAuth> },
  { path: '/convite', element: <InvitePage /> },
  { path: '/convite-equipe', element: <TeamInvitePage /> },
  {
    path: '/conta',
    element: <RequireCustomer><PortalLayout /></RequireCustomer>,
    children: [
      { index: true, element: <PortalHomePage /> },
      { path: 'compras/:id', element: <PortalSalePage /> },
      { path: 'pagar', element: <PortalPixPage /> },
      { path: 'privacidade', element: <PortalPrivacyPage /> },
    ],
  },
  {
    path: '/',
    element: <RequireStaff><AdminLayout /></RequireStaff>,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'vender', element: <NewSalePage /> },
      { path: 'vendas', element: <SalesPage /> },
      { path: 'vendas/:id', element: <SaleDetailPage /> },
      { path: 'contestacoes', element: <OwnerOnly><DisputesPage /></OwnerOnly> },
      { path: 'clientes', element: <CustomersPage /> },
      { path: 'clientes/novo', element: <CustomerFormPage /> },
      { path: 'clientes/:id', element: <CustomerDetailPage /> },
      { path: 'clientes/:id/editar', element: <CustomerFormPage /> },
      { path: 'recebimentos', element: <ReceivablesPage /> },
      { path: 'recebimentos/novo', element: <PaymentFormPage /> },
      { path: 'recebimentos/:id', element: <PaymentDetailPage /> },
      { path: 'clientes/:id/saldo-anterior', element: <OwnerOnly><EntryFormPage kind="OPENING_BALANCE" /></OwnerOnly> },
      { path: 'clientes/:id/ajuste', element: <OwnerOnly><EntryFormPage kind="ADJUSTMENT" /></OwnerOnly> },
      { path: 'clientes/:id/lancamentos/:entryId', element: <EntryDetailPage /> },
      { path: 'relatorios', element: <OwnerOnly><ReportsPage /></OwnerOnly> },
      { path: 'produtos', element: <OwnerOnly><ProductsPage /></OwnerOnly> },
      { path: 'produtos/novo', element: <OwnerOnly><ProductFormPage /></OwnerOnly> },
      { path: 'produtos/:id/editar', element: <OwnerOnly><ProductFormPage /></OwnerOnly> },
      { path: 'estabelecimentos', element: <OwnerOnly><EstablishmentsPage /></OwnerOnly> },
      { path: 'estabelecimentos/novo', element: <OwnerOnly><EstablishmentFormPage /></OwnerOnly> },
      { path: 'estabelecimentos/:id', element: <OwnerOnly><EstablishmentDetailPage /></OwnerOnly> },
      { path: 'estabelecimentos/:id/editar', element: <OwnerOnly><EstablishmentFormPage /></OwnerOnly> },
      { path: 'equipe', element: <OwnerOnly><TeamPage /></OwnerOnly> },
      { path: 'config', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
