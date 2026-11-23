/**
 * Code-level cost guardrails for scheduled runs. Each limit reads an
 * environment variable and falls back to a conservative default when the
 * variable is unset, empty, zero, negative, or not an integer.
 */

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Max due users the dispatcher processes per scheduled tick. Users over the
 * cap keep their due `gsi1sk` and run on a later tick.
 */
export const MAX_USERS_PER_DISPATCH = parsePositiveInt(
  process.env.MAX_USERS_PER_DISPATCH,
  5,
);

/**
 * Max Bedrock job evaluations per user per run. Jobs over the cap are not
 * evaluated or saved this run, so the next run evaluates them.
 */
export const MAX_BEDROCK_EVALUATIONS_PER_USER = parsePositiveInt(
  process.env.MAX_BEDROCK_EVALUATIONS_PER_USER,
  20,
);

/** Maximum distinct target roles queried against each portal in one run. */
export const MAX_SEARCH_ROLES_PER_SOURCE = parsePositiveInt(
  process.env.MAX_SEARCH_ROLES_PER_SOURCE,
  3,
);

/** Maximum jobs accepted from each portal in one user run. */
export const MAX_JOBS_PER_SOURCE = parsePositiveInt(
  process.env.MAX_JOBS_PER_SOURCE,
  20,
);

/** Maximum scraped description characters included in one Bedrock prompt. */
export const MAX_BEDROCK_DESCRIPTION_CHARS = parsePositiveInt(
  process.env.MAX_BEDROCK_DESCRIPTION_CHARS,
  6_000,
);
