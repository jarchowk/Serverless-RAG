export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 100
): string[] {
  const chunks: string[] = [];
  if (!text) return chunks;

  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.substring(i, end));
    i += chunkSize - overlap;
    if (i + overlap >= text.length && end === text.length) break; // Avoid tiny last chunk if overlap makes it so
    if (i < 0) i = end; // if overlap pushes i back too much
  }
  return chunks.filter((chunk) => chunk.trim() !== "");
}
