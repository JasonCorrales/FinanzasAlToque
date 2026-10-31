export type TransactionOutcomeStatus =
  | "registered"
  | "pending_confirmation"
  | "needs_information"
  | "possible_duplicate"
  | "rejected"
  | "processing_error";

export interface TransactionOutcome {
  status: TransactionOutcomeStatus;
  message: string;
}
