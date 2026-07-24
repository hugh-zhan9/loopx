// Consumer of the server section.
export function serverAddress(config) {
  return `${config.server.host}:${config.server.port}`;
}
