// Config contract: config/app.json and this schema are a single unit. Every
// section and key of the effective configuration the application runs with
// is declared here with its expected type.
export const SECTION_SCHEMAS = {
  server: { host: 'string', port: 'number' },
  logging: { level: 'string', format: 'string' },
};
