// AI Studio embeds bolt.diy (services/bolt-diy), which owns prompting,
// generation, and live preview. See services/bolt-diy/DEVDROP_INTEGRATION.md.
export const BOLT_DIY_URL = import.meta.env.VITE_BOLT_DIY_URL || '';
