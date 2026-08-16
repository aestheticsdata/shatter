export function zeroPad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}
