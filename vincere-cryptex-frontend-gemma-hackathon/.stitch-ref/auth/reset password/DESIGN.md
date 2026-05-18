# Design System Specification: Tactical Cyber-Elegance

## 1. Overview & Creative North Star
**The Creative North Star: "The Tactical Vanguard"**

This design system is not merely a "dark mode" interface; it is a high-fidelity tactical HUD designed for elite performance. It breaks away from the generic, flat "SaaS" look by embracing **Structural Brutalism** mixed with **Luminous Depth**. 

The system rejects traditional web layouts in favor of an immersive, terminal-like experience. We move beyond the "template" look through intentional asymmetry, using tactical corner accents to frame content and heavy, wide-tracking typography that commands authority. Every element should feel like a piece of high-end hardware—weighted, intentional, and glowing with latent power.

---

## 2. Colors & Environmental Tones
The palette is rooted in the "Void" (#070A12), utilizing high-frequency neon accents to simulate light emission in a dark environment.

### The Color Core
*   **Primary (Cyan):** `#00F0FF` — System status: Active / Critical Path.
*   **Secondary (Purple):** `#A855F7` — System status: Processing / Data Layer.
*   **Tertiary (Pink):** `#FF4FD8` — System status: Alert / High-Interest.
*   **Surface Lowest:** `#0b0e16` — The deep background (The Void).
*   **Surface Highest:** `#31353e` — High-intensity glass panels.

### The "No-Line" Rule
Traditional 1px borders are strictly prohibited for sectioning. Boundaries are defined by:
1.  **Tonal Shifts:** Transitioning from `surface_container_lowest` to `surface_container_low`.
2.  **Luminous Boundaries:** Using a soft, 20% opacity glow edge instead of a solid stroke.
3.  **Negative Space:** Utilizing the spacing scale to let the "Void" separate logical groupings.

### The Glass & Gradient Rule
To achieve "Tactical Immersion," all floating panels must utilize **Glassmorphism**.
*   **Specs:** `surface_container` at 60% opacity with a `20px` backdrop-blur.
*   **Gradients:** Use linear gradients for primary CTAs transitioning from `primary_container` (#00F0FF) to `primary_fixed_dim` (#00dbe9) at a 45-degree angle to simulate light refraction.

---

## 3. Typography: The Editorial Command
The typography system contrasts the industrial, wide-set nature of tech-displays with the clean legibility of modern editorial.

*   **Display & Headlines (Space Grotesk):** These are your "System Commands." Use **bold weights** and a **+5% to +10% letter-spacing (tracking)**. Headlines should feel like they are being projected onto a glass screen.
*   **Body & Titles (Manrope):** These are your "Data Streams." Manrope provides a sophisticated, human-centric contrast to the aggressive headlines. Keep tracking at 0 for maximum readability.
*   **Labels (Space Grotesk):** Small, all-caps labels are used for tactical metadata. This reinforces the "HUD" aesthetic.

---

## 4. Elevation & Depth: Tonal Layering
We do not use shadows to simulate "height" in the traditional sense; we use **Light Emission** and **Layering**.

### The Layering Principle
*   **Level 0 (Background):** `surface_dim` (#10131c) with a subtle 5% opacity tech-grid pattern overlay.
*   **Level 1 (Sections):** `surface_container_low`—used for large content areas.
*   **Level 2 (Cards/Modules):** `surface_container_highest`—used to "lift" interactive elements.

### Ambient Glows (The Shadow Replacement)
When an element needs to "float," apply an **Ambient Glow** rather than a black shadow.
*   **Primary Glow:** `0px 0px 30px 0px rgba(0, 240, 255, 0.15)`.
*   **Inner Core:** A 1px inside stroke using `outline_variant` at 20% opacity to define the "glass edge."

### The "Ghost Border" Fallback
If an element requires a container (like an input), use a **Ghost Border**: `outline_variant` (#3b494b) at 15% opacity. Never use 100% opacity strokes.

---

## 5. Components

### Buttons: High-Intensity CTAs
*   **Primary:** Sharp corners (0px radius). Background: `primary_container`. Text: `on_primary`. 
    *   *Interaction:* On hover, trigger a "Pulse" animation—a multi-layered glow that expands and contracts.
*   **Secondary:** Ghost style. 1px ghost border using `secondary_container`. 
    *   *Interaction:* Fill background with `secondary_container` at 10% opacity on hover.

### Inputs: Focus-Glow States
*   **Default:** `surface_container_highest` background, 0px border-radius.
*   **Focus State:** The border glows with a 2px `primary` core and a 10px soft `primary` outer glow. The label should shift to `primary` color.

### Tactical Accents (Custom Component)
Every major container should feature "Corner Brackets"—small, 2px thick "L" shapes in the top-left and bottom-right corners using the `primary` or `secondary` tokens. This reinforces the "Tactical HUD" aesthetic.

### Cards & Lists
*   **Rule:** No dividers. 
*   **Separation:** Use a 4px vertical margin and a slight background shift (e.g., alternating between `surface_container_low` and `surface_container_lowest`).
*   **Hover:** Card scales by 1.02x with a `primary` glow appearing behind the glass.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use intentional asymmetry. Place metadata (labels) in unconventional corners to mimic a flight-control system.
*   **Do** use "Breathing Room." Let the deep background (#070A12) dominate at least 40% of the screen real estate to maintain the premium feel.
*   **Do** use backdrop blurs on all overlays to ensure the "depth" of the grid is always visible.

### Don't:
*   **Don't** use rounded corners. This system is built on sharp, tactical precision (0px radius).
*   **Don't** use pure white (#FFFFFF) for body text. Use `on_surface_variant` (#b9cacb) to reduce eye strain and maintain the "low-light" environment.
*   **Don't** use standard drop shadows. If it doesn't glow, it shouldn't have an outer effect.