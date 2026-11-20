import { describe, expect, it } from 'vitest';
import { acceptsShared, parseShareForm, SHARE_MAX_FILES, shareText } from './parse.ts';

function file(name: string, type: string, size = 100): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('parseShareForm', () => {
  it('lê título, texto, link e os arquivos aceitos; descarta o que não é imagem nem PDF', () => {
    const form = new FormData();
    form.set('title', '  Sua reserva ');
    form.set('text', 'Reserva confirmada!');
    form.set('url', 'https://booking.com/x');
    form.append('files', file('voucher.pdf', 'application/pdf'));
    form.append('files', file('print.jpg', 'image/jpeg'));
    form.append('files', file('planilha.xlsx', 'application/vnd.ms-excel'));
    form.append('files', file('sem-tipo.png', ''));
    const share = parseShareForm(form);
    expect(share.title).toBe('Sua reserva');
    expect(share.text).toBe('Reserva confirmada!');
    expect(share.url).toBe('https://booking.com/x');
    expect(share.files.map((f) => f.name)).toEqual(['voucher.pdf', 'print.jpg', 'sem-tipo.png']);
    expect(share.dropped).toBe(1);
  });

  it('vazio fica null; mais de 10 arquivos, ou acima de 10 MB, saem', () => {
    const form = new FormData();
    form.set('text', '   ');
    for (let i = 0; i < SHARE_MAX_FILES + 2; i++)
      form.append('files', file(`p${String(i)}.jpg`, 'image/jpeg'));
    form.append('files', file('grande.pdf', 'application/pdf', 10 * 1024 * 1024 + 1));
    const share = parseShareForm(form);
    expect(share.title).toBeNull();
    expect(share.text).toBeNull();
    expect(share.files).toHaveLength(SHARE_MAX_FILES);
    expect(share.dropped).toBe(3);
    expect(acceptsShared({ type: '', name: 'x.bin', size: 10 })).toBe(false);
    expect(acceptsShared({ type: 'image/heic', name: 'x', size: 10 })).toBe(true);
  });

  it('o texto para a leitura junta o que houver', () => {
    expect(shareText({ title: 'Reserva', text: 'ok', url: null })).toBe('Reserva\n\nok');
    expect(shareText({ title: null, text: null, url: 'https://x' })).toBe('https://x');
    expect(shareText({ title: null, text: null, url: null })).toBe('');
  });
});
