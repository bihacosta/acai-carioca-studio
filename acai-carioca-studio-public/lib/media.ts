import { supabase } from "@/lib/supabase";

/** Upload an image to the shared "creative-assets" bucket and return its public URL. */
export async function uploadImage(file: File, userId: string): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("creative-assets").upload(path, file, { upsert: false });
  if (error) throw error;
  return supabase.storage.from("creative-assets").getPublicUrl(path).data.publicUrl;
}

const colorCache = new Map<string, string>();

/** Average color of an image (small, fast sample). Returns a CSS rgb() string, or null if unreadable. */
export function dominantColor(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url)!);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        // Weight saturated, mid-tone pixels more so the color reads like the photo's "mood".
        let r = 0, g = 0, b = 0, w = 0;
        for (let i = 0; i < data.length; i += 4) {
          const R = data[i], G = data[i + 1], B = data[i + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const sat = max === 0 ? 0 : (max - min) / max;
          const light = (max + min) / 510;
          const weight = 0.25 + sat * (1 - Math.abs(light - 0.5) * 1.4);
          r += R * weight; g += G * weight; b += B * weight; w += weight;
        }
        const color = `rgb(${Math.round(r / w)}, ${Math.round(g / w)}, ${Math.round(b / w)})`;
        colorCache.set(url, color);
        resolve(color);
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
