import { CustomerContactBlock } from '@/components/customers/components/CustomerContactBlock';
import React from 'react';

type NegocioLocation = {
  direccion?: string | null;
  vereda?: { nombre?: string | null } | null;
  municipio?: { nombre?: string | null; departamento?: { nombre?: string | null } | null } | null;
};

type CustomerMeta = {
  id_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
};

/**
 * Llamar, WhatsApp (si el teléfono sirve) y abrir la dirección en el mapa,
 * bajo la cabecera del negocio. La dirección es la del negocio (donde se
 * cobra); si no tiene, la del cliente.
 */
export function NegocioCustomerContact({
  customerName,
  customer,
  negocio,
}: {
  customerName: string;
  customer: CustomerMeta | null | undefined;
  negocio: NegocioLocation;
}) {
  const ownAddress = negocio.direccion?.trim() || null;
  return (
    <CustomerContactBlock
      actionsOnly
      customer={{
        name: customerName,
        id_number: customer?.id_number ?? null,
        phone: customer?.phone ?? null,
        email: customer?.email ?? null,
        address: ownAddress || customer?.address?.trim() || null,
        vereda_name: negocio.vereda?.nombre ?? null,
        municipio_name: negocio.municipio?.nombre ?? null,
        departamento_name: negocio.municipio?.departamento?.nombre ?? null,
      }}
    />
  );
}
