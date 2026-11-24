/** FR-5: a match reason is at most this many characters, in storage and in the digest. */
export const MAX_REASONING_CHARS = 200;

/**
 * Collapses whitespace and cuts the reason to `MAX_REASONING_CHARS`,
 * ending a cut reason with an ellipsis so it doesn't read as complete.
 */
export const truncateReasoning = (reasoning: string): string => {
  const normalized = reasoning.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_REASONING_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_REASONING_CHARS - 1).trimEnd()}…`;
};
