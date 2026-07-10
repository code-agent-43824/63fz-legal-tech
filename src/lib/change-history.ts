export type TransitionChangeType = "changed" | "deleted" | "introduced";

export function normalizeForComparison(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function getTransitionChangeType(
  previousFragment: { text: string } | null,
  fragment: { text: string } | null,
): TransitionChangeType | null {
  if (previousFragment && fragment) {
    return normalizeForComparison(previousFragment.text) === normalizeForComparison(fragment.text)
      ? null
      : "changed";
  }

  if (fragment) {
    return "introduced";
  }

  if (previousFragment) {
    return "deleted";
  }

  return null;
}
