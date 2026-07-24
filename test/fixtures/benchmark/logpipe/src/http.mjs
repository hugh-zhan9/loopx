// HTTP access logging producer.
export function logRequest(logger, request) {
  logger.log('http_request', {
    method: request.method,
    path: request.path,
    ip: request.ip,
    userId: request.userId,
    email: request.email,
  });
}
