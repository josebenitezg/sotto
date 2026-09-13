import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// text-small is the 13/18 type role from globals.css, a font size, not a color.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": ["text-small"] } },
});
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
