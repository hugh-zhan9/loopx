// Signup funnel logging producer.
export function logSignup(logger, user) {
  logger.log('signup', {
    userId: user.id,
    email: user.email,
    ip: user.ip,
    referrer: user.referrer,
    message: user.message,
  });
}
