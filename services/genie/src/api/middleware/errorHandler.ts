
import { Request, Response, NextFunction } from 'express';

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ErrorHandler] Error caught:', err.message);
  console.error('[ErrorHandler] Stack:', err.stack);

  // Always ensure we send JSON response, never HTML
  res.setHeader('Content-Type', 'application/json');

  // Check for specific error types if needed
  // if (err instanceof CustomError) {
  //   return res.status(err.statusCode).json({ error: err.message });
  // }

  // Ensure response is valid JSON
  const errorResponse = {
    success: false,
    error: err.message || 'Something went wrong!',
    timestamp: new Date().toISOString(),
  };

  // Validate the response can be JSON stringified
  try {
    JSON.stringify(errorResponse);
    res.status(500).json(errorResponse);
  } catch (jsonError) {
    // Last resort: send a simple text error that we know is safe
    console.error('[ErrorHandler] Could not stringify error response:', jsonError);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
};
