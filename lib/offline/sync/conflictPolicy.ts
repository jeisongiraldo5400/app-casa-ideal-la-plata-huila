export type CustomerConflict = {
  localId: string;
  idNumber: string;
  existingId: string;
  existingName: string;
};

export function resolveCustomerIdNumberConflict(input: {
  localId: string;
  idNumber: string;
  existing: { id: string; name: string } | null;
}): { status: 'ok' | 'conflict'; conflict?: CustomerConflict } {
  if (!input.existing || input.existing.id === input.localId) {
    return { status: 'ok' };
  }
  return {
    status: 'conflict',
    conflict: {
      localId: input.localId,
      idNumber: input.idNumber,
      existingId: input.existing.id,
      existingName: input.existing.name,
    },
  };
}
