"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Crop = { zoom: number; panX: number; panY: number };

type TileImage = {
  file: File;
  url: string;
  naturalWidth?: number;
  naturalHeight?: number;
  crop?: Crop;
};

const CANVAS_SIZE = 1080;

type GridLayoutKey = "2-h" | "2-v" | "3-h" | "3-v" | "4" | "6" | "9";

const GRID_LAYOUT_OPTIONS: { value: GridLayoutKey; label: string }[] = [
  { value: "2-h", label: "2 (H)" },
  { value: "2-v", label: "2 (V)" },
  { value: "3-h", label: "3 (H)" },
  { value: "3-v", label: "3 (V)" },
  { value: "4", label: "4 grid" },
  { value: "6", label: "6 grid" },
  { value: "9", label: "9 grid" },
];

function getGridFromLayout(layout: GridLayoutKey): {
  cols: number;
  rows: number;
  tileCount: number;
} {
  switch (layout) {
    case "2-h":
      return { cols: 2, rows: 1, tileCount: 2 };
    case "2-v":
      return { cols: 1, rows: 2, tileCount: 2 };
    case "3-h":
      return { cols: 3, rows: 1, tileCount: 3 };
    case "3-v":
      return { cols: 1, rows: 3, tileCount: 3 };
    default: {
      const n = Number(layout);
      const side = Math.ceil(Math.sqrt(n));
      const cols = side;
      const rows = Math.ceil(n / side);
      return { cols, rows, tileCount: n };
    }
  }
}
const BORDER_GAP_PX = 8;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const SNAP_THRESHOLD = 0.08;

function getDefaultCrop(): Crop {
  return { zoom: 1, panX: 0.5, panY: 0.5 };
}

function snapCrop(crop: Crop): Crop {
  const half = 1 / (2 * crop.zoom);
  const panMin = 0.5 - half;
  const panMax = 0.5 + half;
  const snap = (v: number) =>
    v < panMin + SNAP_THRESHOLD
      ? panMin
      : v > panMax - SNAP_THRESHOLD
        ? panMax
        : v;
  return { ...crop, panX: snap(crop.panX), panY: snap(crop.panY) };
}

/** Clamp zoom and pan so the image always fully covers the tile (no empty edges). */
function clampCrop(crop: Crop): Crop {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom));
  const half = 1 / (2 * zoom);
  const panMin = 0.5 - half;
  const panMax = 0.5 + half;
  return {
    zoom,
    panX: Math.max(panMin, Math.min(panMax, crop.panX)),
    panY: Math.max(panMin, Math.min(panMax, crop.panY)),
  };
}

type CroppableImageProps = {
  url: string;
  crop: Crop;
  onCropChange: (crop: Crop) => void;
  onImageLoad: (naturalWidth: number, naturalHeight: number) => void;
  onClear: () => void;
};

function CroppableImage({
  url,
  crop,
  onCropChange,
  onImageLoad,
  onClear,
}: CroppableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isGestureActive, setIsGestureActive] = useState(false);
  const lastPinchRef = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const hadGestureRef = useRef(false);
  const justGesturedRef = useRef(false);
  const cropRef = useRef(crop);
  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  const getContainerSize = useCallback(() => {
    const el = containerRef.current;
    return el ? { w: el.offsetWidth, h: el.offsetHeight } : null;
  }, []);

  // Native touch with passive: false so preventDefault() works (required for pinch/pan on mobile)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) e.preventDefault();
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length >= 1) e.preventDefault();
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  const applyGestureEnd = useCallback(() => {
    onCropChange(clampCrop(snapCrop(cropRef.current)));
  }, [onCropChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsGestureActive(true);
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      const centerX = (a.clientX + b.clientX) / 2;
      const centerY = (a.clientY + b.clientY) / 2;
      lastPinchRef.current = { distance, centerX, centerY };
      lastPanRef.current = null;
    } else if (e.touches.length === 1) {
      lastPanRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      hadGestureRef.current = true;
      const size = getContainerSize();
      if (!size || size.w === 0 || size.h === 0) return;
      const current = cropRef.current;

      if (e.touches.length === 2 && lastPinchRef.current) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const distance = Math.hypot(
          b.clientX - a.clientX,
          b.clientY - a.clientY
        );
        const ratio = distance / lastPinchRef.current.distance;
        lastPinchRef.current = {
          distance,
          centerX: (a.clientX + b.clientX) / 2,
          centerY: (a.clientY + b.clientY) / 2,
        };
        const newZoom = Math.max(
          MIN_ZOOM,
          Math.min(MAX_ZOOM, current.zoom * ratio)
        );
        const newCrop = clampCrop({ ...current, zoom: newZoom });
        cropRef.current = newCrop;
        onCropChange(newCrop);
        return;
      }

      if (e.touches.length === 1 && lastPanRef.current) {
        const z = current.zoom;
        const dx = (e.touches[0].clientX - lastPanRef.current.x) / size.w / z;
        const dy = (e.touches[0].clientY - lastPanRef.current.y) / size.h / z;
        const newPanX = current.panX - dx;
        const newPanY = current.panY - dy;
        lastPanRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        const newCrop = clampCrop({ ...current, panX: newPanX, panY: newPanY });
        cropRef.current = newCrop;
        onCropChange(newCrop);
      }
    },
    [getContainerSize, onCropChange]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) lastPinchRef.current = null;
      if (e.touches.length < 1) {
        setIsGestureActive(false);
        justGesturedRef.current = hadGestureRef.current;
        lastPanRef.current = null;
        hadGestureRef.current = false;
        applyGestureEnd();
      }
    },
    [applyGestureEnd]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setIsGestureActive(true);
    if (pointersRef.current.size === 1) {
      lastPanRef.current = { x: e.clientX, y: e.clientY };
      lastPinchRef.current = null;
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = Array.from(pointersRef.current.entries()).map(
        ([, v]) => v
      );
      const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      lastPinchRef.current = {
        distance,
        centerX: (p1.x + p2.x) / 2,
        centerY: (p1.y + p2.y) / 2,
      };
      lastPanRef.current = null;
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      hadGestureRef.current = true;
      const size = getContainerSize();
      if (!size || size.w === 0 || size.h === 0) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const current = cropRef.current;

      const entries = Array.from(pointersRef.current.entries());
      if (entries.length === 2) {
        const [[, p1], [, p2]] = entries;
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (lastPinchRef.current) {
          const ratio = distance / lastPinchRef.current.distance;
          lastPinchRef.current = {
            distance,
            centerX: (p1.x + p2.x) / 2,
            centerY: (p1.y + p2.y) / 2,
          };
          const newZoom = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, current.zoom * ratio)
          );
          const newCrop = clampCrop({ ...current, zoom: newZoom });
          cropRef.current = newCrop;
          onCropChange(newCrop);
        }
      } else if (entries.length === 1 && lastPanRef.current) {
        const [, { x, y }] = entries[0] as [number, { x: number; y: number }];
        const z = current.zoom;
        const dx = (x - lastPanRef.current.x) / size.w / z;
        const dy = (y - lastPanRef.current.y) / size.h / z;
        const newPanX = current.panX - dx;
        const newPanY = current.panY - dy;
        lastPanRef.current = { x, y };
        const newCrop = clampCrop({ ...current, panX: newPanX, panY: newPanY });
        cropRef.current = newCrop;
        onCropChange(newCrop);
      }
    },
    [getContainerSize, onCropChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) lastPinchRef.current = null;
      if (pointersRef.current.size === 0) {
        setIsGestureActive(false);
        justGesturedRef.current = hadGestureRef.current;
        lastPanRef.current = null;
        hadGestureRef.current = false;
        applyGestureEnd();
      }
    },
    [applyGestureEnd]
  );

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (justGesturedRef.current) {
      e.stopPropagation();
      justGesturedRef.current = false;
    }
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom + delta));
      onCropChange(clampCrop(snapCrop({ ...crop, zoom: newZoom })));
    },
    [crop, onCropChange]
  );

  const zoom = crop.zoom;
  const translateX = (0.5 - crop.panX) * (zoom - 1) * 100;
  const translateY = (0.5 - crop.panY) * (zoom - 1) * 100;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden select-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onClick={handleContainerClick}
      style={{
        touchAction: "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        userSelect: "none",
      }}
    >
      <div
        className={`absolute h-full w-full origin-center transition-opacity duration-75 ${
          isGestureActive ? "opacity-60" : "opacity-100"
        }`}
        style={{
          transform: `scale(${zoom}) translate(${translateX}%, ${translateY}%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onLoad={(e) => {
            const img = e.currentTarget;
            onImageLoad(img.naturalWidth, img.naturalHeight);
          }}
          draggable={false}
        />
      </div>
      {/* Crop viewport: rectangle showing what will be visible in the grid tile */}
      <div
        className="pointer-events-none absolute inset-0 rounded-lg border-2 border-white/90 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]"
        aria-hidden
      />
      <span
        className="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-black/50 text-[10px] text-white opacity-0 transition hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
      >
        ×
      </span>
    </div>
  );
}

export default function Home() {
  const [gridLayout, setGridLayout] = useState<GridLayoutKey>("4");
  const {
    cols: gridCols,
    rows: gridRows,
    tileCount,
  } = useMemo(() => getGridFromLayout(gridLayout), [gridLayout]);
  const [images, setImages] = useState<(TileImage | null)[]>(() =>
    new Array(getGridFromLayout("4").tileCount).fill(null)
  );
  const fileInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showBorder, setShowBorder] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const hasImages = images.some(Boolean);

  useEffect(() => {
    if (!hasImages) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasImages]);

  const handleGridLayoutChange = (layout: GridLayoutKey) => {
    const { tileCount: nextCount } = getGridFromLayout(layout);
    setGridLayout(layout);
    setImages((prev) => {
      const next = new Array(nextCount).fill(null) as (TileImage | null)[];
      for (let i = 0; i < Math.min(prev.length, nextCount); i++) {
        next[i] = prev[i];
      }
      return next;
    });
  };

  const triggerFileSelect = (index: number) => {
    const input = fileInputsRef.current[index];
    if (input) {
      input.click();
    }
  };

  const handleFileChange = (
    index: number,
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setImages((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing?.url) {
        URL.revokeObjectURL(existing.url);
      }
      next[index] = { file, url, crop: getDefaultCrop() };
      return next;
    });
  };

  const handleImageLoad = useCallback(
    (index: number, naturalWidth: number, naturalHeight: number) => {
      setImages((prev) => {
        const next = [...prev];
        const tile = next[index];
        if (!tile) return prev;
        next[index] = {
          ...tile,
          naturalWidth,
          naturalHeight,
          crop: tile.crop ?? getDefaultCrop(),
        };
        return next;
      });
    },
    []
  );

  const handleCropChange = useCallback((index: number, crop: Crop) => {
    setImages((prev) => {
      const next = [...prev];
      const tile = next[index];
      if (!tile) return prev;
      next[index] = { ...tile, crop };
      return next;
    });
  }, []);

  const handleClearTile = (index: number) => {
    setImages((prev) => {
      const next = [...prev];
      const existing = next[index];
      if (existing?.url) {
        URL.revokeObjectURL(existing.url);
      }
      next[index] = null;
      return next;
    });
    const input = fileInputsRef.current[index];
    if (input) {
      input.value = "";
    }
  };

  const handleResetAll = useCallback(() => {
    setImages((prev) => {
      prev.forEach((tile) => {
        if (tile?.url) URL.revokeObjectURL(tile.url);
      });
      return new Array(tileCount).fill(null) as (TileImage | null)[];
    });
    fileInputsRef.current.forEach((input) => {
      if (input) input.value = "";
    });
    setActiveIndex(null);
  }, [tileCount]);

  const handleExport = async () => {
    if (!canvasRef.current) return;

    const filledImages = images.filter(Boolean) as TileImage[];
    if (filledImages.length === 0) return;

    setIsExporting(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setIsExporting(false);
      return;
    }

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cols = gridCols;
    const rows = gridRows;
    const tileWidth = canvas.width / cols;
    const tileHeight = canvas.height / rows;
    const gap = showBorder ? BORDER_GAP_PX : 0;

    try {
      const loadImage = (src: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = src;
        });

      for (let index = 0; index < tileCount; index++) {
        const tile = images[index];
        if (!tile) continue;

        const img = await loadImage(tile.url);
        const crop = tile.crop ?? getDefaultCrop();

        const col = index % cols;
        const row = Math.floor(index / cols);

        const x = col * tileWidth + gap / 2;
        const y = row * tileHeight + gap / 2;
        const drawWidth = tileWidth - gap;
        const drawHeight = tileHeight - gap;

        const coverScale = Math.max(
          drawWidth / img.width,
          drawHeight / img.height
        );
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom));
        const srcW = drawWidth / (coverScale * zoom);
        const srcH = drawHeight / (coverScale * zoom);
        const srcX = Math.max(
          0,
          Math.min(img.width - srcW, crop.panX * (img.width - srcW))
        );
        const srcY = Math.max(
          0,
          Math.min(img.height - srcH, crop.panY * (img.height - srcH))
        );

        ctx.drawImage(img, srcX, srcY, srcW, srcH, x, y, drawWidth, drawHeight);
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
      const file = (() => {
        const arr = dataUrl.split(",");
        const mime = arr[0].match(/:(.*?);/)?.[1] ?? "image/jpeg";
        const bstr = atob(arr[1] ?? "");
        const u8arr = new Uint8Array(bstr.length);
        for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
        return new File([u8arr], "collage.jpg", { type: mime });
      })();

      const canShare =
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        navigator.canShare?.({ files: [file] });

      if (canShare) {
        try {
          await navigator.share({
            files: [file],
            title: "Collage",
          });
          return;
        } catch {
          // User cancelled or share failed; fall through to download
        }
      }

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = "collage.jpg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 px-2 py-5 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 sm:px-4">
      <main className="mx-auto flex w-full max-w-md flex-col gap-4">
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Collage App
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={gridLayout}
              onChange={(e) =>
                handleGridLayoutChange(e.target.value as GridLayoutKey)
              }
              aria-label="Grid layout"
              className="h-9 appearance-none rounded-lg border-0 bg-zinc-200 pl-3 pr-9 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-500"
            >
              {GRID_LAYOUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Border</span>
            <button
              type="button"
              role="switch"
              aria-checked={showBorder}
              onClick={() => setShowBorder((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                showBorder
                  ? "bg-zinc-900 dark:bg-zinc-100"
                  : "bg-zinc-200 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  showBorder ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </label>

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={handleResetAll}
              disabled={!images.some(Boolean)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Reset all images"
            >
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reset
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={images.every((tile) => !tile) || isExporting}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
              aria-label="Share collage"
            >
              {isExporting ? (
                "…"
              ) : (
                <>
                  <svg
                    className="h-4 w-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  Share
                </>
              )}
            </button>
          </div>
        </div>

        <div className="relative w-full aspect-square">
          <div
            className={`grid h-full w-full bg-zinc-100 dark:bg-zinc-900 ${
              showBorder ? "gap-2 p-2" : "gap-0 p-0"
            }`}
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: tileCount }).map((_, index) => {
              const tile = images[index];
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    if (tile) {
                      setActiveIndex(index);
                    } else {
                      triggerFileSelect(index);
                    }
                  }}
                  className="group relative flex min-h-0 items-center justify-center overflow-hidden bg-zinc-200 transition hover:opacity-90 dark:bg-zinc-800"
                >
                  {tile ? (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                        {(() => {
                          const c = tile.crop ?? getDefaultCrop();
                          const z = c.zoom;
                          const tx = (0.5 - c.panX) * (z - 1) * 100;
                          const ty = (0.5 - c.panY) * (z - 1) * 100;
                          return (
                            <div
                              className="absolute h-full w-full origin-center"
                              style={{
                                transform: `scale(${z}) translate(${tx}%, ${ty}%)`,
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={tile.url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </div>
                          );
                        })()}
                      </div>
                      <span
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md bg-black/50 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearTile(index);
                        }}
                      >
                        ×
                      </span>
                    </>
                  ) : (
                    <span className="text-2xl text-zinc-300 dark:text-zinc-600">
                      +
                    </span>
                  )}

                  {/* No capture attribute: lets mobile show gallery/camera roll; capture would force camera */}
                  <input
                    ref={(el) => {
                      fileInputsRef.current[index] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => handleFileChange(index, event)}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {activeIndex !== null && images[activeIndex] && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            onClick={() => setActiveIndex(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl bg-zinc-50 p-4 text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-zinc-50"
              onClick={(e) => e.stopPropagation()}
              style={{ touchAction: "none" }}
            >
              <div
                className="relative w-full overflow-hidden rounded-lg bg-zinc-200 dark:bg-zinc-800"
                style={{ aspectRatio: `${gridRows} / ${gridCols}` }}
              >
                <CroppableImage
                  url={images[activeIndex]!.url}
                  crop={images[activeIndex]!.crop ?? getDefaultCrop()}
                  onCropChange={(crop) => handleCropChange(activeIndex, crop)}
                  onImageLoad={(nw, nh) => handleImageLoad(activeIndex, nw, nh)}
                  onClear={() => {
                    handleClearTile(activeIndex);
                    setActiveIndex(null);
                  }}
                />
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  onClick={() => triggerFileSelect(activeIndex)}
                >
                  Replace photo
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-zinc-50 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  onClick={() => setActiveIndex(null)}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </main>
    </div>
  );
}
