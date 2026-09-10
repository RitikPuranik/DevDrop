/**
 * HuggingFace API Key Manager
 * Manages and rotates HuggingFace API keys in a round-robin fashion
 * Similar to Narrato's key rotation mechanism
 */
export class HuggingFaceKeyManager {
  private keys: string[];
  private currentKeyIndex: number;
  private keyUsage: Map<string, number>;
  private lock: boolean;

  constructor() {
    this.keys = this.loadKeys();
    this.currentKeyIndex = 0;
    this.keyUsage = new Map();
    this.lock = false;

    // Initialize usage counter for each key
    this.keys.forEach((key) => {
      this.keyUsage.set(key, 0);
    });

    console.log(`✅ HuggingFace Key Manager initialized with ${this.keys.length} keys`);
  }

  /**
   * Load all HuggingFace API keys from environment
   * Supports HUGGING_FACE_TOKEN, HUGGING_FACE_TOKEN_2, ..., HUGGING_FACE_TOKEN_N
   */
  private loadKeys(): string[] {
    const keys: Array<{ index: number; value: string }> = [];
    const env = process.env;

    // Get all HUGGING_FACE_TOKEN* keys
    Object.keys(env).forEach((key) => {
      if (key.startsWith('HUGGING_FACE_TOKEN')) {
        const value = env[key];
        if (value && value.trim()) {
          // Extract index from key name (e.g., HUGGING_FACE_TOKEN_2 -> 2)
          if (key === 'HUGGING_FACE_TOKEN') {
            keys.push({ index: 1, value });
          } else {
            const match = key.match(/_(\d+)$/);
            if (match) {
              keys.push({ index: parseInt(match[1], 10), value });
            }
          }
        }
      }
    });

    // Sort by index to maintain consistent order
    keys.sort((a, b) => a.index - b.index);

    if (keys.length === 0) {
      throw new Error('No HuggingFace API keys found in environment variables');
    }

    return keys.map((k) => k.value);
  }

  /**
   * Acquire lock (simple async lock implementation)
   */
  private async acquireLock(): Promise<void> {
    while (this.lock) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    this.lock = true;
  }

  /**
   * Release lock
   */
  private releaseLock(): void {
    this.lock = false;
  }

  /**
   * Get next API key in round-robin fashion
   * Thread-safe with simple locking mechanism
   */
  async getNextKey(): Promise<string> {
    await this.acquireLock();
    try {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.keys.length;
      const key = this.keys[this.currentKeyIndex];
      
      // Increment usage counter
      const currentUsage = this.keyUsage.get(key) || 0;
      this.keyUsage.set(key, currentUsage + 1);

      return key;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Get current API key without rotation
   */
  getCurrentKey(): string {
    return this.keys[this.currentKeyIndex];
  }

  /**
   * Get least-used API key
   * Useful for load balancing
   */
  async getLeastUsedKey(): Promise<string> {
    await this.acquireLock();
    try {
      let leastUsedKey = this.keys[0];
      let minUsage = this.keyUsage.get(leastUsedKey) || 0;

      this.keys.forEach((key) => {
        const usage = this.keyUsage.get(key) || 0;
        if (usage < minUsage) {
          minUsage = usage;
          leastUsedKey = key;
        }
      });

      // Increment usage counter
      this.keyUsage.set(leastUsedKey, minUsage + 1);

      return leastUsedKey;
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.keys.forEach((key, index) => {
      const maskedKey = `key_${index + 1}_...${key.slice(-4)}`;
      stats[maskedKey] = this.keyUsage.get(key) || 0;
    });
    return stats;
  }

  /**
   * Get total number of keys
   */
  getKeyCount(): number {
    return this.keys.length;
  }

  /**
   * Reset usage statistics (useful for monitoring/testing)
   */
  resetUsageStats(): void {
    this.keys.forEach((key) => {
      this.keyUsage.set(key, 0);
    });
  }
}

// Singleton instance
let keyManagerInstance: HuggingFaceKeyManager | null = null;

/**
 * Get singleton instance of HuggingFace Key Manager
 */
export function getHuggingFaceKeyManager(): HuggingFaceKeyManager {
  if (!keyManagerInstance) {
    keyManagerInstance = new HuggingFaceKeyManager();
  }
  return keyManagerInstance;
}

/**
 * Reset singleton instance (useful for testing)
 */
export function resetHuggingFaceKeyManager(): void {
  keyManagerInstance = null;
}
