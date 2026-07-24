// Invoicing export. The billing vendor's spec (VND-3) contractually keys on
// the `name` field; rows still on `fullName` are skipped until the schema
// decision lands and the vendor mapping is renegotiated.
export function invoiceRecipients(users) {
  return users
    .filter((user) => typeof user.name === 'string')
    .map((user) => `${user.name} <${user.plan}>`);
}
