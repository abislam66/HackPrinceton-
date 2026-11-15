import type { ComponentProps, ReactNode } from "react";

type Props = Omit<ComponentProps<"button">, "aria-pressed"> & {
  children: ReactNode;
  /** Whether this option is the chosen one. */
  pressed: boolean;
};

/** A row of option cells. Wraps on narrow screens. */
export function Cells({ children, className, ...rest }: ComponentProps<"div">) {
  return (
    <div className={["tm-cells", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}

/** One boxed option: a toggle, a filter, a tab. For an action that does something, use Button. */
export function Cell({ children, pressed, className, ...rest }: Props) {
  return (
    <button type="button" aria-pressed={pressed} className={["tm-cell", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </button>
  );
}
