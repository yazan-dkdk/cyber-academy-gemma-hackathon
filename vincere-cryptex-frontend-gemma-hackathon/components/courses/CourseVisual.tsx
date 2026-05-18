"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";
import type { CourseTone } from "@/lib/courses/types";
import type { CourseVisualPreset } from "@/lib/courses/catalog-data";

type CourseVisualProps = {
  tone: CourseTone;
  signal?: CourseVisualPreset["signal"];
  imageSrc?: string;
  imageAlt?: string;
  className?: string;
};

export function CourseVisual({
  tone,
  signal = "defense",
  imageSrc,
  imageAlt = "",
  className,
}: CourseVisualProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolvedImageSrc = imageSrc && !imageFailed ? imageSrc : null;

  return (
    <div
      data-tone={tone}
      data-signal={signal}
      data-has-image={resolvedImageSrc ? "true" : "false"}
      className={cn("catalog-visual", className)}
      aria-hidden="true"
    >
      {resolvedImageSrc ? (
        <span className="catalog-visual__image-shell">
          <Image
            src={resolvedImageSrc}
            alt={imageAlt}
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
            className="catalog-visual__image"
            onError={() => setImageFailed(true)}
          />
        </span>
      ) : null}
      <svg className="catalog-visual__svg" viewBox="0 0 420 220" role="img">
        <path className="catalog-visual__trace catalog-visual__trace--one" d="M18 162 C92 96 142 184 220 108 S336 58 402 112" />
        <path className="catalog-visual__trace catalog-visual__trace--two" d="M42 56 H128 L164 92 H256 L298 50 H386" />
        <path className="catalog-visual__trace catalog-visual__trace--three" d="M54 190 H126 L166 148 H242 L286 186 H370" />
        <g className="catalog-visual__defense-mark">
          <path d="M210 42 274 68v48c0 43-25 79-64 96-39-17-64-53-64-96V68l64-26Z" />
          <path d="M176 118 200 142 246 88" />
        </g>
        <g className="catalog-visual__web-mark">
          <path d="M132 66h156v92H132z" />
          <path d="m170 104-22 18 22 18M250 104l22 18-22 18M226 86l-32 72" />
          <path d="M132 88h156" />
        </g>
        <g className="catalog-visual__soc-mark">
          <circle cx="210" cy="112" r="68" />
          <circle cx="210" cy="112" r="38" />
          <path d="M210 112 258 72M210 112h78M210 112l-26 54" />
          <path d="M98 112h36M286 112h36M210 0v36M210 188v32" />
        </g>
        <g className="catalog-visual__intel-mark">
          <path d="M126 148c48-72 120-72 168 0" />
          <circle cx="210" cy="116" r="38" />
          <circle cx="210" cy="116" r="12" />
          <path d="M86 72c34-28 74-42 124-42s90 14 124 42M104 176c42 20 78 30 106 30s64-10 106-30" />
        </g>
      </svg>
      <span className="catalog-visual__grid" />
      <span className="catalog-visual__matrix" />
      <span className="catalog-visual__beam catalog-visual__beam--one" />
      <span className="catalog-visual__beam catalog-visual__beam--two" />
      <span className="catalog-visual__core" />
      <span className="catalog-visual__node catalog-visual__node--one" />
      <span className="catalog-visual__node catalog-visual__node--two" />
      <span className="catalog-visual__node catalog-visual__node--three" />
      <span className="catalog-visual__corner catalog-visual__corner--tl" />
      <span className="catalog-visual__corner catalog-visual__corner--br" />
    </div>
  );
}
