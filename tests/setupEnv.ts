process.env.SESSION_SECRET ||= "test-only-session-secret-not-for-production-0123456789abcdef";
// NODE_ENV is set to "test" by Vitest automatically; not reassigned here
// because @types/node marks it readonly.
