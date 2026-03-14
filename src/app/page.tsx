"use client";

import { ChangeEvent, useCallback, useMemo, useRef, useState } from "react";

type Crop = { zoom: number; panX: number; panY: number };

type TileImage = {
  file: File;
  url: string;
  naturalWidth?: number;
  naturalHeight?: number;
  crop?: Crop;
};

const MIN_TILES = 2;
const MAX_TILES = 9;
const CANVAS_SIZE = 1080;
const BORDER_GAP_PX = 8;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const SNAP_THRESHOLD = 0.08;

function getDefaultCrop(): Crop {
  return { zoom: 1, panX: 0.5, panY: 0.5 };
}

function snapCrop(crop: Crop): Crop {
  const snap = (v: number) =>
    v < SNAP_THRESHOLD ? 0 : v > 1 - SNAP_THRESHOLD ? 1 : v;
  return { ...crop, panX: snap(crop.panX), panY: snap(crop.panY) };
}

function clampCrop(crop: Crop): Crop {
  return {
    zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom)),
    panX: Math.max(0, Math.min(1, crop.panX)),
    panY: Math.max(0, Math.min(1, crop.panY)),
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
  const lastPinchRef = useRef<{ distance: number; centerX: number; centerY: number } | null>(null);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const hadGestureRef = useRef(false);
  const justGesturedRef = useRef(false);
  const cropRef = useRef(crop);
  cropRef.current = crop;

  const getContainerSize = useCallback(() => {
    const el = containerRef.current;
    return el ? { w: el.offsetWidth, h: el.offsetHeight } : null;
  }, []);

  const applyGestureEnd = useCallback(() => {
    onCropChange(clampCrop(snapCrop(cropRef.current)));
  }, [onCropChange]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
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
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      hadGestureRef.current = true;
      const size = getContainerSize();
      if (!size || size.w === 0 || size.h === 0) return;

      if (e.touches.length === 2 && lastPinchRef.current) {
        const [a, b] = [e.touches[0], e.touches[1]];
        const distance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
        const ratio = distance / lastPinchRef.current.distance;
        lastPinchRef.current = { distance, centerX: (a.clientX + b.clientX) / 2, centerY: (a.clientY + b.clientY) / 2 };
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom * ratio));
        onCropChange(clampCrop({ ...crop, zoom: newZoom }));
        return;
      }

      if (e.touches.length === 1 && lastPanRef.current) {
        const dx = (e.touches[0].clientX - lastPanRef.current.x) / size.w;
        const dy = (e.touches[0].clientY - lastPanRef.current.y) / size.h;
        const newPanX = Math.max(0, Math.min(1, crop.panX - dx));
        const newPanY = Math.max(0, Math.min(1, crop.panY - dy));
        lastPanRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        onCropChange(clampCrop({ ...crop, panX: newPanX, panY: newPanY }));
      }
    },
    [crop, getContainerSize, onCropChange]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length < 2) lastPinchRef.current = null;
      if (e.touches.length < 1) {
        justGesturedRef.current = hadGestureRef.current;
        lastPanRef.current = null;
        hadGestureRef.current = false;
        applyGestureEnd();
      }
    },
    [applyGestureEnd]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 1) {
        lastPanRef.current = { x: e.clientX, y: e.clientY };
        lastPinchRef.current = null;
      } else if (pointersRef.current.size === 2) {
        const [p1, p2] = Array.from(pointersRef.current.entries()).map(([, v]) => v);
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        lastPinchRef.current = { distance, centerX: (p1.x + p2.x) / 2, centerY: (p1.y + p2.y) / 2 };
        lastPanRef.current = null;
      }
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      hadGestureRef.current = true;
      const size = getContainerSize();
      if (!size || size.w === 0 || size.h === 0) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const entries = Array.from(pointersRef.current.entries());
      if (entries.length === 2) {
        const [[, p1], [, p2]] = entries;
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (lastPinchRef.current) {
          const ratio = distance / lastPinchRef.current.distance;
          lastPinchRef.current = { distance, centerX: (p1.x + p2.x) / 2, centerY: (p1.y + p2.y) / 2 };
          const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom * ratio));
          onCropChange(clampCrop({ ...crop, zoom: newZoom }));
        }
      } else if (entries.length === 1 && lastPanRef.current) {
        const [, { x, y }] = entries[0] as [number, { x: number; y: number }];
        const dx = (x - lastPanRef.current.x) / size.w;
        const dy = (y - lastPanRef.current.y) / size.h;
        const newPanX = Math.max(0, Math.min(1, crop.panX - dx));
        const newPanY = Math.max(0, Math.min(1, crop.panY - dy));
        lastPanRef.current = { x, y };
        onCropChange(clampCrop({ ...crop, panX: newPanX, panY: newPanY }));
      }
    },
    [crop, getContainerSize, onCropChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) lastPinchRef.current = null;
      if (pointersRef.current.size === 0) {
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
      className="absolute inset-0 flex items-center justify-center overflow-hidden"
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
      style={{ touchAction: "none" }}
    >
      <div
        className="absolute h-full w-full origin-center"
        style={{
          transform: `scale(${zoom}) translate(${translateX}%, ${translateY}%)`,
        }}
      >
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
  const [tileCount, setTileCount] = useState<number>(4);
  const [images, setImages] = useState<(TileImage | null)[]>(
    () => new Array(tileCount).fill(null),
  );
  const fileInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [showBorder, setShowBorder] = useState(true);

  const gridSide = useMemo(() => Math.ceil(Math.sqrt(tileCount)), [tileCount]);

  const handleTileCountChange = (value: number) => {
    setTileCount(value);
    setImages((prev) => {
      const next = new Array(value).fill(null) as (TileImage | null)[];
      for (let i = 0; i < Math.min(prev.length, value); i++) {
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

  const handleFileChange = (index: number, event: ChangeEvent<HTMLInputElement>) => {
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

  const handleImageLoad = useCallback((index: number, naturalWidth: number, naturalHeight: number) => {
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
  }, []);

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

    const cols = gridSide;
    const rows = gridSide;
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

        const coverScale = Math.max(drawWidth / img.width, drawHeight / img.height);
        const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, crop.zoom));
        const srcW = drawWidth / (coverScale * zoom);
        const srcH = drawHeight / (coverScale * zoom);
        const srcX = Math.max(0, Math.min(img.width - srcW, crop.panX * (img.width - srcW)));
        const srcY = Math.max(0, Math.min(img.height - srcH, crop.panY * (img.height - srcH)));

        ctx.drawImage(
          img,
          srcX,
          srcY,
          srcW,
          srcH,
          x,
          y,
          drawWidth,
          drawHeight,
        );
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
      <main className="mx-auto flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>Grid</span>
            <select
              value={tileCount}
              onChange={(e) => handleTileCountChange(Number(e.target.value))}
              className="h-9 rounded-lg border-0 bg-zinc-200 px-3 text-sm font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-500"
            >
              {Array.from({ length: MAX_TILES - MIN_TILES + 1 }).map((_, i) => {
                const value = i + MIN_TILES;
                return (
                  <option key={value} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
          </label>

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

          <button
            type="button"
            onClick={handleExport}
            disabled={images.every((tile) => !tile) || isExporting}
            className="ml-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isExporting ? "…" : "Share"}
          </button>
        </div>

        <div className="relative w-full aspect-square">
          <div
            className={`grid h-full w-full bg-zinc-100 dark:bg-zinc-900 ${
              showBorder ? "gap-2 p-2" : "gap-0 p-0"
            }`}
            style={{ gridTemplateColumns: `repeat(${gridSide}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: tileCount }).map((_, index) => {
              const tile = images[index];
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => triggerFileSelect(index)}
                  className="group relative flex min-h-0 items-center justify-center overflow-hidden bg-zinc-200 transition hover:opacity-90 dark:bg-zinc-800"
                >
                  {tile ? (
                    <CroppableImage
                      url={tile.url}
                      crop={tile.crop ?? getDefaultCrop()}
                      onCropChange={(crop) => handleCropChange(index, crop)}
                      onImageLoad={(nw, nh) => handleImageLoad(index, nw, nh)}
                      onClear={() => handleClearTile(index)}
                    />
                  ) : (
                    <span className="text-2xl text-zinc-300 dark:text-zinc-600">
                      +
                    </span>
                  )}

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

        <canvas
          ref={canvasRef}
          className="hidden"
          aria-hidden="true"
        />
      </main>
    </div>
  );
}
