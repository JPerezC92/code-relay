/**
 * Failure returned by the session service. The message is safe to surface in
 * the chat screen; it never contains session keys or pairing secrets.
 */
export class SessionServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionServiceError';
  }
}
