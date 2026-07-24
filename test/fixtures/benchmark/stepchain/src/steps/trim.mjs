// Trims incoming string fields so downstream steps see canonical spacing.
export const trim = {
  name: 'trim',
  run(state) {
    return {
      ...state,
      records: state.records.map((record) => ({
        ...record,
        sku: typeof record.sku === 'string' ? record.sku.trim() : record.sku,
        unit: typeof record.unit === 'string' ? record.unit.trim() : record.unit,
      })),
    };
  },
};
