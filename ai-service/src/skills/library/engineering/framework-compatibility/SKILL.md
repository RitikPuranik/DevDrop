# Framework Compatibility: React + Vite (DevDrop original)

These facts describe the DevDrop generator and take precedence over any other guidance.

## Language and files
JavaScript and JSX only. No TypeScript syntax, no .ts or .tsx files, no type annotations, interfaces, generics or type-only imports. The entry component is /App.js with a default export. Source files use .js or .jsx.

## Runtime model
Client-rendered Vite single-page app. No server components, no server actions, no Next.js APIs (next/image, next/link, next/font, getServerSideProps), no Node-only modules in browser code.

## Styling
Tailwind-compatible utility classes work without extra packages; the build adds the Tailwind CDN script when needed. Put design tokens and any custom CSS in a plain .css file imported from the entry. Do not require a tailwind.config unless the architecture declares tailwindcss.

## Assets
Uploaded media arrive as asset:// references that are replaced with real URLs after generation. Copy them exactly. Never reference /public or filename-only paths for uploaded assets, and never reference files that are not part of the project.

## Environment
Do not read process.env or import.meta.env values that will not exist on the deployed site. Use literals or in-code defaults. Never embed keys, tokens or credentials.

## Routing
Deployed sites get a single-page rewrite to index.html, so client-side routing works. Prefer in-page sections for small sites; use react-router only when the architecture declares it.

## Dependencies
Add a dependency only when the architecture declares it. Prefer plain React and CSS. Use real, widely used package names only.
