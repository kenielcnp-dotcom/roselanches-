import { createBrowserRouter, Link } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { NoAccessPage } from '@/features/auth/NoAccessPage';
import { PublicOnly, RequireAuth, RequireCustomer, RequireStaff } from '@/features/auth/guards';
import { OwnerOnly } from '@/features/auth/roles';
import { TeamInvitePage } from '@/features/team/TeamInvitePage';
import { TeamPage } from '@/features/team/TeamPage';
import { HomePage } from '@/features/dashboard/HomePage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { DisputesPage } from '@/features/client-portal/DisputesPage';
import { InvitePage } from '@/features/client-portal/InvitePage';
import { PortalHomePage } from '@/features/client-portal/PortalHomePage';
import { PortalLayout } from '@/features/client-portal/PortalLayout';
import { PortalPixPage } from '@/features/client-portal/PortalPixPage';
import { PortalPrivacyPage } from '@/features/client-portal/PortalPrivacyPage';
import { PortalSalePage } from '@/features/client-portal/PortalSalePage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomerFormPage } from '@/features/customers/CustomerFormPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { EstablishmentDetailPage } from '@/features/establishments/EstablishmentDetailPage';
import { EstablishmentFormPage } from '@/features/establishments/EstablishmentFormPage';
import { EstablishmentsPage } from '@/features/establishments/EstablishmentsPage';
import { ProductFormPage } from '@/features/products/ProductFormPage';
import { ProductsPage } from '@/features/products/ProductsPage';
import { EntryDetailPage } from '@/features/payments/EntryDetailPage';
import { EntryFormPage } from '@/features/payments/EntryFormPage';
import { PaymentDetailPage } from '@/features/payments/PaymentDetailPage';
import { PaymentFormPage } from '@/features/payments/PaymentFormPage';
import { ReceivablesPage } from '@/features/payments/ReceivablesPage';
import { NewSalePage } from '@/features/sales/NewSalePage';
import { SaleDetailPage } from '@/features/sales/SaleDetailPage';
import { SalesPage } from '@/features/sales/SalesPage';

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-black text-brown">Página não encontrada</h1>
      <Link to="/" className="font-extrabold text-orange-deep">
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
