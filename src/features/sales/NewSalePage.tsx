import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft, ListChecks, RefreshCw, Store } from 'lucide-react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { useConnectionStatus } from '@/app/ConnectionProvider';
import { formatBRL } from '@/domain/money';
import { suggestPeriod } from '@/domain/period';
import { maskPhone } from '@/domain/phone';
import { buildItem, describeItems, itemsTotal, validateSaleDraft } from '@/domain/sale';
import { SETTINGS_KEY } from '@/lib/offline/catalog';
import {
  getMeta,
  type CachedCustomer,
  type CachedEstablishment,
  type CachedProduct,
  type CachedSettings,
} from '@/lib/offline/db';
import { enqueueSale, type SaleDisplay } from '@/lib/offline/outbox';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { linkCustomer } from '@/services/establishments';
import type { PaymentKind, PaymentMethod, Period, SaleDraft, SaleMode } from '@/types/domain';
import { useCurrentEstablishmentId } from '@/features/establishments/useCurrentEstablishment';
import { useSync } from '@/features/sync/SyncProvider';
import { CustomerStep } from './CustomerStep';
import { ItemsStep } from './ItemsStep';
import { SummaryStep } from './SummaryStep';

type Step = 'establishment' | 'customer' | 'items' | 'summary';

const DEFAULT_SETTINGS: CachedSettings = { saleMaxCents: 50_000, itemMaxQty: 50, defaultSalePeriod: null, requireSignature: false };
const MODE_KEY = 'ldr.saleMode';

function rememberedMode(): SaleMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'AMOUNT' ? 'AMOUNT' : 'ITEMS';
  } catch {
    return 'ITEMS';
  }
}

/**
 * Nova venda, toda a partir dos dados do celular: funciona sem internet.
 * Lugar → cliente → produtos ou valor → conferência → salvar no celular.
 */
export function NewSalePage() {
  const { db, requestSync, refreshCatalogNow, catalogUpdatedAt } = useSync();
  const establishments = useLiveQuery(() => db.establishments.toArray(), [db]);
  const customers = useLiveQuery(() => db.customers.toArray(), [db]);
  const products = useLiveQuery(() => db.products.toArray(), [db]);
  const settings = useLiveQuery(async () => (await getMeta<CachedSettings>(db, SETTINGS_KEY)) ?? DEFAULT_SETTINGS, [db]);

  if (!establishments || !customers || !products || !settings) return <LoadingState />;

  if (catalogUpdatedAt === null) {
    return (
      <>
        <PageHeader title="Nova venda" back="/" />
        <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
          <p className="rounded-card bg-white p-5 text-brown ring-1 ring-line">
            Para vender sem internet, o celular precisa copiar seus clientes e produtos uma vez. Conecte à internet e toque em atualizar.
          </p>
          <Button block onClick={() => void refreshCatalogNow()}>
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Atualizar dados
          </Button>
        </main>
      </>
    );
  }

  return (
    <SaleFlow
      establishments={establishments}
      customers={customers}
      products={products}
      settings={settings}
      onSaved={() => void requestSync()}
      refreshCatalog={refreshCatalogNow}
      enqueue={(draft, display) => enqueueSale(db, draft, display)}
    />
  );
}

interface FlowProps {
  establishments: CachedEstablishment[];
  customers: CachedCustomer[];
  products: CachedProduct[];
  settings: CachedSettings;
  onSaved: () => void;
  refreshCatalog: () => Promise<void>;
  enqueue: (draft: SaleDraft, display: SaleDisplay) => Promise<boolean>;
}

function SaleFlow({ establishments, customers, products, settings, onSaved, refreshCatalog, enqueue }: FlowProps) {
  const toast = useToast();
  const { status: connection } = useConnectionStatus();
  const [params] = useSearchParams();
  const [currentId, setCurrentId] = useCurrentEstablishmentId();
  const establishment = establishments.find((e) => e.id === currentId && e.isActive) ?? null;

  const preselected = customers.find((c) => c.id === params.get('cliente') && c.isActive) ?? null;
  // Ids nascem quando a venda começa: toque duplo em "Salvar" não cria outra.
  const [saleId, setSaleId] = useState(() => crypto.randomUUID());
  const [paymentId, setPaymentId] = useState(() => crypto.randomUUID());
  const [customer, setCustomer] = useState<CachedCustomer | null>(preselected);
  const [step, setStep] = useState<Step>(preselected ? 'items' : 'customer');
  const [mode, setMode] = useState<SaleMode>(rememberedMode);
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [amountCents, setAmountCents] = useState(0);
  const [description, setDescription] = useState('');
  const [period, setPeriod] = useState<Period>(() => settings.defaultSalePeriod ?? suggestPeriod(new Date()));
  const [paymentKind, setPaymentKind] = useState<PaymentKind>('CREDIT');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [saving, setSaving] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const items = useMemo(
    () =>
      [...quantities.entries()]
        .filter(([, q]) => q > 0)
        .flatMap(([id, q]) => {
          const p = productById.get(id);
          return p ? [buildItem({ id: p.id, name: p.name, priceCents: p.priceCents }, q)] : [];
        }),
    [quantities, productById],
  );
  const totalCents = mode === 'ITEMS' ? itemsTotal(items) : amountCents;

  const draft: SaleDraft | null =
    establishment && customer
      ? {
          id: saleId,
          customerId: customer.id,
          establishmentId: establishment.id,
          mode,
          period,
          occurredAt: now.toISOString(),
          items: mode === 'ITEMS' ? items : [],
          description: mode === 'AMOUNT' ? description.trim() : null,
          totalCents,
          paymentKind,
          ...(paymentKind === 'PAID_NOW' ? { paidNow: { paymentId, method } } : {}),
        }
      : null;
  const issues = draft ? validateSaleDraft(draft, { saleMaxCents: settings.saleMaxCents, itemMaxQty: settings.itemMaxQty }) : [];

  // Sem lugar escolhido (ou desativado): escolher antes de tudo.
  if (!establishment || step === 'establishment') {
    const active = establishments.filter((e) => e.isActive);
    return (
      <>
        <PageHeader title="Onde você está?" back="/" />
        <main className="mx-auto max-w-lg space-y-3 px-4 pt-2 pb-6">
          {active.length === 0 ? (
            <p className="rounded-card bg-white p-5 text-brown ring-1 ring-line">
              Cadastre pelo menos um estabelecimento.{' '}
              <Link to="/estabelecimentos/novo" className="font-extrabold text-orange-deep underline">
                Cadastrar
              </Link>
            </p>
          ) : (
            active.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setCurrentId(e.id);
                  setStep(customer ? 'items' : 'customer');
                }}
                className={`flex min-h-20 w-full items-center gap-4 rounded-card bg-white px-4 text-left shadow-soft active:bg-cream-deep ${
                  e.id === currentId ? 'ring-3 ring-orange-deep' : 'ring-1 ring-line'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-peach text-orange-deep">
                  <Store className="h-7 w-7" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xl font-black text-brown">{e.name}</span>
                  <span className="text-brown-soft">{e.customerCount === 1 ? '1 cliente' : `${e.customerCount} clientes`}</span>
                </span>
              </button>
            ))
          )}
        </main>
      </>
    );
  }

  const selectCustomer = async (c: CachedCustomer, link: boolean) => {
    setCustomer(c);
    setStep('items');
    if (!link) return;
    try {
      await linkCustomer(supabase, establishment.id, c.id);
      toast.show(`${c.fullName} agora é cliente de ${establishment.name}.`);
      await refreshCatalog();
    } catch (e) {
      toast.show(`Não deu para vincular agora (${errorMessage(e)}). A venda continua normalmente.`, 'error');
    }
  };

  const changeMode = (m: SaleMode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* só não fica lembrado */
    }
  };

  const reset = () => {
    setSaleId(crypto.randomUUID());
    setPaymentId(crypto.randomUUID());
    setCustomer(null);
    setQuantities(new Map());
    setAmountCents(0);
    setDescription('');
    setPaymentKind('CREDIT');
    setShowIssues(false);
    setStep('customer');
  };

  const save = async () => {
    if (!draft || saving) return;
    const final = { ...draft, occurredAt: new Date().toISOString() };
    if (validateSaleDraft(final, settings).length > 0) {
      setShowIssues(true);
      return;
    }
    setSaving(true);
    try {
      await enqueue(final, {
        customerName: customer!.fullName,
        customerPhone: customer!.phoneE164,
        establishmentName: establishment.name,
        summary: final.mode === 'ITEMS' ? describeItems(final.items) : (final.description ?? ''),
      });
      toast.show('Venda salva no celular.');
      reset();
      onSaved();
    } catch (e) {
      toast.show(`A venda NÃO foi salva: ${errorMessage(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => setStep(step === 'summary' ? 'items' : 'customer');

  return (
    <>
      <PageHeader title="Vender" back="/" showSync>
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 px-4 pb-2">
          <p className="min-w-0 truncate text-brown">
            Vendendo em <strong className="font-black">{establishment.name}</strong>
          </p>
          <button
            type="button"
            onClick={() => setStep('establishment')}
            className="min-h-10 shrink-0 rounded-full bg-white px-3 text-sm font-extrabold text-orange-deep ring-1 ring-line"
          >
            Trocar
          </button>
        </div>
      </PageHeader>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-44">
        {step !== 'customer' && customer && (
          <div className="flex items-center gap-3 rounded-2xl bg-white/90 px-4 py-2.5 ring-1 ring-line">
            <button type="button" onClick={goBack} aria-label="Voltar uma etapa" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full active:bg-peach">
              <ArrowLeft className="h-6 w-6 text-brown" aria-hidden="true" />
            </button>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-black text-brown">{customer.fullName}</span>
              <span className="text-sm text-brown-soft">{customer.phoneE164 ? maskPhone(customer.phoneE164) : 'Sem telefone'}</span>
            </span>
            <button type="button" onClick={() => setStep('customer')} className="min-h-10 rounded-full px-2 text-sm font-extrabold text-orange-deep">
              Trocar
            </button>
          </div>
        )}

        {step === 'customer' && (
          <>
            <CustomerStep establishment={establishment} customers={customers} onSelect={(c, link) => void selectCustomer(c, link)} canLink={connection === 'online'} />
            <Link to="/vendas" className="flex min-h-12 items-center justify-center gap-2 font-extrabold text-brown-soft">
              <ListChecks className="h-5 w-5" aria-hidden="true" />
              Ver vendas de hoje
            </Link>
          </>
        )}

        {step === 'items' && (
          <ItemsStep
            mode={mode}
            onModeChange={changeMode}
            products={products}
            quantities={quantities}
            onQuantity={(id, q) =>
              setQuantities((prev) => {
                const next = new Map(prev);
                if (q <= 0) next.delete(id);
                else next.set(id, q);
                return next;
              })
            }
            itemMaxQty={settings.itemMaxQty}
            amountCents={amountCents}
            onAmount={setAmountCents}
            description={description}
            onDescription={setDescription}
          />
        )}

        {step === 'summary' && customer && (
          <SummaryStep
            establishment={establishment}
            customer={customer}
            mode={mode}
            items={items}
            description={description}
            totalCents={totalCents}
            period={period}
            onPeriod={setPeriod}
            paymentKind={paymentKind}
            onPaymentKind={setPaymentKind}
            method={method}
            onMethod={setMethod}
            issues={showIssues ? issues : []}
            now={now}
          />
        )}
      </main>

      {step !== 'customer' && (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-20 border-t border-line bg-cream/95 backdrop-blur safe-bottom">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-brown-soft">Total</p>
              <p className="tabular text-2xl leading-none font-black text-brown">{formatBRL(totalCents)}</p>
            </div>
            {step === 'items' ? (
              <Button
                className="ml-auto min-h-14 flex-1 text-lg"
                disabled={totalCents <= 0 || (mode === 'AMOUNT' && description.trim() === '')}
                onClick={() => {
                  setNow(new Date());
                  setShowIssues(false);
                  setStep('summary');
                }}
              >
                Continuar
              </Button>
            ) : (
              <Button className="ml-auto min-h-14 flex-1 text-lg" loading={saving} onClick={() => void save()}>
                Salvar venda
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
