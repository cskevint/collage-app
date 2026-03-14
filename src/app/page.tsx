"use client";

import { ChangeEvent, useMemo, useRef, useState } from "react";

type TileImage = {
  file: File;
  url: string;
};

const MIN_TILES = 2;
const MAX_TILES = 9;
const CANVAS_SIZE = 1080;

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
      next[index] = { file, url };
      return next;
    });
  };

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
    const gap = showBorder ? 16 : 0;

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

        const col = index % cols;
        const row = Math.floor(index / cols);

        const x = col * tileWidth + gap / 2;
        const y = row * tileHeight + gap / 2;
        const drawWidth = tileWidth - gap;
        const drawHeight = tileHeight - gap;

        const sourceSize = Math.min(img.width, img.height);
        const sx = (img.width - sourceSize) / 2;
        const sy = (img.height - sourceSize) / 2;

        ctx.drawImage(
          img,
          sx,
          sy,
          sourceSize,
          sourceSize,
          x,
          y,
          drawWidth,
          drawHeight,
        );
      }

      const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
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
          <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <span>Grid</span>
            <select
              value={tileCount}
              onChange={(e) => handleTileCountChange(Number(e.target.value))}
              className="h-8 rounded-lg border-0 bg-zinc-200 px-2.5 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:ring-zinc-500"
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

          <label className="inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
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
            className="ml-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isExporting ? "…" : "Download"}
          </button>
        </div>

        <div className="relative w-full aspect-square">
          <div
            className={`grid h-full w-full bg-zinc-100 dark:bg-zinc-900 ${
              showBorder ? "gap-px" : "gap-0"
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
                    <>
                      <img
                        src={tile.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
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
