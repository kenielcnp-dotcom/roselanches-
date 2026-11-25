import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { Eraser, PenLine } from 'lucide-react';
import { Button } from '@/components/Button';
import { CONSENT_TEXTS, CURRENT_CONSENT_VERSION } from '@/domain/consent';
import { formatBRL } from '@/domain/money';

/** Assinatura pronta para guardar no celular. */
export interface CapturedSignature {
  png: ArrayBuffer;
  fileSha256: string;
  previewUrl: string;
  capturedAt: string;
}

const MAX_BYTES = 204_800;
/** Menos que isso é um toque ou um ponto, não uma assinatura. */
const MIN_POINTS = 8;

interface Props {
  customerName: string;
  establishmentName: string;
  summary: string;
  totalCents: number;
  onConfirm: (signature: CapturedSignature) => void;
  onSkip: (() => void) | null;
  onClose: () => void;
}

/**
 * Tela cheia para o cliente assinar no celular da Rose. Mostra exatamente o
 * que está sendo confirmado e o texto do termo. Funciona sem internet.
 */
export function SignatureScreen({ customerName, establishmentName, summary, totalCents, onConfirm, onSkip, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [points, setPoints] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pad = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)', penColor: '#2b1408', minWidth: 1.2, maxWidth: 3.2 });
    padRef.current = pad;
    const count = () => setPoints(pad.toData().reduce((n, stroke) => n + stroke.points.length, 0));
    pad.addEventListener('endStroke', count);

    // Tela nítida em celular (densidade de pixels) sem passar de 2x, para o arquivo ficar pequeno.
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const data = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
      pad.fromData(data);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('resize', resize);
      pad.removeEventListener('endStroke', count);
      pad.off();
    };
  }, []);

  const clear = () => {
    padRef.current?.clear();
    setPoints(0);
    setError(null);
  };

  const confirm = async () => {
    const canvas = canvasRef.current;
    if (!canvas || points < MIN_POINTS) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Não foi possível gerar a imagem.');
      if (blob.size > MAX_BYTES) {
        setError('A assinatura ficou grande demais. Toque em Limpar e assine de novo, sem preencher a área.');
        return;
      }
      const png = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', png);
      const fileSha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
      onConfirm({ png, fileSha256, previewUrl: canvas.toDataURL('image/png'), capturedAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível guardar a assinatura.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-assinatura" className="fixed inset-0 z-50 overflow-y-auto bg-cream">
      <div className="safe-top mx-auto flex min-h-dvh max-w-lg flex-col gap-3 px-4 pt-4 pb-6">
        <h1 id="titulo-assinatura" className="flex items-center gap-2 text-2xl font-black text-brown">
          <PenLine className="h-7 w-7 text-orange-darker" aria-hidden="true" />
          Confirmação de compra
        </h1>
        <dl className="rounded-card bg-white p-4 text-brown ring-1 ring-line">
          <div className="flex justify-between gap-3">
            <dt className="text-brown-soft">Cliente</dt>
            <dd className="text-right font-extrabold">{customerName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brown-soft">Estabelecimento</dt>
            <dd className="text-right font-bold">{establishmentName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-brown-soft">Compra</dt>
            <dd className="text-right font-bold">{summary}</dd>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3 border-t border-line pt-2">
            <dt className="font-bold">Total</dt>
            <dd className="tabular text-2xl font-black">{formatBRL(totalCents)}</dd>
          </div>
        </dl>
        <p className="rounded-2xl bg-peach px-4 py-3 font-semibold text-brown">"{CONSENT_TEXTS[CURRENT_CONSENT_VERSION]}"</p>

        <div className="relative">
          <canvas
            ref={canvasRef}
            aria-label="Área de assinatura: assine com o dedo"
            className="block h-52 w-full touch-none rounded-card border-2 border-dashed border-brown-soft/60 bg-white"
          />
          {points === 0 && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-bold text-brown-soft/60">
              Assine aqui com o dedo
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
            {error}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={clear} disabled={points === 0}>
            <Eraser className="h-5 w-5" aria-hidden="true" />
            Limpar
          </Button>
          <Button onClick={() => void confirm()} disabled={points < MIN_POINTS} loading={busy}>
            Confirmar assinatura
          </Button>
        </div>
        {onSkip && (
          <Button variant="ghost" block onClick={onSkip}>
            Salvar sem assinatura
          </Button>
        )}
        <Button variant="ghost" block onClick={onClose} className="text-brown-soft">
          Voltar ao resumo
        </Button>
      </div>
    </div>
  );
}

