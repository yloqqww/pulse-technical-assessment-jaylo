export const SAFETY_REPORT_REASONS = {
  harassment: "Harassment or bullying",
  sexual: "Sexual or explicit content",
  hate: "Hate or discrimination",
  threats: "Threats or dangerous behavior",
  spam: "Spam or scam",
  other: "Something else",
} as const;

export type SafetyReportReason = keyof typeof SAFETY_REPORT_REASONS;
export type SafetyAction = "block" | "report";

export function isSafetyAction(value: unknown): value is SafetyAction {
  return value === "block" || value === "report";
}

export function isSafetyReportReason(value: unknown): value is SafetyReportReason {
  return typeof value === "string" && value in SAFETY_REPORT_REASONS;
}
