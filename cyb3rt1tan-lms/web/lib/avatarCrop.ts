export function cropRectangle(
  width: number,
  height: number,
  zoom: number,
  horizontal: number,
  vertical: number,
) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('imageInvalid');
  const clamp = (value: number, low: number, high: number) =>
    Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low;
  const side = Math.min(width, height) / clamp(zoom, 1, 3);
  return {
    x: ((width - side) * clamp(horizontal, 0, 100)) / 100,
    y: ((height - side) * clamp(vertical, 0, 100)) / 100,
    side,
  };
}
