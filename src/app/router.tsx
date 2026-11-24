import { createBrowserRouter, Link } from 'react-router';
import { AdminLayout } from './AdminLayout';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { NoAccessPage } from '@/features/auth/NoAccessPage';
import { PublicOnly, RequireAuth, RequireCustomer, RequireStaff } from '@/features/auth/guards';
import { HomePage } from '@/features/dashboard/HomePage';
import { ComingSoonPage } from '@/features/shared/ComingSoonPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PortalHomePage } from '@/features/client-portal/PortalHomePage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { CustomerFormPage } from '@/features/customers/CustomerFormPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { EstablishmentDetailPage } from '@/features/establishments/EstablishmentDetailPage';
import { EstablishmentFormPage } from '@/features/establishments/EstablishmentFormPage';
import { EstablishmentsPage } from '@/features/establishments/EstablishmentsPage';
import { ProductFormPage } from '@/features/products/ProductFormPage';
import { ProductsPage } from '@/features/products/ProductsPage';

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
  { path: '/conta', element: <RequireCustomer><PortalHomePage /></RequireCustomer> },
  {
    path: '/',
    element: <RequireStaff><AdminLayout /></RequireStaff>,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'vender', element: <ComingSoonPage title="Nova venda" /> },
      { path: 'clientes', element: <CustomersPage /> },
      { path: 'clientes/novo', element: <CustomerFormPage /> },
      { path: 'clientes/:id', element: <CustomerDetailPage /> },
      { path: 'clientes/:id/editar', element: <CustomerFormPage /> },
      { path: 'recebimentos', element: <ComingSoonPage title="Recebimentos" /> },
      { path: 'relatorios', element: <ComingSoonPage title="Relatórios" /> },
      { path: 'produtos', element: <ProductsPage /> },
      { path: 'produtos/novo', element: <ProductFormPage /> },
      { path: 'produtos/:id/editar', element: <ProductFormPage /> },
      { path: 'estabelecimentos', element: <EstablishmentsPage /> },
      { path: 'estabelecimentos/novo', element: <EstablishmentFormPage /> },
      { path: 'estabelecimentos/:id', element: <EstablishmentDetailPage /> },
      { path: 'estabelecimentos/:id/editar', element: <EstablishmentFormPage /> },
      { path: 'config', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
