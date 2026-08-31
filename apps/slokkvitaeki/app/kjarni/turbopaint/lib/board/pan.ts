/** When the view should pan instead of drawing or selecting. */

export function shouldPanView(input: {
  button: number;
  pointerType?: string;
  tool: string;
  spacePan: boolean;
}): boolean {
  if (input.spacePan) return true;
  if (input.button === 1) return true;
  if (isRightMouseButton(input.button, input.pointerType)) return true;
  if (input.tool === "hand" && input.pointerType !== "mouse") return true;
  return false;
}

export function isRightMouseButton(button: number, pointerType?: string): boolean {
  return button === 2 && pointerType !== "touch" && pointerType !== "pen";
}
