/** Classes for an element that is laid out from the start and fades up when its step arrives, so nothing below it jumps. */
export function reveal(shown: boolean): string {
  return [
    "transition-[opacity,translate] duration-500 ease-link motion-reduce:transition-none",
    shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
  ].join(" ");
}

/** "general-contractor" reads as "general contractor". Tags set it in caps. */
export const plain = (value: string) => value.replaceAll("-", " ");
