import { nanoid } from "nanoid";

export function newId() {
  return `n${nanoid()}`;
}
