"use client";

/**
 * Memoised validation of a `ShedConfig`, split by severity for the checks panel.
 */
import { useMemo } from "react";
import { validate } from "@/lib/shed/validation";
import type { Issue, ShedConfig } from "@/types/shed";

/** Validation results grouped by severity. */
export interface ValidationResult {
  /** All issues, in the engine's order. */
  issues: Issue[];
  /** Error-severity issues. */
  errs: Issue[];
  /** Warning-severity issues. */
  warns: Issue[];
  /** Note-severity issues. */
  notes: Issue[];
}

/** Validate `cfg` and group the issues by severity. Recomputed on config change. */
export function useValidation(cfg: ShedConfig): ValidationResult {
  return useMemo(() => {
    const issues = validate(cfg);
    return {
      issues,
      errs: issues.filter((i) => i.sev === "err"),
      warns: issues.filter((i) => i.sev === "warn"),
      notes: issues.filter((i) => i.sev === "note"),
    };
  }, [cfg]);
}
