import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Hex } from '../lib/color/types';
import {
  extractSamplePoints,
  sampleHexAt,
  type RGBAImage,
  type SamplePoint,
} from '../lib/color/extract-image';

/**
 * The source-image panel for `/image-color-picker`. It is the ONLY editor of
 * palette colors on that page (image-authoritative mode): a visitor uploads an
 * image, the panel extracts up to `cap` dominant colors as draggable *sample
 * points*, and they can drag those circles, drop new ones on empty image area,
 * or remove them. Every reported color is a real pixel under a circle (Model 1
 * - see `extract-image.ts`).
 *
 * The component is presentation + interaction only; it owns the decoded image
 * but NOT the palette. The current sample points come down as `points` (mirrored
 * from ShadeTool's tray) and every gesture calls back up - so the tray, the
 * preview band, and the ramp below all stay in lockstep with the circles.
 *
 * It is lazy-loaded by ShadeTool so its canvas/extraction code never ships in
 * the `/` and `/[hex]` bundles. The `quantize` library is pulled in here, again
 * only on this route.
 */

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
// Long-edge working resolution. Big enough that sampling and the loupe stay
// crisp; small enough that median-cut and per-pixel reads are instant.
const MAX_EDGE = 1000;
// A pointer-down that moves less than this (in CSS px) before release counts as
// a click (drop a new point) rather than a drag.
const CLICK_SLOP = 4;
// Loupe geometry. Each source pixel renders at LOUPE_PX / LOUPE_REGION on screen
// (here 224 / 7 = 32px) — a high magnification so individual pixels are large and
// legible. Keep LOUPE_REGION odd so there's a true center pixel under the crosshair.
const LOUPE_PX = 224; // on-screen size of the magnifier
const LOUPE_REGION = 7; // source pixels shown across the loupe (odd → true center)

// Built-in demo images offered under the empty-state dropzone so a visitor can
// try the extractor with one click - a deliberate spread of source types
// (smooth gradient, flat solid-color logo, real photo, flat illustration). They
// live in `public/samples/` (built by `scripts/generate-sample-images.mjs`).
const SAMPLE_IMAGES: ReadonlyArray<{ id: string; label: string; src: string }> = [
  { id: 'gradient', label: 'Gradient', src: '/samples/gradient.jpg' },
  { id: 'logo', label: 'Logo', src: '/samples/logo.png' },
  { id: 'photo', label: 'Photo', src: '/samples/photo.jpg' },
  { id: 'landscape', label: 'Landscape', src: '/samples/landscape.jpg' },
];

export interface ImagePalettePanelProps {
  /** Current palette colors with their on-image locations (from the tray). */
  points: SamplePoint[];
  /** The active/selected color, highlighted on the image, or null when none. */
  activeHex: Hex | null;
  /** How many dominant colors to auto-extract on image load. */
  cap: number;
  /** Replace the whole palette (fired once per successful extraction). */
  onExtract: (points: SamplePoint[]) => void;
  /** Append one user-dropped sample point. */
  onAddPoint: (point: SamplePoint) => void;
  /** Update the sample point at `index` (live, during a drag). */
  onMovePoint: (index: number, point: SamplePoint) => void;
  /** Remove the sample point at `index`. */
  onRemovePoint: (index: number) => void;
  /** Make the sample point at `index` the active color. */
  onSelectPoint: (index: number) => void;
  /** Notifies whether an image is currently loaded. */
  onImageStateChange?: (hasImage: boolean) => void;
  /** Surfaces a message through the page's shared toast. */
  onNotify?: (message: string) => void;
}

interface LoupeState {
  /** Viewport coordinates of the cursor (for positioning the magnifier). */
  clientX: number;
  clientY: number;
  /** Source-pixel center the loupe is magnifying. */
  px: number;
  py: number;
  hex: Hex;
}

export default function ImagePalettePanel({
  points,
  activeHex,
  cap,
  onExtract,
  onAddPoint,
  onMovePoint,
  onRemovePoint,
  onSelectPoint,
  onImageStateChange,
  onNotify,
}: ImagePalettePanelProps) {
  // The decoded, downscaled image. `imageData` backs pixel reads; `srcCanvas`
  // backs the magnified loupe (drawImage with smoothing off). Both are refs -
  // they're large mutable DOM/buffer objects, not render inputs.
  const imageDataRef = useRef<RGBAImage | null>(null);
  const srcCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Which sample thumbnail is currently being fetched/decoded, so we can spotlight
  // just that one (others dim) instead of a single shared busy state for all four.
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loupe, setLoupe] = useState<LoupeState | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Drag/click bookkeeping kept in refs so pointer handlers read live values
  // without re-subscribing. `dragRef` holds the index being dragged; `pressRef`
  // tracks a press on empty area that may become a click-to-add.
  const dragRef = useRef<number | null>(null);
  const pressRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(
    null,
  );

  const notify = useCallback((m: string) => onNotify?.(m), [onNotify]);

  // Revoke the object URL on unmount so we don't leak blobs across re-uploads.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const setImage = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        notify('That file is not an image.');
        return;
      }
      setBusy(true);
      try {
        const bitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        });
        const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          notify("Couldn't read the image in this browser.");
          return;
        }
        ctx.drawImage(bitmap, 0, 0, w, h);
        if ('close' in bitmap) bitmap.close();
        const imageData = ctx.getImageData(0, 0, w, h);

        srcCanvasRef.current = canvas;
        imageDataRef.current = imageData;

        // Display the original file (sharper than the downscaled buffer); the
        // overlay maps pointer → normalized coords, so display size is free to
        // differ from the analysis buffer.
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        setImgUrl(url);
        onImageStateChange?.(true);

        const extracted = extractSamplePoints(imageData, cap);
        onExtract(extracted);
        notify(
          extracted.length > 0
            ? `Extracted ${extracted.length} color${extracted.length === 1 ? '' : 's'}.`
            : "Couldn't find colors in that image.",
        );
      } catch {
        notify("Couldn't load that image.");
      } finally {
        setBusy(false);
      }
    },
    [cap, notify, onExtract, onImageStateChange],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset so re-selecting the same file fires change again.
      e.target.value = '';
      if (file) void setImage(file);
    },
    [setImage],
  );

  // Fetch a bundled sample image and run it through the same extraction path as
  // an upload. Same-origin, so it's covered by the `connect-src 'self'` CSP.
  // loadSample owns the busy lifecycle in a finally: `setImage` clears busy on
  // its own paths, but its non-image-type guard early-returns *without* throwing,
  // so trusting it alone could strand busy=true (every button stuck disabled) if
  // a sample ever resolved to a non-image body (e.g. an HTML 200 fallback). We
  // also reject a non-image content-type up front so that case shows the toast.
  const loadSample = useCallback(
    async (sample: { id: string; label: string; src: string }) => {
      if (busy) return;
      setBusy(true);
      setLoadingSampleId(sample.id);
      try {
        const res = await fetch(sample.src);
        if (!res.ok) throw new Error(`sample fetch failed: ${res.status}`);
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) {
          throw new Error(`sample is not an image (${blob.type || 'unknown type'})`);
        }
        const file = new File([blob], `sample-${sample.label}`, { type: blob.type });
        await setImage(file);
      } catch {
        notify("Couldn't load that sample image.");
      } finally {
        setBusy(false);
        setLoadingSampleId(null);
      }
    },
    [busy, notify, setImage],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void setImage(file);
    },
    [setImage],
  );

  // Paste an image from the clipboard while this panel is mounted.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((it) =>
        it.type.startsWith('image/'),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        void setImage(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [setImage]);

  const clearImage = useCallback(() => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    srcCanvasRef.current = null;
    imageDataRef.current = null;
    setImgUrl(null);
    setLoupe(null);
    onImageStateChange?.(false);
    onExtract([]);
  }, [onExtract, onImageStateChange]);

  // --- Pointer geometry ---------------------------------------------------
  const normFromEvent = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return { x: 0.5, y: 0.5 };
    const rect = el.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const updateLoupe = useCallback(
    (clientX: number, clientY: number, xN: number, yN: number) => {
      const img = imageDataRef.current;
      if (!img) return;
      const px = Math.round(xN * (img.width - 1));
      const py = Math.round(yN * (img.height - 1));
      setLoupe({ clientX, clientY, px, py, hex: sampleHexAt(img, xN, yN) });
    },
    [],
  );

  // --- Empty-area press → click-to-add ------------------------------------
  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Ignore presses that land on a circle (those start a drag and stop
      // propagation).
      if (!imageDataRef.current) return;
      overlayRef.current?.setPointerCapture(e.pointerId);
      pressRef.current = { startX: e.clientX, startY: e.clientY, moved: false };
    },
    [],
  );

  // A point drag fires `onMovePoint` on every pointermove. Each call rewrites
  // the tray, recomputing every column's ramp/scale and re-rendering ~160
  // swatches - far too heavy to run per move. Coalesce to one rAF: stash the
  // latest {index, point} and flush at most once per frame, always delivering
  // the trailing value (the final move schedules the last flush; `flushMove`
  // on pointer-up/unmount drains anything still pending so the drop lands
  // exactly where released). The loupe still updates per move - it's a cheap
  // local setState confined to this lazy panel, not the grid rebuild.
  const moveRafRef = useRef<number | null>(null);
  const pendingMoveRef = useRef<{ index: number; point: SamplePoint } | null>(null);
  const onMovePointRef = useRef(onMovePoint);
  onMovePointRef.current = onMovePoint;
  const flushMove = useCallback(() => {
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    const m = pendingMoveRef.current;
    if (m) {
      pendingMoveRef.current = null;
      onMovePointRef.current(m.index, m.point);
    }
  }, []);
  const scheduleMove = useCallback(
    (index: number, point: SamplePoint) => {
      pendingMoveRef.current = { index, point };
      if (typeof requestAnimationFrame !== 'function') {
        flushMove();
        return;
      }
      if (moveRafRef.current !== null) return;
      moveRafRef.current = requestAnimationFrame(() => {
        moveRafRef.current = null;
        flushMove();
      });
    },
    [flushMove],
  );

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!imageDataRef.current) return;
      const { x, y } = normFromEvent(e.clientX, e.clientY);
      updateLoupe(e.clientX, e.clientY, x, y);

      const dragIdx = dragRef.current;
      if (dragIdx !== null) {
        scheduleMove(dragIdx, { hex: sampleHexAt(imageDataRef.current, x, y), x, y });
        return;
      }
      const press = pressRef.current;
      if (press && !press.moved) {
        if (
          Math.abs(e.clientX - press.startX) > CLICK_SLOP ||
          Math.abs(e.clientY - press.startY) > CLICK_SLOP
        ) {
          press.moved = true;
        }
      }
    },
    [normFromEvent, scheduleMove, updateLoupe],
  );

  // Flush any pending coalesced move if the panel unmounts mid-drag.
  useEffect(
    () => () => {
      if (moveRafRef.current !== null) flushMove();
    },
    [flushMove],
  );

  const endDrag = useCallback(() => {
    flushMove();
    dragRef.current = null;
    setDraggingIndex(null);
  }, [flushMove]);

  const handleOverlayPointerUp = useCallback(
    (e: React.PointerEvent) => {
      try {
        overlayRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may already be gone */
      }
      if (dragRef.current !== null) {
        endDrag();
        return;
      }
      const press = pressRef.current;
      pressRef.current = null;
      if (!press || press.moved || !imageDataRef.current) return;
      // A clean click on empty area: drop a new sample point.
      const { x, y } = normFromEvent(e.clientX, e.clientY);
      onAddPoint({ hex: sampleHexAt(imageDataRef.current, x, y), x, y });
    },
    [endDrag, normFromEvent, onAddPoint],
  );

  // --- Per-circle drag ----------------------------------------------------
  const handleCirclePointerDown = useCallback(
    (index: number) => (e: React.PointerEvent) => {
      e.stopPropagation();
      if (!imageDataRef.current) return;
      overlayRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = index;
      setDraggingIndex(index);
      onSelectPoint(index);
      const { x, y } = normFromEvent(e.clientX, e.clientY);
      updateLoupe(e.clientX, e.clientY, x, y);
    },
    [normFromEvent, onSelectPoint, updateLoupe],
  );

  // Keyboard nudge: arrow keys move a focused circle by one analysis pixel and
  // re-sample, so the feature is operable without a pointer.
  const handleCircleKeyDown = useCallback(
    (index: number, point: SamplePoint) => (e: React.KeyboardEvent) => {
      const img = imageDataRef.current;
      if (!img) return;
      const stepX = 1 / (img.width - 1 || 1);
      const stepY = 1 / (img.height - 1 || 1);
      let { x, y } = point;
      switch (e.key) {
        case 'ArrowLeft':
          x -= stepX;
          break;
        case 'ArrowRight':
          x += stepX;
          break;
        case 'ArrowUp':
          y -= stepY;
          break;
        case 'ArrowDown':
          y += stepY;
          break;
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          onRemovePoint(index);
          return;
        default:
          return;
      }
      e.preventDefault();
      x = Math.min(1, Math.max(0, x));
      y = Math.min(1, Math.max(0, y));
      onMovePoint(index, { hex: sampleHexAt(img, x, y), x, y });
    },
    [onMovePoint, onRemovePoint],
  );

  // Draw the magnified region whenever the loupe target moves.
  useEffect(() => {
    if (!loupe) return;
    const canvas = loupeCanvasRef.current;
    const src = srcCanvasRef.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext('2d');
    // The loupe is purely visual feedback; core pixel sampling uses `imageData`
    // directly and still works if this 2D context is unavailable, so skip
    // silently rather than surfacing an error.
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, LOUPE_PX, LOUPE_PX);
    const half = (LOUPE_REGION - 1) / 2;
    // Clamp the magnified source rect into the canvas so it always reads a full
    // LOUPE_REGION square near the edges (an unclamped negative/over-bounds rect
    // makes drawImage clip and the centered crosshair misalign).
    const srcX = Math.max(0, Math.min(loupe.px - half, src.width - LOUPE_REGION));
    const srcY = Math.max(0, Math.min(loupe.py - half, src.height - LOUPE_REGION));
    ctx.drawImage(
      src,
      srcX,
      srcY,
      LOUPE_REGION,
      LOUPE_REGION,
      0,
      0,
      LOUPE_PX,
      LOUPE_PX,
    );
    // Center crosshair cell over the exact sampled pixel.
    const cell = LOUPE_PX / LOUPE_REGION;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(half * cell + 0.5, half * cell + 0.5, cell - 1, cell - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeRect(half * cell - 0.5, half * cell - 0.5, cell + 1, cell + 1);
  }, [loupe]);

  const hasImage = imgUrl !== null;

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        onChange={handleFileInput}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasImage ? (
        <>
        {/* Empty state: the upload-first hero dropzone. */}
        <div
          role="region"
          aria-label="Drop an image here, or use the upload button; pasting an image from the clipboard also works"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={[
            'flex min-h-[18rem] flex-col items-center justify-center gap-4 border-2 border-dashed p-8 text-center transition-colors duration-150 ease-out',
            dragOver ? 'border-accent bg-paper-2' : 'border-ink/20 bg-paper-2/40',
          ].join(' ')}
        >
          <ImageIcon className="h-10 w-10 text-mute" />
          <div className="flex flex-col gap-1">
            <p className="font-display text-lg text-ink">
              Drop an image, paste, or upload
            </p>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-mute">
              PNG · JPEG · WebP · GIF — stays in your browser
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-ink px-4 py-2.5 font-mono text-xs uppercase tracking-tight text-paper transition-opacity duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
          >
            <UploadIcon className="h-4 w-4" />
            {busy ? 'Reading…' : 'Upload image'}
          </button>
        </div>

        {/* Sample images: one click loads a bundled demo so a visitor can try
            the extractor without finding a file of their own. */}
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-mute">
            No image? Try a sample
          </p>
          <div className="grid grid-cols-4 gap-2">
            {SAMPLE_IMAGES.map((s) => {
              const isLoading = loadingSampleId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => void loadSample(s)}
                  disabled={busy}
                  aria-label={`Use the ${s.label} sample image`}
                  aria-busy={isLoading}
                  title={s.label}
                  className={[
                    'group relative aspect-[4/3] overflow-hidden bg-paper-2 ring-1 transition-shadow duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none',
                    // Keep the clicked thumbnail bright + accent-ringed while it
                    // loads; dim the others so the click clearly registers.
                    isLoading ? 'ring-accent' : 'ring-ink/15 hover:ring-ink/40',
                    busy && !isLoading ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <img
                    src={s.src}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
                  />
                  {isLoading && (
                    <span className="absolute inset-0 flex items-center justify-center bg-ink/35">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-paper/40 border-t-paper" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        </>
      ) : (
        <div
          className="relative mx-auto w-fit max-w-full select-none"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          {/* Controls pinned to the top edge of the image - the upload button
              literally sits on top of the band that renders directly below. */}
          <div className="absolute left-2 top-2 z-20 flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 bg-ink/85 px-3 py-1.5 font-mono text-[11px] uppercase tracking-tight text-paper backdrop-blur transition-opacity duration-150 ease-out hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              {busy ? 'Reading…' : 'Replace'}
            </button>
            <button
              type="button"
              onClick={clearImage}
              className="inline-flex items-center bg-paper/85 px-3 py-1.5 font-mono text-[11px] uppercase tracking-tight text-ink backdrop-blur ring-1 ring-ink/15 transition-colors duration-150 ease-out hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              Clear
            </button>
          </div>

          {/* The image. `block` kills the inline gap. It sizes to its own
              aspect ratio (capped at max-h-[34rem] tall / 100% wide) rather than
              being stretched to the column with `object-contain` - so the
              wrapper (w-fit) hugs the *rendered* picture and the inset-0 overlay
              matches it exactly. Without this the box spans the full column,
              object-contain letterboxes the picture into the center, and the
              circles land in the empty margins. */}
          <img
            src={imgUrl}
            alt="Uploaded source image with draggable color sample points — drag a circle to change its color, or click the image to add one"
            className="block h-auto max-h-[34rem] w-auto max-w-full bg-paper-2"
            draggable={false}
          />

          {/* Interaction overlay: captures pointer events, hosts the circles.
              No ARIA role - the circles are real <button>s with their own
              labels/keyboard handling, so the overlay stays a transparent
              pointer surface rather than claiming `role="application"` (which
              would wrongly suppress AT key handling for those buttons). */}
          <div
            ref={overlayRef}
            className="absolute inset-0 cursor-crosshair touch-none"
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            onPointerLeave={() => setLoupe(null)}
          >
            {points.map((p, i) => {
              const isActive = activeHex !== null && p.hex === activeHex;
              return (
                <div
                  key={`${i}-${p.hex}`}
                  className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                >
                  <button
                    type="button"
                    onPointerDown={handleCirclePointerDown(i)}
                    onKeyDown={handleCircleKeyDown(i, p)}
                    aria-label={`Color ${p.hex} — drag or swipe to move, arrow keys to nudge, Delete to remove`}
                    title={`${p.hex}`}
                    className={[
                      // A hue-independent outline rides alongside the ring so the
                      // focus indicator stays visible even when the swatch color
                      // is near the accent (and under forced-colors / high-contrast).
                      'block h-7 w-7 cursor-grab rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.4)] ring-2 transition-transform duration-100 ease-out active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-4 focus-visible:ring-accent',
                      isActive
                        ? 'ring-white scale-110'
                        : 'ring-white/80 hover:scale-110',
                    ].join(' ')}
                    style={{ backgroundColor: p.hex }}
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemovePoint(i);
                    }}
                    aria-label={`Remove ${p.hex}`}
                    className="absolute -right-2 -top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-ink text-paper opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true" className="h-2.5 w-2.5">
                      <path
                        d="M3 3l10 10M13 3L3 13"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Magnifier loupe: fixed near the cursor, mirrors the sampled pixel. */}
          {loupe && (
            <div
              className="pointer-events-none fixed z-50 flex flex-col overflow-hidden border border-ink/30 bg-paper shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
              style={{
                left: loupe.clientX + 18,
                top: loupe.clientY - LOUPE_PX - 36,
              }}
            >
              <canvas
                ref={loupeCanvasRef}
                width={LOUPE_PX}
                height={LOUPE_PX}
                style={{ width: LOUPE_PX, height: LOUPE_PX }}
              />
              <div className="flex items-center gap-1.5 px-2 py-1">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full ring-1 ring-ink/20"
                  style={{ backgroundColor: loupe.hex }}
                />
                <span className="font-mono text-[11px] tracking-tight text-ink">
                  {loupe.hex}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path
        d="M8 10.5v-8m0 0L5 5.5m3-3 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.5 10v2.5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? 'h-6 w-6'}>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="8.5" cy="9" r="1.5" fill="currentColor" />
      <path
        d="M5 18l4.5-5 3 3.2L16 12l3 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
