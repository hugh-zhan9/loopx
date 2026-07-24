import { listRecords } from './store.mjs';

// Command registry. `run` receives the command's input (the records array
// for record-consuming commands, text for text-consuming ones) and returns
// the text the CLI prints. New commands register here; docs/USAGE.md is
// generated from this table by scripts/gen-usage.mjs.
export const COMMANDS = {
  list: {
    summary: 'Print one line per record (id and name).',
    run: (records) => listRecords(records),
  },
};

export function dispatch(name, input) {
  const command = COMMANDS[name];
  if (!command) throw new Error(`unknown_command:${name}`);
  return command.run(input);
}
