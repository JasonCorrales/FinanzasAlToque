export class DomainValidationError extends Error {
  override readonly name = "DomainValidationError";

  constructor(message: string) {
    super(message);
  }
}
