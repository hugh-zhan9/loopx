// Consumer of the logging section.
export function loggerOptions(config) {
  return { level: config.logging.level, format: config.logging.format };
}
