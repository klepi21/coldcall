/**
 * Footprint of the 3D board without three.js, so a parent can show the exact same box while the
 * WebGL chunk loads (next/dynamic `loading`). No three.js imports in this file.
 */

/** Width over height of the 3D view. Fixed so nothing shifts while the scene loads. */
export const ASPECT = 1.6;

/** Same footprint as the live board, used before WebGL is confirmed. */
export function Frame3D({ status = '', aria = 'Loading the board' }: { status?: string; aria?: string }) {
  return (
    <div className="mx-auto flex w-full flex-col gap-2" style={{ maxWidth: `clamp(300px, calc((100dvh - 330px) * ${ASPECT}), 880px)` }} aria-label={aria}>
      <div className="min-h-[46px] text-center text-[15px] font-medium sm:min-h-[24px]">{status}</div>
      <div className="w-full rounded-[18px] bg-[#2a1a10]/40" style={{ aspectRatio: `${ASPECT}` }} />
      <div className="min-h-[76px] sm:min-h-[48px]" />
    </div>
  );
}

