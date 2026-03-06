import { useState, useEffect } from 'react';

export function useImageProcessor(src: string): string | null {
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const w = img.width;
      const h = img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const visited = new Uint8Array(w * h);
      // Start from 4 corners
      const stack = [0, w - 1, (h - 1) * w, h * w - 1];

      function isBG(idx: number) {
        const i = idx * 4;
        // We look for near-white pixels (e.g., above 230 RGB)
        return data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230 && data[i + 3] > 0;
      }

      while (stack.length > 0) {
        const current = stack.pop()!;
        if (visited[current]) continue;
        visited[current] = 1;

        if (isBG(current)) {
          const p = current * 4;
          data[p + 3] = 0; // Make transparent

          const x = current % w;
          const y = Math.floor(current / w);

          if (x > 0 && !visited[current - 1]) stack.push(current - 1);
          if (x < w - 1 && !visited[current + 1]) stack.push(current + 1);
          if (y > 0 && !visited[current - w]) stack.push(current - w);
          if (y < h - 1 && !visited[current + w]) stack.push(current + w);
        }
      }

      ctx.putImageData(imgData, 0, 0);
      if (!cancelled) {
        setProcessedUrl(canvas.toDataURL('image/png'));
      }
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return processedUrl;
}
