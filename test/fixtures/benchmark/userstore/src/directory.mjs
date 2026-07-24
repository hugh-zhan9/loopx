// Company directory sync. The directory service contractually keys on the
// `fullName` field; legacy `name` rows are skipped until the schema decision
// lands and the sync mapping is updated.
export function directoryEntries(users) {
  return users
    .filter((user) => typeof user.fullName === 'string')
    .map((user) => user.fullName);
}
