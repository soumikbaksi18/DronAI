"use client";

import { useCallback, useState } from "react";
import { assetTypeFromName } from "@/lib/mock-generate";
import type { LessonAsset } from "@/lib/types";

const ACCEPT =
  ".pdf,.doc,.docx,.md,.markdown,.png,.jpg,.jpeg,.gif,.webp,.mp4,.webm";

type Props = {
  assets: LessonAsset[];
  onChange: (assets: LessonAsset[]) => void;
};

export function UploadDropzone({ assets, onChange }: Props) {
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const next: LessonAsset[] = list.map((file) => ({
        id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        name: file.name,
        type: assetTypeFromName(file.name),
        url: URL.createObjectURL(file),
        size: file.size,
      }));
      onChange([...assets, ...next]);
    },
    [assets, onChange],
  );

  function remove(id: string) {
    const target = assets.find((a) => a.id === id);
    if (target?.url.startsWith("blob:")) URL.revokeObjectURL(target.url);
    onChange(assets.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition ${
          dragging
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--line)] bg-white/60 hover:border-[var(--accent)]/50"
        }`}
      >
        <input
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="text-sm font-medium text-[var(--foreground)]">
          Drop Word, PDF, Markdown, images, or short videos
        </p>
        <p className="mt-2 text-xs text-[var(--ink-muted)]">
          Mock extract only — files stay in this browser
        </p>
      </label>

      {assets.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {assets.map((asset) => (
            <li
              key={asset.id}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs text-[var(--accent)]"
            >
              <span className="font-mono uppercase opacity-70">{asset.type}</span>
              <span className="max-w-[140px] truncate">{asset.name}</span>
              <button
                type="button"
                onClick={() => remove(asset.id)}
                className="ml-1 opacity-60 hover:opacity-100"
                aria-label={`Remove ${asset.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
