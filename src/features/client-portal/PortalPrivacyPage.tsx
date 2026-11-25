import { PageHeader } from '@/components/PageHeader';

/** Aviso de privacidade do portal (LGPD), em linguagem simples. */
export function PortalPrivacyPage() {
  return (
    <>
      <PageHeader title="Privacidade" back="/conta" showSync={false} />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-10 text-brown">
        <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <h2 className="text-lg font-black">O que guardamos</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Seu nome e telefone, cadastrados pela Rose para registrar as compras fiado.</li>
            <li>Suas compras, pagamentos e avisos de Pix, para calcular o saldo.</li>
            <li>O e-mail da sua conta, usado só para você entrar.</li>
            <li>
              Quando você assina na tela, a imagem da assinatura. Ela serve como evidência de que você concordou com a compra e
              não é usada para identificar você.
            </li>
            <li>Suas confirmações e contestações, com data e hora.</li>
          </ul>
        </section>
        <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <h2 className="text-lg font-black">Quem vê</h2>
          <p>
            Só você e a Rose (e quem trabalha com ela no negócio). Você vê apenas a sua própria conta. Ninguém recebe esses dados
            para propaganda.
          </p>
        </section>
        <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <h2 className="text-lg font-black">Neste celular</h2>
          <p>
            O app não guarda o seu saldo nem o seu extrato no celular: tudo é buscado na hora, com internet. Ao sair da conta, nada
            fica salvo.
          </p>
        </section>
        <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <h2 className="text-lg font-black">Seus direitos</h2>
          <p>
            Você pode pedir à Rose para ver, corrigir ou apagar seus dados pessoais. O histórico de compras e pagamentos é mantido
            enquanto houver valores em aberto e pelo tempo exigido por lei, e depois pode ser apagado a seu pedido.
          </p>
        </section>
      </main>
    </>
  );
}
