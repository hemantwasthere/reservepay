# UI conventions

ReservePay uses Tailwind CSS v4 and locally owned shadcn components.

- Build controls from `@/components/ui` and compose them in feature components. Extend these primitives or add a shadcn primitive before building a new control from scratch.
- Keep component layout, responsive states, and interaction styling in Tailwind utilities. Combine conditional classes with `cn` from `@/lib/utils`.
- `src/styles.css` contains fonts, theme tokens, base document defaults, and animation keyframes. Do not add feature-specific stylesheets.
- Use the shared Button variants (`brand`, `ink`, `quiet`, `outline`, `ghost`) for actions. `unstyled` is for controls whose feature layout supplies their appearance. Buttons default to `type="button"`; form submissions must explicitly use `type="submit"`.
- Use shadcn Dialog, Sheet, Popover, Tooltip, Accordion, Slider, and Sonner for their corresponding interactions. Preserve their focus management, labels, keyboard behavior, and reduced-motion support.
- `/app` is the reserve overview; `/app/payments` owns payment link creation and order history. Both use `WorkspaceSidebar`, with a persistent desktop icon rail and a mobile navigation drawer.

The shadcn CLI is configured in `apps/web/components.json`; run it from `apps/web` when adding primitives, and apply the ReservePay theme to the generated component.
