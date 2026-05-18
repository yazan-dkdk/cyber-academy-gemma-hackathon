---
name: Vincere Cryptex
colors:
  surface: '#10131c'
  surface-dim: '#10131c'
  surface-bright: '#363942'
  surface-container-lowest: '#0b0e16'
  surface-container-low: '#181b24'
  surface-container: '#1c1f28'
  surface-container-high: '#272a33'
  surface-container-highest: '#31353e'
  on-surface: '#e0e2ee'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#e0e2ee'
  inverse-on-surface: '#2d3039'
  outline: '#849495'
  outline-variant: '#3b494b'
  surface-tint: '#00dbe9'
  primary: '#dbfcff'
  on-primary: '#00363a'
  primary-container: '#00f0ff'
  on-primary-container: '#006970'
  inverse-primary: '#006970'
  secondary: '#ddb7ff'
  on-secondary: '#490080'
  secondary-container: '#6f00be'
  on-secondary-container: '#d6a9ff'
  tertiary: '#f5f5ff'
  on-tertiary: '#2b303e'
  tertiary-container: '#d5d9eb'
  on-tertiary-container: '#5a5e6e'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#7df4ff'
  primary-fixed-dim: '#00dbe9'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#f0dbff'
  secondary-fixed-dim: '#ddb7ff'
  on-secondary-fixed: '#2c0051'
  on-secondary-fixed-variant: '#6900b3'
  tertiary-fixed: '#dee2f4'
  tertiary-fixed-dim: '#c2c6d8'
  on-tertiary-fixed: '#161b28'
  on-tertiary-fixed-variant: '#424655'
  background: '#10131c'
  on-background: '#e0e2ee'
  surface-variant: '#31353e'
typography:
  display-xl:
    fontFamily: Space Grotesk
    fontSize: 72px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.04em
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  body-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: 0em
  label-mono:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.15em
spacing:
  container-max: 1280px
  gutter: 24px
  margin-side: 40px
  section-gap: 120px
  element-gap: 16px
  unit: 8px
---

## Brand & Style

This design system is engineered to evoke a sense of absolute security through a high-fidelity, tactical cyberpunk aesthetic. The brand personality is aggressive, sophisticated, and technologically superior, targeting elite C-suite executives and cybersecurity operatives.

The visual direction blends **Glassmorphism** with **Tactical HUD** elements. It avoids the neon-clutter of low-end gaming sites in favor of a refined "Command Center" feel. Expect high-detail metallic textures, semi-transparent obsidian surfaces, and multi-layered light leaks that suggest a deep, three-dimensional digital space. The emotional response should be one of "controlled power"—the user is not just viewing a page, but operating a high-end cryptographic weapon.

## Colors

The palette is anchored in **The Void (#070A12)**, a deep, saturated obsidian that provides the canvas for high-contrast light emissions. 

- **Primary Accent (Neon Cyan):** Used for critical data points, active security states, and primary call-to-actions. It represents the "pulse" of the system.
- **Secondary Accent (Neon Purple):** Used for encryption-related elements, depth-of-field glows, and secondary interactive states.
- **Surface & Tertiary:** These are low-contrast shades of midnight blue used to define structural containers and glass panels without breaking the dark immersion.

Gradients should be used sparingly, primarily as "linear-light" strokes or radial background glows rather than solid fills.

## Typography

The design system utilizes **Space Grotesk** exclusively to maintain a technical, geometric edge. 

- **Display Type:** Headlines should be set with tight tracking and leading to feel "heavy" and authoritative. 
- **Labels:** Use the "label-mono" style for HUD elements, metadata, and technical readouts. These should always be uppercase with increased letter spacing to mimic serial numbers or military designations.
- **Body:** Kept clean and legible. Paragraphs should be framed by ample negative space to ensure the technical data doesn't feel overwhelming.

## Layout & Spacing

This design system follows a **Fixed Grid** model for desktop, centered on a 12-column architecture. The rhythm is strictly based on an 8px base unit to ensure mathematical precision in element alignment.

Layouts should feel modular, like a dashboard. Use asymmetrical compositions to create visual interest—for example, a large technical visualization spanning 8 columns balanced by 4 columns of metadata. Negative space is not "empty" here; it should be treated as "dead air" between active signals, often filled with very subtle micro-grids or scanning lines.

## Elevation & Depth

Depth is conveyed through **Multi-layered Glassmorphism** and chromatic layering.

1.  **Base Layer:** The background (#070A12) with subtle metallic grain or micro-dot textures.
2.  **Mid Layer (Glass):** Semi-transparent panels with a `backdrop-filter: blur(20px)` and a thin `1px` border using a linear gradient of Cyan to Purple at 10% opacity.
3.  **Top Layer (Glow):** Elements "emit" light rather than casting shadows. Use `box-shadow` with large spread and low opacity in the primary accent color to create a "bloom" effect around critical UI components.
4.  **HUD Layer:** Purely functional technical elements (crosshairs, coordinate labels) that sit on the absolute top of the stack, often using a flickering animation or scan-line overlay.

## Shapes

The design system utilizes **Sharp (0px)** corners to emphasize the aggressive, tactical nature of the product. Curves are seen as "too soft" for a high-end cybersecurity tool.

Instead of rounded corners, use **chamfered edges** (40-degree clipped corners) for buttons and primary containers to mimic CNC-machined metal hardware. Functional elements like progress bars or status indicators should use square caps and segmented blocks.

## Components

### Buttons
Primary buttons are solid Cyan with black text, featuring a subtle outer glow. Secondary buttons use a "Ghost" style with a 1px metallic border and a "glitch" hover effect where the background color flickers briefly.

### Cards
Cards are glassmorphic containers with a "Top-down" light source effect. The top edge should have a slightly brighter 1px highlight to suggest a metallic lip.

### HUD Elements
Incorporate "Tactical Overlays"—small, non-interactive elements like corner brackets, coordinate numbers, or rotating hex-grids that frame the main content. These should be set in the `label-mono` typography style.

### Input Fields
Inputs should look like terminal prompts. Use a solid bottom border only, or a fully enclosed box with a subtle scanning-line animation that moves vertically across the field when focused.

### Data Visualization
Use segmented rings and bars. Avoid smooth curves in charts; prefer stepped lines or "pixel-perfect" block histograms to reinforce the digital, cryptographic theme.