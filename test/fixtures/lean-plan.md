# Preserve Custom Export Names

## Outcomes

- Existing custom export names remain unchanged when configuration is reloaded.

## Boundaries

- Do not change the configuration file format or default export naming.

## Likely Modules

- `src/config-loader.mjs`
- `test/config-loader.test.mjs`

## Known Dependencies

- The reload path consumes the normalized configuration returned by the loader.

## Acceptance

- A configured custom name survives initial load and one reload.
- Configurations without a custom name retain the current default.

## Verification

- Run the focused configuration-loader tests.
- Run the repository test suite.
