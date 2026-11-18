'use client';
/** True when the device can comfortably run the 3D boards. */
export function canUse3d(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    const mem = (navigator as any).deviceMemory as number | undefined;
    if (mem !== undefined && mem < 3) return false;
    return true;
  } catch {
    return false;
  }
}
