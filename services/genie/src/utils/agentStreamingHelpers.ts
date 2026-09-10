/**
 * Streaming helper utilities for ADK agents with real-time progress updates
 * Captures function calls, responses, and agent thoughts for detailed visibility
 */

interface StreamingOptions {
  maxRetries?: number;
  retryDelay?: number;
  context?: string;
  onProgress?: (update: ProgressUpdate) => void | Promise<void>;
}

export interface ProgressUpdate {
  type: 'thought' | 'tool_call' | 'tool_result' | 'error';
  content: string;
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
  timestamp: number;
}

export interface StreamingAgentResponse {
  files?: Array<{ path: string; content: string }>;
  summary: string;
  needsSpecialist?: boolean;
  specialistAgent?: string;
  [key: string]: any; // Allow additional fields from GitHubAgent
}

/**
 * Safely call an agent with streaming progress updates
 * Captures and reports ALL intermediate events: thoughts, tool calls, tool results
 * 
 * IMPORTANT: This requires the NEW ADK runner API returned from AgentBuilder.build()
 * which includes { agent, runner, session, sessionService }
 */
export async function safeAgentCallWithStreaming(
  builtAgent: any, // Should be BuiltAgent from AgentBuilder.build()
  message: any,
  options: StreamingOptions = {}
): Promise<StreamingAgentResponse> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    context = 'Agent',
    onProgress,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[${context}] Streaming attempt ${attempt}/${maxRetries}...`);
      
      const startTime = Date.now();
      let finalResponse: any = null;
      let eventCount = 0;

      // Extract runner and session from built agent
      const runner = builtAgent.runner || builtAgent;
      const session = builtAgent.session;

      // Check what methods are available
      const hasAskMethod = typeof runner.ask === 'function';
      const hasRunAsyncMethod = typeof runner.runAsync === 'function';

      if (!hasAskMethod && !hasRunAsyncMethod) {
        throw new Error('Runner must have either ask() or runAsync() method');
      }

      console.log(`[${context}] Available methods: ask=${hasAskMethod}, runAsync=${hasRunAsyncMethod}`);
      console.log(`[${context}] Has session: ${!!session}`);
      if (session) {
        console.log(`[${context}] Session ID: ${session.id}, User ID: ${session.userId}`);
      }

      // TRY runAsync first (supports true streaming), then fallback to ask()
      if (hasRunAsyncMethod && session) {
        // Full API: runner.runAsync() - supports true streaming
        console.log(`[${context}] Using full runAsync() API with session streaming`);
        
        // Ensure message has correct format
        const newMessage = typeof message === 'string' 
          ? { role: 'user', parts: [{ text: message }] }
          : message.parts 
            ? message 
            : { role: 'user', parts: [{ text: String(message) }] };

        // Track if we received any tool-related events
        let receivedToolEvents = false;

        // Stream events from the runner using the existing session
        for await (const event of runner.runAsync({
          userId: session.userId,
          sessionId: session.id,
          newMessage,
          runConfig: { maxTurns: 20 }, // Allow multiple turns for complex operations
        })) {
          eventCount++;
          
          // Process each event type
          await processEvent(event, context, onProgress);
          
          // Track if we got tool-related events
          if (event?.content?.parts?.some((p: any) => p.functionCall || p.functionResponse)) {
            receivedToolEvents = true;
          }
          
          // Check if this is the final response
          if (event.isFinalResponse?.()) {
            console.log(`[${context}] Final response received (event #${eventCount})`);
            finalResponse = event;
          }
        }

        const duration = Date.now() - startTime;
        console.log(`[${context}] Streaming completed in ${duration}ms (${eventCount} events, tool events: ${receivedToolEvents})`);

        if (!finalResponse) {
          throw new Error('No final response received from agent');
        }

        // Extract response from final event
        const normalized = await extractResponse(finalResponse, context);
        
        // If we didn't receive tool events during streaming but response contains analysis/findings,
        // emit a synthetic event to show the analysis was done
        if (!receivedToolEvents && onProgress && (normalized.analysis?.approach || normalized.analysis?.understood)) {
          console.log(`[${context}] Emitting analysis findings (no tool events received during streaming)`);
          
          const analysisMessage = `📊 Analysis Complete:\n${normalized.analysis?.understood || ''}\n\n📋 Approach:\n${normalized.analysis?.approach || ''}`;
          await onProgress({
            type: 'thought',
            content: analysisMessage,
            timestamp: Date.now(),
          });
        }
        
        console.log(`[${context}] Response validated successfully`);
        return normalized;
      } else if (hasAskMethod) {
        // Fallback API: runner.ask() - no streaming, but still works
        console.log(`[${context}] ⚠️ FALLBACK: Using ask() API (streaming not available)`);
        console.log(`[${context}] Fallback reason: hasRunAsyncMethod=${hasRunAsyncMethod}, hasSession=${!!session}`);
        
        // Emit thinking start message to frontend and backend log
        if (onProgress) {
          try {
            const startMessage = '🤔 Processing request...';
            console.log(`[${context}] 💭 Thought: ${startMessage}`);
            const result = onProgress({
              type: 'thought',
              content: startMessage,
              timestamp: Date.now(),
            });
            if (result instanceof Promise) {
              await result;
            }
          } catch (error) {
            console.error(`[${context}] Error in onProgress callback:`, error);
          }
        }

        // Intercept console.log to capture tool calls that ADK logs
        const originalLog = console.log;
        const capturedLogs: string[] = [];
        let emittedLogs = new Set<string>(); // Track what we've already emitted to avoid duplicates
        
        console.log = function(...args: any[]) {
          const logStr = args.join(' ');
          capturedLogs.push(logStr);
          
          // Always log to original console for backend visibility
          originalLog.apply(console, args as any);
          
          // Emit ALL logs containing tool-like patterns or agent thinking
          // But avoid duplicate emissions by tracking what we've already emitted
          const logKey = logStr.substring(0, 100); // Use first 100 chars as key
          
          if (!emittedLogs.has(logKey) &&
              (logStr.includes('🔧') || logStr.includes('🔍') || logStr.includes('📁') || 
               logStr.includes('📄') || logStr.includes('✏️') || logStr.includes('🔀') ||
               logStr.includes('Tool') || logStr.includes('tool') || logStr.includes('Calling') ||
               logStr.includes('🌐') || logStr.includes('API') || logStr.includes('Finding') ||
               logStr.includes('Searching') || logStr.includes('Found'))) {
            
            emittedLogs.add(logKey);
            
            if (onProgress) {
              // Determine if it's a tool call, tool result, or thought
              let updateType: 'tool_call' | 'tool_result' | 'thought' = 'thought';
              
              if (logStr.includes('Calling') || logStr.includes('Invoking') || logStr.includes('🔧') || 
                  logStr.includes('Searching') || logStr.includes('🔍')) {
                updateType = 'tool_call';
              } else if (logStr.includes('Result') || logStr.includes('Found') || logStr.includes('✅') ||
                         logStr.includes('completed')) {
                updateType = 'tool_result';
              }
              
              const progressResult = onProgress({
                type: updateType,
                content: logStr,
                timestamp: Date.now(),
              });
              // Handle both void and Promise returns
              if (progressResult instanceof Promise) {
                progressResult.catch(() => {
                  // Silently catch errors
                });
              }
            }
          }
          
          return undefined;
        };

        try {
          const response = await runner.ask(message);
          
          // Restore original console.log
          console.log = originalLog;
          
          // Response is already the final structured output (Zod schema validated)
          console.log(`[${context}] Got response from ask(): ${typeof response}`);
          
          const duration = Date.now() - startTime;
          console.log(`[${context}] Completed in ${duration}ms (captured ${capturedLogs.length} logs, emitted ${emittedLogs.size})`);
          
          // Log captured function calls for backend visibility
          if (capturedLogs.length > 0) {
            console.log(`[${context}] === Captured Tool Calls and Events ===`);
            capturedLogs.forEach(log => {
              if (log.includes('🔧') || log.includes('Tool') || log.includes('tool') || 
                  log.includes('Calling') || log.includes('Found') || log.includes('Found')) {
                console.log(`[${context}] 📋 ${log}`);
              }
            });
            console.log(`[${context}] === End Tool Calls ===`);
          }
          
          return response as StreamingAgentResponse;
        } catch (error) {
          // Restore original console.log even on error
          console.log = originalLog;
          throw error;
        }
      } else {
        throw new Error('runAsync() requires session from AgentBuilder.build()');
      }

    } catch (error: any) {
      lastError = error;
      
      console.error(`[${context}] Streaming attempt ${attempt} failed:`, error.message);
      
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
 * Process a single event and emit progress updates
 */
async function processEvent(
  event: any,
  context: string,
  onProgress?: (update: ProgressUpdate) => void | Promise<void>
): Promise<void> {
  if (!event || !event.content || !event.content.parts) {
    return;
  }

  const parts = event.content.parts;
  
  for (const part of parts) {
    // Handle text (agent thoughts/reasoning)
    if (part.text) {
      console.log(`[${context}] 💭 Thought:`, part.text.substring(0, 200));
      
      if (onProgress) {
        try {
          const result = onProgress({
            type: 'thought',
            content: part.text,
            timestamp: Date.now(),
          });
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.error(`[${context}] Error in onProgress callback:`, error);
        }
      }
    }

    // Handle function calls (tool invocations)
    if (part.functionCall) {
      const toolName = part.functionCall.name;
      const toolArgs = part.functionCall.args || {};
      
      console.log(`[${context}] 🔧 Tool Call: ${toolName}`);
      console.log(`[${context}]    Args:`, JSON.stringify(toolArgs, null, 2).substring(0, 300));
      
      if (onProgress) {
        try {
          const result = onProgress({
            type: 'tool_call',
            content: formatToolCall(toolName, toolArgs),
            toolName,
            toolArgs,
            timestamp: Date.now(),
          });
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.error(`[${context}] Error in onProgress callback:`, error);
        }
      }
    }

    // Handle function responses (tool results)
    if (part.functionResponse) {
      const toolName = part.functionResponse.name;
      const toolResult = part.functionResponse.response;
      
      console.log(`[${context}] ✅ Tool Result: ${toolName}`);
      console.log(`[${context}]    Result:`, JSON.stringify(toolResult, null, 2).substring(0, 300));
      
      if (onProgress) {
        try {
          const result = onProgress({
            type: 'tool_result',
            content: formatToolResult(toolName, toolResult),
            toolName,
            toolResult,
            timestamp: Date.now(),
          });
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.error(`[${context}] Error in onProgress callback:`, error);
        }
      }
    }

    // Handle code execution results
    if (part.codeExecutionResult) {
      console.log(`[${context}] 🖥️ Code Execution:`, part.codeExecutionResult.output?.substring(0, 200));
      
      if (onProgress) {
        try {
          const result = onProgress({
            type: 'tool_result',
            content: `Code executed:\n${part.codeExecutionResult.output || 'No output'}`,
            toolName: 'code_execution',
            toolResult: part.codeExecutionResult,
            timestamp: Date.now(),
          });
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.error(`[${context}] Error in onProgress callback:`, error);
        }
      }
    }
  }
}

/**
 * Format tool call for display with context-aware messages
 */
function formatToolCall(toolName: string, args: any): string {
  // GitHub-specific tool calls with meaningful messages
  switch (toolName) {
    case 'github_search_users':
      return `🔍 Searching for GitHub user: "${args.username || args.query}"`;
    
    case 'github_get_user_repos':
      return `📂 Fetching repositories for user: ${args.username || args.owner}`;
    
    case 'github_get_repo_contents':
      return `📁 Reading repository contents: ${args.owner}/${args.repo}${args.path ? `/${args.path}` : ''}`;
    
    case 'github_get_file_content':
      return `📄 Reading file: ${args.path} from ${args.owner}/${args.repo}`;
    
    case 'github_create_or_update_file':
      return `✏️ ${args.sha ? 'Updating' : 'Creating'} file: ${args.path} in ${args.owner}/${args.repo}`;
    
    case 'github_create_pull_request':
      return `🔀 Creating pull request: "${args.title}" (${args.head} → ${args.base})`;
    
    case 'github_create_issue':
      return `� Creating issue: "${args.title}" in ${args.owner}/${args.repo}`;
    
    case 'github_search_code':
      return `🔎 Searching code: "${args.query}" in ${args.owner}/${args.repo}`;
    
    case 'github_list_branches':
      return `🌿 Listing branches in ${args.owner}/${args.repo}`;
    
    case 'github_create_branch':
      return `🌱 Creating branch: ${args.branch} from ${args.from_branch || 'default'}`;
    
    case 'github_fork_repository':
      return `🍴 Forking repository: ${args.owner}/${args.repo}`;
    
    case 'github_create_repository':
      return `📦 Creating repository: ${args.name}${args.description ? ` - ${args.description}` : ''}`;
    
    // Generic fallback for other tools
    default:
      const formattedArgs = formatArgs(args);
      return `🔧 ${toolName.replace(/_/g, ' ')}${formattedArgs}`;
  }
}

/**
 * Format tool result for display with context-aware summaries
 */
function formatToolResult(toolName: string, result: any): string {
  if (!result) {
    return `✅ ${toolName} completed (no result)`;
  }

  // GitHub-specific result formatting
  switch (toolName) {
    case 'github_search_users':
      if (result.login) {
        return `✅ Found user: @${result.login}${result.name ? ` (${result.name})` : ''}`;
      }
      return `✅ User search completed`;
    
    case 'github_get_user_repos':
      if (Array.isArray(result)) {
        const publicCount = result.filter((r: any) => !r.private).length;
        return `✅ Found ${result.length} repositories (${publicCount} public)`;
      }
      return `✅ Repositories fetched`;
    
    case 'github_get_repo_contents':
      if (Array.isArray(result)) {
        const files = result.filter((f: any) => f.type === 'file').length;
        const dirs = result.filter((f: any) => f.type === 'dir').length;
        return `✅ Found ${files} files and ${dirs} directories`;
      }
      return `✅ Contents retrieved`;
    
    case 'github_get_file_content':
      if (result.content) {
        const size = result.size || result.content.length;
        return `✅ File retrieved (${formatBytes(size)})`;
      }
      return `✅ File read successfully`;
    
    case 'github_create_or_update_file':
      if (result.commit) {
        return `✅ File ${result.commit.message?.includes('Create') ? 'created' : 'updated'} successfully`;
      }
      return `✅ File operation completed`;
    
    case 'github_create_pull_request':
      if (result.number) {
        return `✅ Pull request #${result.number} created: ${result.html_url}`;
      }
      return `✅ Pull request created`;
    
    case 'github_create_issue':
      if (result.number) {
        return `✅ Issue #${result.number} created: ${result.html_url}`;
      }
      return `✅ Issue created`;
    
    case 'github_search_code':
      if (result.total_count !== undefined) {
        return `✅ Found ${result.total_count} code matches`;
      }
      return `✅ Code search completed`;
    
    case 'github_list_branches':
      if (Array.isArray(result)) {
        return `✅ Found ${result.length} branches`;
      }
      return `✅ Branches listed`;
    
    case 'github_create_branch':
      if (result.ref) {
        return `✅ Branch created: ${result.ref.replace('refs/heads/', '')}`;
      }
      return `✅ Branch created successfully`;
    
    case 'github_fork_repository':
      if (result.full_name) {
        return `✅ Repository forked: ${result.full_name}`;
      }
      return `✅ Fork created`;
    
    case 'github_create_repository':
      if (result.html_url) {
        return `✅ Repository created: ${result.html_url}`;
      }
      return `✅ Repository created`;
  }

  // Handle string results
  if (typeof result === 'string') {
    const preview = result.length > 200 ? result.substring(0, 200) + '...' : result;
    return `✅ ${toolName} result:\n${preview}`;
  }

  // Handle object results with useful info
  if (typeof result === 'object') {
    const summary = extractSummary(result);
    return `✅ ${toolName} ${summary}`;
  }

  return `✅ ${toolName} completed`;
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format arguments for display
 */
function formatArgs(args: any): string {
  if (!args || Object.keys(args).length === 0) {
    return '';
  }

  const entries = Object.entries(args);
  if (entries.length === 1) {
    const [key, value] = entries[0];
    return ` (${key}: ${formatValue(value)})`;
  }

  const formatted = entries
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(', ');
  
  return ` (${formatted})`;
}

/**
 * Format a single value for display
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.length > 50 ? `"${value.substring(0, 50)}..."` : `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === 'object') {
    return `{${Object.keys(value).length} keys}`;
  }

  return String(value);
}

/**
 * Extract useful summary from result object
 */
function extractSummary(result: any): string {
  // Check for common result patterns
  if (result.success !== undefined) {
    return result.success ? 'succeeded' : 'failed';
  }

  if (result.count !== undefined) {
    return `returned ${result.count} items`;
  }

  if (result.matches !== undefined) {
    return `found ${result.matches} matches`;
  }

  if (result.files !== undefined) {
    const count = Array.isArray(result.files) ? result.files.length : result.files;
    return `returned ${count} files`;
  }

  if (result.content !== undefined) {
    const length = result.content.length;
    return `returned ${length} bytes`;
  }

  if (result.url !== undefined) {
    return `URL: ${result.url}`;
  }

  if (result.number !== undefined) {
    return `#${result.number}`;
  }

  // Default: show keys
  const keys = Object.keys(result);
  if (keys.length <= 3) {
    return `returned: ${keys.join(', ')}`;
  }

  return `returned ${keys.length} properties`;
}

/**
 * Extract final response from event
 */
async function extractResponse(event: any, context: string): Promise<StreamingAgentResponse> {
  console.log(`[${context}] Extracting response from final event...`);

  if (!event.content || !event.content.parts) {
    throw new Error('Final event has no content or parts');
  }

  // Look for text response (structured JSON output from agent)
  let responseText = '';
  for (const part of event.content.parts) {
    if (part.text) {
      responseText += part.text;
    }
  }

  if (!responseText) {
    throw new Error('No text response in final event');
  }

  console.log(`[${context}] Response text (${responseText.length} chars):`, responseText.substring(0, 300));

  // Try to parse as JSON
  let response: any;
  try {
    // Remove markdown code fences if present
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```')) {
      const lines = jsonStr.split('\n');
      lines.shift(); // Remove first ```json or ```
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop(); // Remove last ```
      }
      jsonStr = lines.join('\n');
    }

    response = JSON.parse(jsonStr);
    console.log(`[${context}] Successfully parsed response as JSON`);
  } catch (parseError: any) {
    console.error(`[${context}] JSON parse failed:`, parseError.message);
    console.error(`[${context}] First 500 chars:`, responseText.substring(0, 500));
    throw new Error(`Invalid JSON response: ${parseError.message}`);
  }

  // Validate it's an object
  if (!response || typeof response !== 'object') {
    throw new Error(`Response is not an object (type: ${typeof response})`);
  }

  // Ensure summary exists
  if (!response.summary || typeof response.summary !== 'string') {
    console.error(`[${context}] Response keys:`, Object.keys(response));
    throw new Error('Response missing required "summary" property');
  }

  return response;
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
