/**
 * GitHub Agent Memory Tool
 * Ported from gemini-cli - allows agent to save/load context for long-running sessions
 * 
 * Stores memories in markdown files with structured sections:
 * - Project Context (repo info, structure, key files)
 * - Investigation Notes (findings, patterns discovered)
 * - Decisions Made (architectural choices, approaches taken)
 * - Things to Remember (user preferences, special requirements)
 */

import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

/**
 * Memory file structure
 */
export const MEMORY_FILE_NAME = 'GITHUB_AGENT_MEMORY.md';
export const MEMORY_SECTION_HEADERS = {
  PROJECT_CONTEXT: '## Project Context',
  INVESTIGATION_NOTES: '## Investigation Notes',
  DECISIONS_MADE: '## Decisions Made',
  THINGS_TO_REMEMBER: '## Things to Remember',
  CODEBASE_INSIGHTS: '## Codebase Insights',
};

/**
 * Memory entry types
 */
export type MemorySectionType = 
  | 'project_context'
  | 'investigation_notes'
  | 'decisions_made'
  | 'things_to_remember'
  | 'codebase_insights';

/**
 * Parameters for saving memory
 */
export interface SaveMemoryParams {
  repoOwner: string;
  repoName: string;
  section: MemorySectionType;
  content: string;
  timestamp?: boolean; // Whether to add timestamp to entry
}

/**
 * Parameters for loading memory
 */
export interface LoadMemoryParams {
  repoOwner: string;
  repoName: string;
  section?: MemorySectionType; // Optional: load specific section
}

/**
 * Memory structure
 */
export interface MemoryData {
  projectContext: string[];
  investigationNotes: string[];
  decisionsMade: string[];
  thingsToRemember: string[];
  codebaseInsights: string[];
}

/**
 * Get memory file path for a repository
 */
function getMemoryFilePath(repoOwner: string, repoName: string): string {
  // Store in backend/memory directory
  const memoryDir = path.join(process.cwd(), 'memory', repoOwner);
  const fileName = `${repoName}_${MEMORY_FILE_NAME}`;
  return path.join(memoryDir, fileName);
}

/**
 * Ensure memory directory exists
 */
async function ensureMemoryDir(repoOwner: string): Promise<void> {
  const memoryDir = path.join(process.cwd(), 'memory', repoOwner);
  if (!existsSync(memoryDir)) {
    await fs.mkdir(memoryDir, { recursive: true });
  }
}

/**
 * Map section type to header
 */
function getSectionHeader(section: MemorySectionType): string {
  switch (section) {
    case 'project_context':
      return MEMORY_SECTION_HEADERS.PROJECT_CONTEXT;
    case 'investigation_notes':
      return MEMORY_SECTION_HEADERS.INVESTIGATION_NOTES;
    case 'decisions_made':
      return MEMORY_SECTION_HEADERS.DECISIONS_MADE;
    case 'things_to_remember':
      return MEMORY_SECTION_HEADERS.THINGS_TO_REMEMBER;
    case 'codebase_insights':
      return MEMORY_SECTION_HEADERS.CODEBASE_INSIGHTS;
    default:
      return MEMORY_SECTION_HEADERS.THINGS_TO_REMEMBER;
  }
}

/**
 * Ensure proper newline separation
 */
function ensureNewlineSeparation(currentContent: string): string {
  if (currentContent.length === 0) return '';
  if (currentContent.endsWith('\n\n')) return '';
  if (currentContent.endsWith('\n')) return '\n';
  return '\n\n';
}

/**
 * Read existing memory file content
 */
async function readMemoryFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return ''; // File doesn't exist yet
    }
    throw err;
  }
}

/**
 * Initialize memory file with headers
 */
function initializeMemoryFile(repoOwner: string, repoName: string): string {
  return `# GitHub Agent Memory: ${repoOwner}/${repoName}

> This file stores context and insights discovered by the GitHub Agent
> Last updated: ${new Date().toISOString()}

${MEMORY_SECTION_HEADERS.PROJECT_CONTEXT}

${MEMORY_SECTION_HEADERS.INVESTIGATION_NOTES}

${MEMORY_SECTION_HEADERS.DECISIONS_MADE}

${MEMORY_SECTION_HEADERS.THINGS_TO_REMEMBER}

${MEMORY_SECTION_HEADERS.CODEBASE_INSIGHTS}

`;
}

/**
 * Add entry to specific section
 */
function addEntryToSection(
  currentContent: string,
  sectionHeader: string,
  entry: string,
  timestamp: boolean
): string {
  // Prepare entry
  let processedEntry = entry.trim();
  processedEntry = processedEntry.replace(/^(-+\s*)+/, '').trim(); // Remove leading dashes
  
  if (timestamp) {
    const now = new Date().toISOString();
    processedEntry = `- [${now}] ${processedEntry}`;
  } else {
    processedEntry = `- ${processedEntry}`;
  }

  const headerIndex = currentContent.indexOf(sectionHeader);

  if (headerIndex === -1) {
    // Header not found - shouldn't happen if properly initialized
    const separator = ensureNewlineSeparation(currentContent);
    return `${currentContent}${separator}${sectionHeader}\n${processedEntry}\n`;
  }

  // Find where section ends (next ## or end of file)
  const startOfSectionContent = headerIndex + sectionHeader.length;
  let endOfSectionIndex = currentContent.indexOf('\n## ', startOfSectionContent);
  if (endOfSectionIndex === -1) {
    endOfSectionIndex = currentContent.length;
  }

  const beforeSection = currentContent.substring(0, startOfSectionContent).trimEnd();
  let sectionContent = currentContent.substring(startOfSectionContent, endOfSectionIndex).trimEnd();
  const afterSection = currentContent.substring(endOfSectionIndex);

  // Add entry to section
  sectionContent += `\n${processedEntry}`;

  return `${beforeSection}\n${sectionContent.trimStart()}\n${afterSection}`.trimEnd() + '\n';
}

/**
 * Parse memory file into structured data
 */
function parseMemoryFile(content: string): MemoryData {
  const data: MemoryData = {
    projectContext: [],
    investigationNotes: [],
    decisionsMade: [],
    thingsToRemember: [],
    codebaseInsights: [],
  };

  if (!content) return data;

  // Extract each section
  const sections = [
    { header: MEMORY_SECTION_HEADERS.PROJECT_CONTEXT, key: 'projectContext' as const },
    { header: MEMORY_SECTION_HEADERS.INVESTIGATION_NOTES, key: 'investigationNotes' as const },
    { header: MEMORY_SECTION_HEADERS.DECISIONS_MADE, key: 'decisionsMade' as const },
    { header: MEMORY_SECTION_HEADERS.THINGS_TO_REMEMBER, key: 'thingsToRemember' as const },
    { header: MEMORY_SECTION_HEADERS.CODEBASE_INSIGHTS, key: 'codebaseInsights' as const },
  ];

  for (const section of sections) {
    const startIdx = content.indexOf(section.header);
    if (startIdx === -1) continue;

    const contentStart = startIdx + section.header.length;
    let endIdx = content.indexOf('\n## ', contentStart);
    if (endIdx === -1) endIdx = content.length;

    const sectionContent = content.substring(contentStart, endIdx);
    
    // Extract list items
    const lines = sectionContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ')) {
        data[section.key].push(trimmed.substring(2));
      }
    }
  }

  return data;
}

/**
 * Save memory entry
 */
export async function saveMemory(params: SaveMemoryParams): Promise<{
  success: boolean;
  message: string;
  filePath?: string;
  error?: string;
}> {
  try {
    await ensureMemoryDir(params.repoOwner);
    const filePath = getMemoryFilePath(params.repoOwner, params.repoName);
    
    let currentContent = await readMemoryFile(filePath);
    
    // Initialize if empty
    if (!currentContent) {
      currentContent = initializeMemoryFile(params.repoOwner, params.repoName);
    }

    // Add entry to appropriate section
    const sectionHeader = getSectionHeader(params.section);
    const newContent = addEntryToSection(
      currentContent,
      sectionHeader,
      params.content,
      params.timestamp !== false // Default to true
    );

    // Write to file
    await fs.writeFile(filePath, newContent, 'utf-8');

    return {
      success: true,
      message: `✅ Memory saved to ${params.section} section`,
      filePath,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Failed to save memory: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Load memory
 */
export async function loadMemory(params: LoadMemoryParams): Promise<{
  success: boolean;
  memory?: MemoryData | string[];
  message: string;
  error?: string;
}> {
  try {
    const filePath = getMemoryFilePath(params.repoOwner, params.repoName);
    const content = await readMemoryFile(filePath);

    if (!content) {
      return {
        success: true,
        memory: {
          projectContext: [],
          investigationNotes: [],
          decisionsMade: [],
          thingsToRemember: [],
          codebaseInsights: [],
        },
        message: '📭 No memory found for this repository',
      };
    }

    const parsedMemory = parseMemoryFile(content);

    // If specific section requested, return only that
    if (params.section) {
      const sectionMap = {
        project_context: parsedMemory.projectContext,
        investigation_notes: parsedMemory.investigationNotes,
        decisions_made: parsedMemory.decisionsMade,
        things_to_remember: parsedMemory.thingsToRemember,
        codebase_insights: parsedMemory.codebaseInsights,
      };
      
      const sectionData = sectionMap[params.section];
      return {
        success: true,
        memory: sectionData,
        message: `✅ Loaded ${sectionData.length} entries from ${params.section}`,
      };
    }

    // Return all sections
    const totalEntries = Object.values(parsedMemory).reduce((sum, arr) => sum + arr.length, 0);
    return {
      success: true,
      memory: parsedMemory,
      message: `✅ Loaded ${totalEntries} total memory entries`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Failed to load memory: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Clear memory for a repository
 */
export async function clearMemory(repoOwner: string, repoName: string): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  try {
    const filePath = getMemoryFilePath(repoOwner, repoName);
    
    if (existsSync(filePath)) {
      await fs.unlink(filePath);
      return {
        success: true,
        message: `✅ Memory cleared for ${repoOwner}/${repoName}`,
      };
    } else {
      return {
        success: true,
        message: `📭 No memory file found for ${repoOwner}/${repoName}`,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: `❌ Failed to clear memory: ${error.message}`,
      error: error.message,
    };
  }
}

/**
 * Format memory for display
 */
export function formatMemoryForDisplay(memory: MemoryData): string {
  let output = '# 🧠 GitHub Agent Memory\n\n';

  const sections = [
    { title: 'Project Context', data: memory.projectContext },
    { title: 'Investigation Notes', data: memory.investigationNotes },
    { title: 'Decisions Made', data: memory.decisionsMade },
    { title: 'Things to Remember', data: memory.thingsToRemember },
    { title: 'Codebase Insights', data: memory.codebaseInsights },
  ];

  for (const section of sections) {
    if (section.data.length > 0) {
      output += `## ${section.title}\n\n`;
      for (const entry of section.data) {
        output += `- ${entry}\n`;
      }
      output += '\n';
    }
  }

  return output.trim();
}

/**
 * Create ADK tools for memory management
 */
export function createMemoryTools() {
  return [
    {
      name: 'bot_github_save_memory',
      description: `💾 SAVE MEMORY: Store important context for future reference

**WHAT TO SAVE:**
- 📁 **Project Context**: Repo structure, architecture, key files
- 🔍 **Investigation Notes**: Findings, patterns, root causes
- ✅ **Decisions Made**: Approaches chosen, alternatives considered
- 💡 **Things to Remember**: User preferences, special requirements
- 🧩 **Codebase Insights**: Complex logic explained, gotchas discovered

**WHEN TO USE:**
- After analyzing a complex codebase
- When discovering important patterns
- After making architectural decisions
- When user shares preferences/requirements
- When finding non-obvious code behavior

**BENEFITS:**
- ✅ Context persists across sessions
- ✅ Avoid re-analyzing same code
- ✅ Remember user preferences
- ✅ Build knowledge over time

**EXAMPLE ENTRIES:**
- "Main entry point: src/index.ts exports App component"
- "Database uses Supabase with RLS policies enabled"
- "User prefers TypeScript strict mode and functional style"
- "Auth flow: JWT stored in httpOnly cookie, refreshed on /api/refresh"`,
      parameters: {
        type: 'object',
        properties: {
          repoOwner: {
            type: 'string',
            description: 'Repository owner',
          },
          repoName: {
            type: 'string',
            description: 'Repository name',
          },
          section: {
            type: 'string',
            enum: [
              'project_context',
              'investigation_notes',
              'decisions_made',
              'things_to_remember',
              'codebase_insights',
            ],
            description: 'Memory section to save to',
          },
          content: {
            type: 'string',
            description: 'What to remember (clear, concise statement)',
          },
          timestamp: {
            type: 'boolean',
            description: 'Add timestamp to entry (default: true)',
          },
        },
        required: ['repoOwner', 'repoName', 'section', 'content'],
      },
    },
    {
      name: 'bot_github_load_memory',
      description: `📖 LOAD MEMORY: Retrieve saved context and insights

**USE CASES:**
- Resume work on a repository
- Recall previous findings
- Check past decisions
- Load user preferences
- Review codebase insights

**RETURNS:**
All saved memories organized by section, or specific section if requested.

**TIP:** Always load memory at the start of complex tasks to avoid redundant work!`,
      parameters: {
        type: 'object',
        properties: {
          repoOwner: {
            type: 'string',
            description: 'Repository owner',
          },
          repoName: {
            type: 'string',
            description: 'Repository name',
          },
          section: {
            type: 'string',
            enum: [
              'project_context',
              'investigation_notes',
              'decisions_made',
              'things_to_remember',
              'codebase_insights',
            ],
            description: 'Optional: load specific section only',
          },
        },
        required: ['repoOwner', 'repoName'],
      },
    },
    {
      name: 'bot_github_clear_memory',
      description: `🗑️ CLEAR MEMORY: Delete all saved context for a repository

Use when:
- Repository has been restructured
- Starting fresh analysis
- Memory is outdated/incorrect

**WARNING:** This action cannot be undone!`,
      parameters: {
        type: 'object',
        properties: {
          repoOwner: {
            type: 'string',
            description: 'Repository owner',
          },
          repoName: {
            type: 'string',
            description: 'Repository name',
          },
        },
        required: ['repoOwner', 'repoName'],
      },
    },
  ];
}
