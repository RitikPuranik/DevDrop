/**
 * Helper utilities for working with ADK agents
 * Provides safe wrappers and error handling for agent interactions
 */

interface AgentResponse {
  files?: Array<{ path: string; content: string }>;
  summary: string;
  needsSpecialist?: boolean;
  specialistAgent?: string;
}

/**
 * Safely call an agent with retry logic and error handling
 * Returns a properly formatted response or throws a descriptive error
 */
export async function safeAgentCall(
  runner: any,
  message: any,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    context?: string;
  } = {}
): Promise<AgentResponse> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    context = 'Agent'
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${context}] Attempt ${attempt}/${maxRetries}...`);
      
      const startTime = Date.now();
      const response = await runner.ask(message);
      const duration = Date.now() - startTime;
      
      console.log(`[${context}] Response received in ${duration}ms`);

      // Validate and normalize the response
      const normalized = normalizeAgentResponse(response, context);
      
      console.log(`[${context}] Response validated successfully`);
      return normalized;

    } catch (error: any) {
      lastError = error;
      
      console.error(`[${context}] Attempt ${attempt} failed:`, error.message);
      
      // Check if it's a recoverable error
      const isRecoverable = isRecoverableError(error);
      
      if (!isRecoverable || attempt >= maxRetries) {
        console.error(`[${context}] Error is not recoverable or max retries reached`);
        break;
      }

      // Wait before retrying (exponential backoff)
      const delay = retryDelay * Math.pow(2, attempt - 1);
      console.log(`[${context}] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  throw new Error(
    `${context} failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * Normalize and validate agent response
 */
function normalizeAgentResponse(response: any, context: string): AgentResponse {
  console.log(`[${context}] Normalizing response...`);
  console.log(`[${context}] Response type:`, typeof response);

  // Handle string responses (try to parse as JSON)
  if (typeof response === 'string') {
    console.log(`[${context}] Response is string (${response.length} chars)`);
    
    // Try to extract JSON from potential markdown or text wrapper
    let jsonStr = response.trim();
    
    // Remove markdown code fences if present
    if (jsonStr.startsWith('```')) {
      const lines = jsonStr.split('\n');
      lines.shift(); // Remove first ```json or ```
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop(); // Remove last ```
      }
      jsonStr = lines.join('\n');
    }

    // Try to parse
    try {
      response = JSON.parse(jsonStr);
      console.log(`[${context}] Successfully parsed string to JSON`);
    } catch (parseError: any) {
      console.error(`[${context}] JSON parse failed:`, parseError.message);
      console.error(`[${context}] First 500 chars:`, jsonStr.substring(0, 500));
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }
  }

  // Validate it's an object
  if (!response || typeof response !== 'object') {
    throw new Error(`Response is not an object (type: ${typeof response})`);
  }

  // Check if this is a conversational response or specialist transfer (no files)
  if (!response.files) {
    console.log(`[${context}] Conversational response or specialist transfer detected (no files)`);
    
    // Validate summary exists
    if (!response.summary || typeof response.summary !== 'string') {
      console.error(`[${context}] Response keys:`, Object.keys(response));
      throw new Error('Response missing required "summary" property');
    }
    
    // Additional validation: Check if summary indicates ACTUAL routing (not just mentioning routing as capability)
    // More specific patterns that indicate ACTUAL routing intent (not just describing capabilities)
    const actualRoutingPatterns = [
      /i'll route.*to/i,                    // "I'll route this to X"
      /i'm routing.*to/i,                   // "I'm routing this to X"
      /routing.*to\s+\w+agent/i,            // "routing to XAgent"
      /transferring.*to/i,                  // "transferring to X"
      /delegating.*to/i,                    // "delegating to X"
      /forwarding.*to/i,                    // "forwarding to X"
    ];
    
    const looksLikeActualRouting = actualRoutingPatterns.some(pattern => pattern.test(response.summary));
    
    if (looksLikeActualRouting) {
      console.log(`[${context}] Summary indicates ACTUAL routing: "${response.summary.substring(0, 100)}"`);
      
      if (!response.needsSpecialist || !response.specialistAgent) {
        console.error(`[${context}] ⚠️ ROUTING RESPONSE ERROR!`);
        console.error(`[${context}] Summary mentions routing but missing fields:`);
        console.error(`[${context}] - needsSpecialist: ${response.needsSpecialist}`);
        console.error(`[${context}] - specialistAgent: ${response.specialistAgent}`);
        
        // Try to extract agent name from summary
        const agentMatch = response.summary.match(/(?:route|routing|transfer|delegate|forward).*to\s+(\w+)/i);
        if (agentMatch) {
          const extractedAgent = agentMatch[1];
          console.warn(`[${context}] Extracted agent name from summary: "${extractedAgent}"`);
          console.warn(`[${context}] Auto-correcting response to include routing fields`);
          
          return {
            summary: response.summary,
            needsSpecialist: true,
            specialistAgent: extractedAgent
          };
        } else {
          console.error(`[${context}] Could not extract agent name from summary`);
          throw new Error(
            `Invalid routing response: Summary mentions routing but missing needsSpecialist/specialistAgent fields. ` +
            `Summary: "${response.summary.substring(0, 200)}"`
          );
        }
      }
    }
    
    // Check if this needs specialist routing
    if (response.needsSpecialist) {
      console.log(`[${context}] Specialist agent requested: ${response.specialistAgent || 'unknown'}`);
      
      if (!response.specialistAgent) {
        throw new Error('needsSpecialist is true but specialistAgent is missing');
      }
      
      return {
        summary: response.summary,
        needsSpecialist: true,
        specialistAgent: response.specialistAgent
      };
    }
    
    return {
      summary: response.summary
    };
  }

  // Validate files array if present
  if (!Array.isArray(response.files)) {
    throw new Error(`Response "files" is not an array (type: ${typeof response.files})`);
  }

  // Validate each file
  for (let i = 0; i < response.files.length; i++) {
    const file = response.files[i];
    
    if (!file || typeof file !== 'object') {
      throw new Error(`File at index ${i} is not an object`);
    }

    if (!file.path || typeof file.path !== 'string') {
      throw new Error(`File at index ${i} missing valid "path" property`);
    }

    if (typeof file.content !== 'string') {
      console.warn(`[${context}] File "${file.path}" has non-string content, converting...`);
      
      if (file.content === null || file.content === undefined) {
        response.files[i].content = '';
      } else if (typeof file.content === 'object') {
        response.files[i].content = JSON.stringify(file.content, null, 2);
      } else {
        response.files[i].content = String(file.content);
      }
    }

    // Clean up escape sequences
    response.files[i].content = cleanEscapeSequences(response.files[i].content);
  }

  console.log(`[${context}] Validated ${response.files.length} files`);

  return {
    files: response.files,
    summary: response.summary || 'Changes applied'
  };
}

/**
 * Clean up problematic escape sequences in content
 */
function cleanEscapeSequences(content: string): string {
  // Handle double-escaped content
  if (content.startsWith('"') && content.endsWith('"')) {
    try {
      const unescaped = JSON.parse(content);
      if (typeof unescaped === 'string') {
        return unescaped;
      }
    } catch {
      // Not double-escaped, continue
    }
  }

  return content;
}

/**
 * Check if an error is recoverable (worth retrying)
 */
function isRecoverableError(error: any): boolean {
  const message = error.message?.toLowerCase() || '';
  
  // Schema validation errors might be recoverable
  if (message.includes('schema validation') || 
      message.includes('zod validation') ||
      message.includes('json parse')) {
    return true;
  }

  // Network errors are recoverable
  if (message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('enotfound')) {
    return true;
  }

  // Rate limit errors are recoverable
  if (message.includes('rate limit') ||
      message.includes('429')) {
    return true;
  }

  // Server errors might be temporary
  if (message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')) {
    return true;
  }

  // Other errors are probably not recoverable
  return false;
}
