import {
  childGroupLabel,
  groupKeyOf,
  groupLabelFor,
  orderedGroupKeys,
  ownGroupLabel,
  targetOrderIdForGroup,
} from '../deliveryGroups';

const own = { source_delivery_order_id: null };
const childA = { source_delivery_order_id: 'child-a', source_order_number: 'OE-2026-0012', source_customer_name: 'Cliente Norte' };
const childB = { source_delivery_order_id: 'child-b', source_order_number: 'OE-2026-0003', source_customer_name: 'Cliente Sur' };

describe('deliveryGroups', () => {
  it('groupKeyOf y targetOrderIdForGroup: propios apuntan a la orden seleccionada, copias a la OE hija', () => {
    expect(groupKeyOf(null)).toBe('own');
    expect(groupKeyOf('child-a')).toBe('child-a');
    expect(targetOrderIdForGroup('rem-1', 'own')).toBe('rem-1');
    expect(targetOrderIdForGroup('rem-1', 'child-a')).toBe('child-a');
  });

  it('etiquetas: propios según tipo de orden; hijas con número y cliente', () => {
    expect(ownGroupLabel('remission')).toBe('Productos de la remisión');
    expect(ownGroupLabel('customer')).toBe('Productos de la orden');
    expect(childGroupLabel(childA)).toBe('OE-2026-0012 · Cliente Norte');
    expect(childGroupLabel({ source_delivery_order_id: 'abcdef1234', source_order_number: null, source_customer_name: null })).toBe('abcdef12 · Cliente');
    expect(groupLabelFor({ order_type: 'remission', items: [own, childA] }, 'child-a')).toBe('OE-2026-0012 · Cliente Norte');
    expect(groupLabelFor({ order_type: 'remission', items: [own, childA] }, 'own')).toBe('Productos de la remisión');
  });

  it('orderedGroupKeys: propios primero y luego las hijas por número de orden', () => {
    expect(orderedGroupKeys([childA, own, childB, childA])).toEqual(['own', 'child-b', 'child-a']);
    expect(orderedGroupKeys([childA, childB])).toEqual(['child-b', 'child-a']);
    expect(orderedGroupKeys([own])).toEqual(['own']);
  });
});
