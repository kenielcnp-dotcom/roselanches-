#!/usr/bin/env python3
"""
Gera os ícones do PWA (PNG) e o favicon (SVG): o hambúrguer do logo sobre o
laranja da marca. Mesmo desenho de src/components/BurgerArt.tsx, simplificado.

Sem dependências: o PNG é montado com zlib e struct da biblioteca padrão.

    python scripts/gerar-icones.py
"""

import struct
import zlib
from pathlib import Path

SAIDA = Path(__file__).resolve().parent.parent / "public"
FUNDO = (0xC9, 0x4D, 0x0B)
PAO = (0xF4, 0xA3, 0x40)
CONTORNO = (0x7A, 0x3A, 0x12)
ALFACE = (0x5D, 0xA8, 0x31)
QUEIJO = (0xFF, 0xC8, 0x3D)
CARNE = (0x6B, 0x35, 0x18)
GERGELIM = (0xFF, 0xF4, 0xE6)
AMOSTRAS = 3  # supersampling 3x3 para bordas suaves


def dentro_ret_arredondado(x, y, x0, y0, x1, y1, r):
    if not (x0 <= x <= x1 and y0 <= y <= y1):
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def burger(x, y):
    """Cor do hambúrguer no ponto (espaço 0..64), ou None se for fundo."""
    # gergelim
    for sx, sy in ((24, 21), (32, 18.5), (40, 21), (28, 25), (36.5, 25)):
        if ((x - sx) / 1.6) ** 2 + ((y - sy) / 1.0) ** 2 <= 1:
            return GERGELIM
    # pão de cima: meia elipse centro (32, 30), raios 20 x 16, com contorno
    if y <= 30:
        d = ((x - 32) / 20) ** 2 + ((y - 30) / 16) ** 2
        if d <= 1:
            return CONTORNO if d > 0.86 else PAO
    if 30 < y <= 33.5 and 10 <= x <= 54:
        return ALFACE
    if 33.5 < y <= 36.5 and 12 <= x <= 52:
        return QUEIJO
    if dentro_ret_arredondado(x, y, 11, 36.5, 53, 43.5, 3.5):
        return CARNE
    if dentro_ret_arredondado(x, y, 12, 44, 52, 50.5, 5):
        borda = not dentro_ret_arredondado(x, y, 13.2, 45.2, 50.8, 49.3, 4)
        return CONTORNO if borda else PAO
    return None


def cor_no_ponto(x, y, escala, cantos):
    if cantos:
        r = 14
        cx = min(max(x, r), 64 - r)
        cy = min(max(y, r), 64 - r)
        if (x - cx) ** 2 + (y - cy) ** 2 > r * r:
            return (0, 0, 0, 0)
    sx = 32 + (x - 32) / escala
    sy = 33 + (y - 32) / escala
    c = burger(sx, sy)
    return (*(c or FUNDO), 255)


def png(tamanho, escala=0.92, cantos=True):
    linhas = bytearray()
    passo = 64 / tamanho
    for py in range(tamanho):
        linhas.append(0)
        for px in range(tamanho):
            soma = [0, 0, 0, 0]
            for sy in range(AMOSTRAS):
                for sx in range(AMOSTRAS):
                    x = (px + (sx + 0.5) / AMOSTRAS) * passo
                    y = (py + (sy + 0.5) / AMOSTRAS) * passo
                    c = cor_no_ponto(x, y, escala, cantos)
                    for i in range(4):
                        soma[i] += c[i]
            n = AMOSTRAS * AMOSTRAS
            linhas.extend(round(v / n) for v in soma)

    def bloco(tipo, dados):
        return struct.pack(">I", len(dados)) + tipo + dados + struct.pack(">I", zlib.crc32(tipo + dados) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", tamanho, tamanho, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + bloco(b"IHDR", ihdr) + bloco(b"IDAT", zlib.compress(bytes(linhas), 9)) + bloco(b"IEND", b"")


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#C94D0B"/>
  <g transform="translate(2.6 1.6) scale(0.92)">
    <path d="M12 30c0-9.4 9-16 20-16s20 6.6 20 16z" fill="#F4A340" stroke="#7A3A12" stroke-width="1.6"/>
    <g fill="#FFF4E6"><ellipse cx="24" cy="21" rx="1.6" ry="1"/><ellipse cx="32" cy="18.5" rx="1.6" ry="1"/><ellipse cx="40" cy="21" rx="1.6" ry="1"/><ellipse cx="28" cy="25" rx="1.6" ry="1"/><ellipse cx="36.5" cy="25" rx="1.6" ry="1"/></g>
    <path d="M10 31.5c3 2.6 5-1 8 1.4s5-1.2 8 1.2 5-1.2 8 1.2 5-1.2 8 1.2 5-1 8-1.4l2 1.4H10z" fill="#5DA831"/>
    <path d="M12 34h40l-6 4-4-1.5-5 3.5-4-2.5-7 3-3-3.5-5 1.5z" fill="#FFC83D"/>
    <rect x="11" y="36.5" width="42" height="7" rx="3.5" fill="#6B3518"/>
    <path d="M12 44h40v1.5a5 5 0 0 1-5 5H17a5 5 0 0 1-5-5z" fill="#F4A340" stroke="#7A3A12" stroke-width="1.6"/>
  </g>
</svg>
"""


def main():
    SAIDA.mkdir(exist_ok=True)
    alvos = {
        "icone-192.png": png(192),
        "icone-512.png": png(512),
        # Maskable: fundo até a borda e símbolo dentro da zona segura (80%).
        "icone-maskable-512.png": png(512, escala=0.68, cantos=False),
        "apple-touch-icon.png": png(180, cantos=False),
    }
    for nome, dados in alvos.items():
        (SAIDA / nome).write_bytes(dados)
        print(f"{nome}: {len(dados)} bytes")
    (SAIDA / "icone.svg").write_text(SVG, encoding="utf-8")
    print("icone.svg")


if __name__ == "__main__":
    main()
