import type { ReactNode } from "react";

type Size = "xl" | "l" | "m" | "s" | "xs";

type Props = {
  children: ReactNode;
  /** The visual size. 120, 76, 48, 36 or 28 px on a 1440 px screen. */
  size: Size;
  /** The tag, chosen for the document outline, not for the look. */
  as?: "h1" | "h2" | "h3" | "h4" | "p";
  className?: string;
};

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * A heading in the right face. Rigid Square 600 carries headings of six words or fewer;
 * longer titles go to Geist 600. Generated copy can be any length, so the choice is made here.
 */
export function Heading({ children, size, as: Tag = "h2", className }: Props) {
  const long = typeof children === "string" && wordCount(children) > 6;
  const cls = [long ? "tm-h-long" : "tm-h", `tm-h--${size}`, className ?? ""].filter(Boolean).join(" ");
  return <Tag className={cls}>{children}</Tag>;
}
