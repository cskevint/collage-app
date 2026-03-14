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

        const x = col * tileWidth;
        const y = row * tileHeight;

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
          tileWidth,
          tileHeight,
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

  const filledCount = images.filter(Boolean).length;

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-50">
      <main className="mx-auto flex max-w-3xl flex-col gap-8 rounded-3xl bg-zinc-900/80 p-6 shadow-xl ring-1 ring-zinc-800/80 backdrop-blur">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Quick Collage
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Choose 2–9 tiles, drop in photos, and export a square collage ready
              for WhatsApp and socials.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400 sm:mt-0">
            <span className="inline-flex h-7 items-center rounded-full bg-zinc-800 px-3">
              {filledCount}/{tileCount} tiles filled
            </span>
          </div>
        </header>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Tiles
            </span>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: MAX_TILES - MIN_TILES + 1 }).map((_, i) => {
                const value = i + MIN_TILES;
                const active = value === tileCount;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleTileCountChange(value)}
                    className={`inline-flex h-8 items-center justify-center rounded-full px-3 text-xs font-medium transition ${
                      active
                        ? "bg-zinc-50 text-zinc-900 shadow-sm"
                        : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800"
                    }`}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleExport}
            disabled={images.every((tile) => !tile) || isExporting}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {isExporting ? "Preparing…" : "Download collage"}
          </button>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Layout preview
            </span>
            <span className="text-xs text-zinc-500">
              {gridSide} × {gridSide} grid · 1:1 aspect
            </span>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="grid h-full w-full gap-1 rounded-2xl bg-zinc-900 p-1 ring-1 ring-zinc-800"
                 style={{ gridTemplateColumns: `repeat(${gridSide}, minmax(0, 1fr))` }}>
              {Array.from({ length: tileCount }).map((_, index) => {
                const tile = images[index];
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => triggerFileSelect(index)}
                    className="group relative flex items-center justify-center overflow-hidden rounded-xl bg-zinc-900/80 ring-1 ring-zinc-800/80 transition hover:ring-emerald-400"
                  >
                    {tile ? (
                      <>
                        <img
                          src={tile.url}
                          alt={`Tile ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-black/40 opacity-0 transition group-hover:opacity-100" />
                        <span className="pointer-events-none absolute bottom-1 left-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-zinc-100">
                          Replace
                        </span>
                        <span
                          className="absolute right-1 top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-zinc-100 shadow-sm group-hover:flex"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearTile(index);
                          }}
                        >
                          ×
                        </span>
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-1 text-xs text-zinc-400">
                        <span className="text-lg">＋</span>
                        <span>Tile {index + 1}</span>
                      </div>
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
        </section>

        <canvas
          ref={canvasRef}
          className="hidden"
          aria-hidden="true"
        />
      </main>
    </div>
  );
}
