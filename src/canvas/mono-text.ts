/**
 * Draw numeric text with monospaced digit spacing on Canvas.
 * Measures the widest digit (0-9) and spaces all digit characters equally,
 * so proportional fonts don't cause value jitter.
 * Non-digit characters (minus sign, decimal point) use their natural width.
 */
export function fillTextMono(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  align: 'center' | 'left' | 'right' = 'center',
): void {
  // Measure widest digit
  let digitWidth = 0;
  for (let d = 0; d <= 9; d++) {
    const w = ctx.measureText(String(d)).width;
    if (w > digitWidth) digitWidth = w;
  }

  // Calculate total width: digits use digitWidth, others use natural width
  const chars = text.split('');
  const widths = chars.map((ch) =>
    ch >= '0' && ch <= '9' ? digitWidth : ctx.measureText(ch).width,
  );
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  // Starting x based on alignment
  let cx: number;
  switch (align) {
    case 'left':
      cx = x;
      break;
    case 'right':
      cx = x - totalWidth;
      break;
    case 'center':
    default:
      cx = x - totalWidth / 2;
      break;
  }

  // Draw each character centered in its cell
  const savedAlign = ctx.textAlign;
  ctx.textAlign = 'center';
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx + widths[i] / 2, y);
    cx += widths[i];
  }
  ctx.textAlign = savedAlign;
}
