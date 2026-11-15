import { cx } from "@/lib/cx";
import { initials } from "@/lib/labels";

export type AvatarProps = {
  /** A company or person. The tile shows up to two initials. */
  name: string;
  /** 40 (default) leads a stakeholder row; 24 sits inline with text. */
  size?: 24 | 40;
  className?: string;
};

/** A square Stucco tile with the initials in Geist 600. Never round. Decorative: the name is always written beside it. */
export function Avatar({ name, size = 40, className }: AvatarProps) {
  return (
    <span aria-hidden="true" data-size={size} className={cx("app-avatar", className)}>
      {initials(name)}
    </span>
  );
}
