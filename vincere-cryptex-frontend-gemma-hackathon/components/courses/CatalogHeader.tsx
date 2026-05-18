"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { CourseDifficulty } from "@/lib/courses/types";
import { FilterIcon, SearchIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

export type CatalogLevelFilter = CourseDifficulty | "all";

export type CatalogFilters = {
  query: string;
  level: CatalogLevelFilter;
  category: string;
};

type CatalogHeaderProps = {
  filters: CatalogFilters;
  categories: string[];
  totalCourses: number;
  visibleCourses: number;
  onQueryChange: (query: string) => void;
  onLevelChange: (level: CatalogLevelFilter) => void;
  onCategoryChange: (category: string) => void;
};

const levelOptions: Array<{ value: CatalogLevelFilter; label: string }> = [
  { value: "all", label: "All Levels" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

type DisciplineDropdownProps = {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
};

function DisciplineDropdown({ categories, value, onChange }: DisciplineDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const options = [
    { value: "all", label: "All Disciplines" },
    ...categories.map((category) => ({
      value: category,
      label: category,
    })),
  ];
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? "All Disciplines";

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        dropdownRef.current &&
        event.target instanceof Node &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div ref={dropdownRef} className="catalog-dropdown">
      <button
        type="button"
        className="catalog-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((currentState) => !currentState)}
      >
        <FilterIcon className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate text-left">{selectedLabel}</span>
        <span className="catalog-dropdown__chevron" aria-hidden="true" />
      </button>

      <AnimatePresence>
        {isOpen ? (
          <motion.div
            className="catalog-dropdown__panel"
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="catalog-dropdown__options" role="listbox" aria-label="Course discipline">
              {options.map((option, index) => {
                const isActive = option.value === value;

                return (
                  <motion.button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={cn(
                      "catalog-dropdown__option",
                      isActive ? "catalog-dropdown__option--active" : "",
                    )}
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.025, duration: 0.14 }}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    {option.label}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function CatalogHeader({
  filters,
  categories,
  totalCourses,
  visibleCourses,
  onQueryChange,
  onLevelChange,
  onCategoryChange,
}: CatalogHeaderProps) {
  return (
    <section className="catalog-control-deck">
      <div className="relative z-10 grid gap-6 xl:grid-cols-[1fr_1.3fr] xl:items-end">
        <div className="space-y-3">
          <p className="font-label text-[0.72rem] uppercase text-primary">Training Catalog</p>
          <h1 className="font-display text-4xl font-semibold uppercase text-white sm:text-5xl">
            Courses
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-foreground/62">
            Catalog state: {visibleCourses}/{totalCourses} courses visible.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,1fr)_12rem]">
          <label className="catalog-search-shell">
            <SearchIcon className="h-5 w-5" />
            <span className="sr-only">Search catalog</span>
            <input
              value={filters.query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search catalog..."
              className="catalog-search-input"
              type="search"
            />
          </label>

          <DisciplineDropdown
            categories={categories}
            value={filters.category}
            onChange={onCategoryChange}
          />

          <div className="flex flex-wrap gap-2 lg:col-span-2 lg:justify-end" aria-label="Course level">
            {levelOptions.map((option) => {
              const isActive = filters.level === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => onLevelChange(option.value)}
                  className={cn("catalog-filter-chip", isActive ? "catalog-filter-chip--active" : "")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
