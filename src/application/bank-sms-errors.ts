export class BankSmsAuthenticationError extends Error {
  constructor() {
    super("bank SMS authentication failed");
    this.name = "BankSmsAuthenticationError";
  }
}

export class BankSmsValidationError extends Error {
  constructor(message = "bank SMS capture does not match the configured template") {
    super(message);
    this.name = "BankSmsValidationError";
  }
}

export class BankSmsConfigurationError extends Error {
  constructor(message = "bank SMS configuration is unavailable") {
    super(message);
    this.name = "BankSmsConfigurationError";
  }
}
