import { getStatusLabel } from '../index';

describe('getStatusLabel de las tarjetas de órdenes', () => {
  it.each([
    ['sent_by_remission', 'En remisión'],
    ['approved', 'Aprobada'],
    ['in_transit', 'En tránsito'],
    ['returned', 'Devuelta'],
    ['pending', 'Pendiente'],
    ['delivered', 'Entregada'],
    ['cancelled', 'Cancelada'],
    ['ready', 'Lista'],
    ['preparing', 'Preparando'],
  ])('«%s» se muestra en español como «%s»', (status, label) => {
    expect(getStatusLabel(status)).toBe(label);
  });
});
