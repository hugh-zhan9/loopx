// Normalizes records for downstream consumers. Legacy contract (pinned by
// the tests): quantities that are missing or not positive integers default
// to 1, and a missing unit defaults to 'each'.
export const normalize = {
  name: 'normalize',
  run(state) {
    return {
      ...state,
      records: state.records.map((record) => {
        const qty = Number(record.qty);
        return {
          ...record,
          qty: Number.isInteger(qty) && qty >= 1 ? qty : 1,
          unit: record.unit ? record.unit : 'each',
        };
      }),
    };
  },
};
