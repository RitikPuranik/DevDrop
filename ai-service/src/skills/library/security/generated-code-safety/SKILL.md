# Generated Code Safety (DevDrop original)

## Never generate
eval, new Function, document.write, string-based setTimeout, or dynamic script injection. Never add script tags or imports for third-party hosts other than the Tailwind CDN already used by the scaffold and font stylesheets.

## Network
Do not call external APIs, webhooks or analytics unless the requirements explicitly name them. Static content belongs in data files. Do not add tracking, fingerprinting or remote logging.

## HTML and links
Render user-provided text as text. Avoid dangerouslySetInnerHTML; if static markup is unavoidable it must be a literal. Add rel="noopener noreferrer" to target="_blank" links. Iframes only for sources named in the requirements.

## Secrets and environment
Never embed API keys, tokens, passwords or credentials, and never read process.env. Do not reference internal URLs, localhost or private network addresses.

## Dependencies
Add only dependencies the architecture declares, with real package names. Prefer no dependency over a new one.

## Uploaded assets
Use the exact manifest URLs for the user's own assets only. Never reference another customer's files or construct storage URLs.
