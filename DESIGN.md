---
name: Kinetic Social Logic
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#006a66'
  on-secondary: '#ffffff'
  secondary-container: '#29fcf3'
  on-secondary-container: '#00716d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#40000d'
  on-tertiary-container: '#ff2055'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#29fcf3'
  secondary-fixed-dim: '#00ddd6'
  on-secondary-fixed: '#00201e'
  on-secondary-fixed-variant: '#00504d'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b7'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#92002a'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1'
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
  gutter: 20px
  margin: 24px
---

## Brand & Style

The design system is engineered for the high-velocity world of Key Opinion Consumers (KOCs) and social commerce. The brand personality is **Intelligent, Kinetic, and Authoritative**. It balances the technical rigor of a SaaS management platform with the vibrant, trend-driven energy of TikTok and Facebook.

The design style is **Corporate Modern with Glassmorphism accents**. It utilizes a systematic "Social Tech" aesthetic: clean, structured data environments punctuated by high-energy interactive elements. Surfaces are primarily solid and professional, while AI-driven features (like chatbot interfaces and predictive analytics) utilize subtle backdrop blurs and luminous gradients to signify "smart" functionality. The emotional response should be one of complete control over chaotic social data.

## Colors

The palette is anchored in **Deep Navy (#0F172A)** and **Slate (#64748B)** to establish professional stability and readability in data-heavy views. To reflect the platform's social DNA, it employs a "Social Tech" accent duo: **Electric Cyan (#00F2EA)** and **Vibrant Magenta (#FF0050)**.

- **Primary:** Deep Navy is used for global navigation, primary headings, and high-emphasis backgrounds.
- **Secondary/Accents:** Cyan and Magenta are reserved for interactive triggers, AI status indicators, and critical data trend lines.
- **Backgrounds:** A clean **#F8FAFC** (Slate-50) serves as the canvas, ensuring that dense information layouts remain breathable.
- **Semantic:** Success (Emerald), Warning (Amber), and Error (Rose) follow standard SaaS conventions but are tuned to match the saturation of the accent palette.

## Typography

The typography system prioritizes high-speed legibility and technical precision. **Geist** is used for headlines and labels to provide a "developer-tool" sharpness that feels modern and AI-aligned. **Inter** handles all body copy and data entries, chosen for its exceptional readability in dense tables and dashboards.

- **Scale:** A tight modular scale ensures that information density is maintained without sacrificing hierarchy.
- **Labels:** Use uppercase for `label-sm` to differentiate metadata from actionable content.
- **Data Sets:** For numerical data in tables, use tabular lining figures (monospaced numbers) to ensure columns align perfectly.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. It is built on a **4px baseline rhythm**.

- **Density:** The layout is high-density. Standard padding for table cells and list items is `8px` (sm) to maximize the amount of visible data above the fold.
- **Containers:** Dashboard modules use a `16px` (md) or `24px` (lg) internal padding depending on content complexity.
- **Breakpoints:** 
    - Mobile: 0 - 599px (Margins: 16px)
    - Tablet: 600 - 1023px (Margins: 24px)
    - Desktop: 1024px+ (Margins: 32px, Max-width: 1440px)

## Elevation & Depth

This design system uses **Tonal Layers** supplemented by **Glassmorphism** for intelligent features.

1.  **Base (Level 0):** Background (#F8FAFC).
2.  **Surface (Level 1):** White cards with a subtle 1px border (#E2E8F0). No shadows. Used for standard data widgets.
3.  **Raised (Level 2):** White cards with a soft, neutral shadow (0 4px 6px -1px rgb(0 0 0 / 0.1)). Used for active states and hover effects on interactive modules.
4.  **Overlay (Level 3):** Modals and dropdowns. Features a more pronounced shadow and a subtle border.
5.  **Smart/AI Layer:** Elements associated with AI chatbots use a `backdrop-blur: 12px` with a semi-transparent white fill (80% opacity) and a thin, glowing border using a 10% Cyan-to-Magenta gradient.

## Shapes

The shape language is **Soft and Professional**. A consistent `0.25rem` (4px) corner radius is used for most UI elements to maintain a technical, "to-the-edge" feel that maximizes screen real estate for data.

- **Small Components:** Checkboxes and small buttons use the 4px radius.
- **Cards & Modules:** Use `rounded-lg` (8px) to create a clear container distinction.
- **AI Chat Bubbles:** Use `rounded-xl` (12px) to provide a friendlier, more conversational tone compared to the rigid data tables.

## Components

- **Buttons:** 
    - *Primary:* Solid Deep Navy with white text. 
    - *Secondary:* Transparent with a 1px Slate border. 
    - *Smart:* Gradient Cyan-to-Magenta background with white text, used only for AI-triggered actions.
- **Input Fields:** Flat design with a 1px border (#E2E8F0). On focus, the border transitions to Cyan with a 2px outer glow.
- **Chips/Badges:** Small, high-contrast labels. TikTok status badges use the Magenta/Cyan palette; status indicators (Active/Inactive) use muted tonal fills.
- **Data Tables:** Borderless rows with a subtle hover state (#F1F5F9). Columns are tightly packed with `label-sm` headers.
- **AI Chatbot Interface:** Floating bubble in the bottom right using Glassmorphism. Chat bubbles use the secondary/accent colors as subtle accents to differentiate "User" vs "AI" responses.
- **Status Indicators:** Use pulsing "glow" animations for live social media streams or active data fetching to emphasize the platform's kinetic nature.