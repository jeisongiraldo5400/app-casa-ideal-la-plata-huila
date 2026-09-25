import { negocioCardOpensSyncQueue, withUnsyncedNegociosFirst } from '../negocioSyncBadge';

const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });

describe('withUnsyncedNegociosFirst', () => {
  it('con señal añade arriba los negocios del teléfono que el servidor no trae', () => {
    const result = withUnsyncedNegociosFirst([row('a'), row('b')], [row('local')], { local: 'rejected' });
    expect(result.map((item) => item.id)).toEqual(['local', 'a', 'b']);
  });

  it('sin señal los reordena sin duplicarlos y conserva la fila de la lista', () => {
    const listed = row('local', { from: 'list' });
    const result = withUnsyncedNegociosFirst([row('a'), listed], [row('local', { from: 'overlay' })], {
      local: 'pending',
    });
    expect(result.map((item) => item.id)).toEqual(['local', 'a']);
    expect(result[0]).toBe(listed);
  });

  it('no toca la lista cuando no hay nada sin confirmar', () => {
    const list = [row('a'), row('b')];
    expect(withUnsyncedNegociosFirst(list, [], {})).toBe(list);
  });

  it('descarta filas del teléfono que ya no tienen estado (confirmadas)', () => {
    expect(withUnsyncedNegociosFirst([row('a')], [row('old')], {}).map((item) => item.id)).toEqual(['a']);
  });
});

describe('negocioCardOpensSyncQueue', () => {
  it('rechazado siempre abre «Cambios sin sincronizar»', () => {
    expect(negocioCardOpensSyncQueue('rejected', false)).toBe(true);
    expect(negocioCardOpensSyncQueue('rejected', true)).toBe(true);
  });

  it('pendiente abre la ficha local sin señal y la cola con señal', () => {
    expect(negocioCardOpensSyncQueue('pending', false)).toBe(false);
    expect(negocioCardOpensSyncQueue('pending', true)).toBe(true);
  });

  it('un negocio confirmado abre su ficha', () => {
    expect(negocioCardOpensSyncQueue(undefined, true)).toBe(false);
  });
});
