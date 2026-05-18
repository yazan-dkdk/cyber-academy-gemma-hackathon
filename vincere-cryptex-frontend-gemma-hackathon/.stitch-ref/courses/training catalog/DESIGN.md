# Design System Document: Tactical Intelligence & Neural Overlay

## 1. Overview & Creative North Star: "The Synthetic Architect"
The Creative North Star for this design system is **"The Synthetic Architect."** This system moves away from the "neon-clutter" typical of common cyberpunk tropes, moving instead toward a high-end, editorialized "Tactical HUD" aesthetic. It represents the intersection of elite encryption and professional mastery. 

We break the "template" look through **intentional asymmetry**. Layouts should feel like a high-velocity data stream being paused and analyzed—utilizing wide-margin gutters, overlapping tactical modules, and high-contrast typography scales that prioritize "Information Density" over "Empty Space." Every element must feel like a conscious choice in a sophisticated neural interface.

## 2. Colors: Chromatic Energy & The Void
The palette is built on a foundation of "The Void" (`#10131c`), using neon accents not as decoration, but as functional data-signals.

### Surface Hierarchy & Nesting
Depth is not achieved through shadows, but through **Tonal Layering**.
*   **Base:** Use `surface` (`#10131c`) for the deepest background level.
*   **Sectioning:** Use `surface-container-low` (`#181b24`) for secondary regions.
*   **Modules:** Use `surface-container-high` (`#272a33`) for interactive cards or data modules.
*   **The "No-Line" Rule:** Explicitly prohibit 1px solid borders for sectioning. Boundaries must be defined solely by shifting between surface tiers or through 2px "Tactical Corner" accents in `primary`.

### The "Glass & Gradient" Rule
To achieve a premium feel, all floating modules must utilize **Glassmorphism**:
*   **Background:** Semi-transparent `surface-variant` (`#31353e` at 60% opacity).
*   **Backdrop Blur:** 12px to 20px blur radius.
*   **Signature Textures:** Apply a linear gradient (45deg) from `primary` to `primary-container` at low opacity (10%) for large hero sections to create a "digital haze."

## 3. Typography: The Encryption Hierarchy
We utilize a dual-font strategy to balance technical precision with modern editorial flair.

*   **Display & Headlines (Space Grotesk):** This is our "Interface" font. It is wide, aggressive, and highly legible. Use `display-lg` (3.5rem) for high-impact landing moments. Headlines should use tight letter-spacing (-0.02em) to feel "locked in."
*   **Body & Titles (Manrope):** Our "Intel" font. Manrope provides a human, readable counterpoint to the technical display type. Use `body-lg` for terminal-style readouts and `title-md` for navigational elements.
*   **Labels (Inter):** Reserved for technical metadata and micro-copy. Inter at `label-sm` (0.6875rem) should always be Uppercase with +0.1em letter spacing to mimic military-grade hardware labeling.

## 4. Elevation & Depth: Tonal Layering
Traditional material shadows are forbidden. We use **Luminous Elevation**.

*   **The Layering Principle:** Stack `surface-container-lowest` cards on `surface-container-low` sections. The "lift" comes from the subtle brightness shift, mimicking a back-lit LCD screen.
*   **Ambient Glows:** When a module is "Active" or "Focused," replace shadows with a `primary` (Neon Cyan) outer glow: `box-shadow: 0 0 15px 0px rgba(0, 240, 255, 0.15)`.
*   **The "Ghost Border" Fallback:** If a container requires definition against a similar background, use a **Ghost Border**: `outline-variant` (`#3b494b`) at 15% opacity. 100% opaque borders are strictly prohibited.

## 5. Components: Modular Tactical Units

### Buttons (Neural Triggers)
*   **Primary:** Solid `primary-container` background. Sharp 0px corners. Hover state triggers a "Multi-layered Glow" (three stacked box-shadows of varying blur radii in `primary`).
*   **Secondary:** Ghost-style. No background. `primary` text. `0.5px` border in `outline-variant` (20% opacity). On hover, the border fills to 100% opacity.
*   **Tactical Accents:** All buttons should feature a 2px "L-shape" bracket in the top-left and bottom-right corners.

### Input Fields (Data Entry)
*   **States:** Background uses `surface-container-highest`. No border.
*   **Focus:** The bottom edge animates a 2px line from `surface-variant` to a full `primary` glow. 
*   **Helper Text:** Use `label-sm` in `on-surface-variant`.

### Cards & Lists (Data Modules)
*   **Forbid Dividers:** Do not use lines to separate list items. Use 16px of vertical white space and alternating background tints (`surface-container-low` vs `surface-container-lowest`).
*   **Tactical Corner Accents:** Add a small `primary` colored triangle (4px) to the top right of cards to indicate "Elite Status" or "High Priority."

### Scanners (System Loading)
*   Use a `secondary` (Neon Pink) horizontal line (1px) with a soft 20px blur trailing behind it to create a "Scanline" effect over glassmorphic cards during data fetches.

## 6. Do's and Don'ts

### Do:
*   **Do** use extreme typographic scale. A `display-lg` headline next to a `label-sm` tag creates an elite, architectural feel.
*   **Do** use "Optical Vibrancy." Layer `primary` glows over `surface-dim` backgrounds to ensure the neon feels "lit" from within.
*   **Do** maintain 0px border-radius across all components. Rounded corners dilute the "Tactical" brand identity.

### Don't:
*   **Don't** use pure white. All "white" text should be `on-surface` (`#e0e2ee`), which is a slightly desaturated cool-grey, preventing eye strain in dark environments.
*   **Don't** over-use the Neon Pink/Purple. These are "Alert" and "Specialist" colors. If more than 10% of the screen is Pink, the "Elite" professional feel is lost to a "Cyber-Goth" aesthetic.
*   **Don't** use standard drop shadows. If it doesn't glow or shift tone, it doesn't exist in this system.