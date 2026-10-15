/** Initials in a circle: the account avatar, since profile photos aren't collected. */
export function Monogram({ name, className }: { name: string; className?: string }) {
  const words = name.replace(/^@/, "").split(/[\s._]+/).filter(Boolean);
  // First and last word: "Red Deer VIBIN" and "Red Deer Polytechnic" share a prefix but not an ending.
  const initials = (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.replace(/^@/, "").slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden="true" className={className ?? "hidden size-8 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-semibold tracking-wide text-foreground/80 sm:flex"}>
      {initials}
    </span>
  );
}
