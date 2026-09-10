/**
 * Middleware to ensure all responses are JSON
 * Prevents accidentally sending HTML or plain text
 */

import { Request, Response, NextFunction } from 'express';

export const ensureJsonResponse = (_req: Request, res: Response, next: NextFunction) => {
  // Store original json method
  const originalJson = res.json;

  // Override json method to add validation
  res.json = function(data: any) {
    try {
      // Ensure Content-Type is set to JSON
      res.setHeader('Content-Type', 'application/json');
      
      // Validate that data can be stringified
      JSON.stringify(data);
      
      // Call original json method
      return originalJson.call(this, data);
    } catch (error) {
      console.error('[JsonResponse] Error stringifying response data:', error);
      console.error('[JsonResponse] Data that failed:', data);
      
      // Send a safe error response instead
      res.setHeader('Content-Type', 'application/json');
      return originalJson.call(this, {
        success: false,
        error: 'Internal server error: Invalid response format',
      });
    }
  };

  // Store original send method
  const originalSend = res.send;

  // Override send method to prevent non-JSON responses
  res.send = function(data: any) {
    // Skip validation if response has already been sent
    if (res.headersSent) {
      return originalSend.call(this, data);
    }
    
    // Skip validation if Content-Type is already set to JSON
    // This means res.json() was already called and Express handled serialization
    const contentType = res.getHeader('Content-Type');
    if (contentType && contentType.toString().includes('application/json')) {
      return originalSend.call(this, data);
    }
    
    // If data is not a Buffer and looks like it might be HTML
    if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
      console.warn('[JsonResponse] Attempted to send HTML response, converting to JSON error');
      res.setHeader('Content-Type', 'application/json');
      return originalJson.call(this, {
        success: false,
        error: 'Server error: Invalid response format',
      });
    }
    
    // Call original send
    return originalSend.call(this, data);
  };

  next();
};
