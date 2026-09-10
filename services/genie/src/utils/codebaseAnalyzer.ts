/**
 * Codebase Analyzer - Advanced code analysis tools for GitHub Agent
 * 
 * Provides comprehensive codebase understanding capabilities:
 * - Project structure analysis
 * - Dependency graph mapping
 * - Code pattern detection
 * - AST parsing and analysis
 * - Cross-file reference tracking
 */

import { Octokit } from '@octokit/rest';
import * as path from 'path';

interface FileNode {
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  language?: string;
}

interface ProjectStructure {
  rootFiles: string[];
  directories: Map<string, string[]>;
  filesByLanguage: Map<string, string[]>;
  configFiles: string[];
  testFiles: string[];
  buildFiles: string[];
  documentationFiles: string[];
}

interface CodebaseAnalysis {
  structure: ProjectStructure;
  languages: Map<string, number>; // language -> file count
  frameworks: string[];
  buildTools: string[];
  testFrameworks: string[];
  entryPoints: string[];
  keyFiles: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  estimatedLines: number;
  fileCount: number;
}

export class CodebaseAnalyzer {
  private octokit: Octokit;
  private cache: Map<string, any> = new Map();

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Analyze entire codebase structure and provide comprehensive insights
   */
  async analyzeCodebase(
    owner: string,
    repo: string,
    branch?: string
  ): Promise<CodebaseAnalysis> {
    try {
      // If no branch specified, get default branch
      if (!branch) {
        const { data: repoInfo } = await this.octokit.repos.get({
          owner,
          repo,
        });
        branch = repoInfo.default_branch;
        console.log(`[CodebaseAnalyzer] Using default branch: ${branch}`);
      }

      const cacheKey = `${owner}/${repo}/${branch}`;
      
      // Check cache
      if (this.cache.has(cacheKey)) {
        console.log(`[CodebaseAnalyzer] Using cached analysis for ${owner}/${repo}/${branch}`);
        return this.cache.get(cacheKey);
      }

      console.log(`[CodebaseAnalyzer] Analyzing ${owner}/${repo} on branch ${branch}`);

      // Get repository tree
      const { data: branchData } = await this.octokit.repos.getBranch({
        owner,
        repo,
        branch,
      });

      const treeSha = branchData.commit.sha;

      const { data: treeData } = await this.octokit.git.getTree({
        owner,
        repo,
        tree_sha: treeSha,
        recursive: 'true',
      });

      // Parse tree
      const files: FileNode[] = treeData.tree
        .filter((item: any) => item.type === 'blob')
        .map((item: any) => ({
          path: item.path,
          type: 'file' as const,
          size: item.size,
          extension: path.extname(item.path).toLowerCase(),
          language: this.detectLanguage(item.path),
        }));

      // Build project structure
      const structure = this.buildProjectStructure(files);
      
      // Detect languages
      const languages = this.detectLanguages(files);
      
      // Detect frameworks and tools
      const frameworks = this.detectFrameworks(structure);
      const buildTools = this.detectBuildTools(structure);
      const testFrameworks = this.detectTestFrameworks(structure);
      
      // Identify entry points and key files
      const entryPoints = this.identifyEntryPoints(files, structure);
      const keyFiles = this.identifyKeyFiles(files, structure);
      
      // Calculate complexity
      const complexity = this.calculateComplexity(files, structure);
      
      // Estimate lines of code
      const estimatedLines = this.estimateLines(files);

      const analysis: CodebaseAnalysis = {
        structure,
        languages,
        frameworks,
        buildTools,
        testFrameworks,
        entryPoints,
        keyFiles,
        complexity,
        estimatedLines,
        fileCount: files.length,
      };

      // Cache results
      this.cache.set(cacheKey, analysis);

      return analysis;
    } catch (error: any) {
      console.error('[CodebaseAnalyzer] Error:', error.message);
      throw error;
    }
  }

  /**
   * Analyze specific files for detailed understanding
   */
  async analyzeFiles(
    owner: string,
    repo: string,
    filePaths: string[],
    branch?: string
  ): Promise<{
    files: Array<{
      path: string;
      content: string;
      language: string;
      lines: number;
      imports: string[];
      exports: string[];
      functions: string[];
      classes: string[];
      complexity: number;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      type: 'import' | 'require' | 'include';
    }>;
  }> {
    const results = [];
    const relationships: Array<{ from: string; to: string; type: 'import' | 'require' | 'include' }> = [];

    for (const filePath of filePaths) {
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: branch,
        });

        if ('content' in data) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          const language = this.detectLanguage(filePath);
          
          // Parse file
          const parsed = this.parseFile(content, language);
          
          results.push({
            path: filePath,
            content,
            language,
            lines: content.split('\n').length,
            ...parsed,
          });

          // Track relationships
          for (const imp of parsed.imports) {
            relationships.push({
              from: filePath,
              to: imp,
              type: this.detectImportType(content, language),
            });
          }
        }
      } catch (error: any) {
        console.error(`[CodebaseAnalyzer] Failed to analyze ${filePath}:`, error.message);
      }
    }

    return { files: results, relationships };
  }

  /**
   * Find files related to a specific issue or feature
   */
  async findRelatedFiles(
    owner: string,
    repo: string,
    keywords: string[],
    issueContext?: string
  ): Promise<string[]> {
    try {
      const relatedFiles = new Set<string>();

      // Search code for keywords
      for (const keyword of keywords) {
        const { data } = await this.octokit.search.code({
          q: `${keyword} repo:${owner}/${repo}`,
          per_page: 20,
        });

        for (const item of data.items) {
          relatedFiles.add(item.path);
        }
      }

      // If we have issue context, do semantic search
      if (issueContext) {
        // Extract potential file names/paths from issue
        const filePatterns = this.extractFilePatterns(issueContext);
        for (const pattern of filePatterns) {
          relatedFiles.add(pattern);
        }
      }

      return Array.from(relatedFiles);
    } catch (error: any) {
      console.error('[CodebaseAnalyzer] Error finding related files:', error.message);
      return [];
    }
  }

  /**
   * Analyze dependencies and imports
   */
  async analyzeDependencies(
    owner: string,
    repo: string,
    branch?: string
  ): Promise<{
    packageManagers: string[];
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    peerDependencies: Record<string, string>;
  }> {
    const result: any = {
      packageManagers: [],
      dependencies: {},
      devDependencies: {},
      peerDependencies: {},
    };

    try {
      // Check for package.json (npm/yarn/pnpm)
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path: 'package.json',
          ref: branch,
        });

        if ('content' in data) {
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          const pkg = JSON.parse(content);
          
          result.packageManagers.push('npm');
          result.dependencies = pkg.dependencies || {};
          result.devDependencies = pkg.devDependencies || {};
          result.peerDependencies = pkg.peerDependencies || {};
        }
      } catch {}

      // Check for requirements.txt (Python pip)
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path: 'requirements.txt',
          ref: branch,
        });

        if ('content' in data) {
          result.packageManagers.push('pip');
          const content = Buffer.from(data.content, 'base64').toString('utf-8');
          const deps = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
          result.dependencies = Object.fromEntries(
            deps.map(dep => {
              const [name, version] = dep.split(/[=><]/);
              return [name.trim(), version?.trim() || '*'];
            })
          );
        }
      } catch {}

      // Check for Gemfile (Ruby bundler)
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path: 'Gemfile',
          ref: branch,
        });

        if ('content' in data) {
          result.packageManagers.push('bundler');
        }
      } catch {}

      // Check for go.mod (Go modules)
      try {
        const { data } = await this.octokit.repos.getContent({
          owner,
          repo,
          path: 'go.mod',
          ref: branch,
        });

        if ('content' in data) {
          result.packageManagers.push('go-modules');
        }
      } catch {}

      return result;
    } catch (error: any) {
      console.error('[CodebaseAnalyzer] Error analyzing dependencies:', error.message);
      return result;
    }
  }

  /**
   * Generate a summary report for the AI agent
   */
  generateAnalysisReport(analysis: CodebaseAnalysis): string {
    const { structure, languages, frameworks, buildTools, testFrameworks, complexity, fileCount, estimatedLines } = analysis;

    const languageList = Array.from(languages.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([lang, count]) => `${lang} (${count} files)`)
      .join(', ');

    return `
# Codebase Analysis Report

## 📊 Project Overview
- **Complexity**: ${complexity.toUpperCase()}
- **Total Files**: ${fileCount}
- **Estimated Lines**: ~${estimatedLines.toLocaleString()}
- **Primary Languages**: ${languageList}

## 🏗️ Architecture
- **Frameworks**: ${frameworks.length > 0 ? frameworks.join(', ') : 'None detected'}
- **Build Tools**: ${buildTools.length > 0 ? buildTools.join(', ') : 'None detected'}
- **Test Frameworks**: ${testFrameworks.length > 0 ? testFrameworks.join(', ') : 'None detected'}

## 📁 Project Structure
- **Root Files**: ${structure.rootFiles.join(', ')}
- **Config Files**: ${structure.configFiles.join(', ')}
- **Test Files**: ${structure.testFiles.length} test files found
- **Documentation**: ${structure.documentationFiles.join(', ')}

## 🎯 Entry Points
${analysis.entryPoints.map(ep => `- ${ep}`).join('\n')}

## 🔑 Key Files to Review
${analysis.keyFiles.slice(0, 10).map(kf => `- ${kf}`).join('\n')}

## 💡 Recommendations for Issue Analysis
${this.generateRecommendations(analysis)}
`.trim();
  }

  // === Private Helper Methods ===

  private buildProjectStructure(files: FileNode[]): ProjectStructure {
    const structure: ProjectStructure = {
      rootFiles: [],
      directories: new Map(),
      filesByLanguage: new Map(),
      configFiles: [],
      testFiles: [],
      buildFiles: [],
      documentationFiles: [],
    };

    for (const file of files) {
      const dir = path.dirname(file.path);
      
      // Root files
      if (dir === '.') {
        structure.rootFiles.push(file.path);
      }

      // Group by directory
      if (!structure.directories.has(dir)) {
        structure.directories.set(dir, []);
      }
      structure.directories.get(dir)!.push(file.path);

      // Group by language
      if (file.language) {
        if (!structure.filesByLanguage.has(file.language)) {
          structure.filesByLanguage.set(file.language, []);
        }
        structure.filesByLanguage.get(file.language)!.push(file.path);
      }

      // Categorize files
      const filename = path.basename(file.path).toLowerCase();
      
      if (this.isConfigFile(filename)) {
        structure.configFiles.push(file.path);
      }
      
      if (this.isTestFile(file.path)) {
        structure.testFiles.push(file.path);
      }
      
      if (this.isBuildFile(filename)) {
        structure.buildFiles.push(file.path);
      }
      
      if (this.isDocumentationFile(filename)) {
        structure.documentationFiles.push(file.path);
      }
    }

    return structure;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.py': 'Python',
      '.java': 'Java',
      '.go': 'Go',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.rs': 'Rust',
      '.c': 'C',
      '.cpp': 'C++',
      '.cs': 'C#',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.dart': 'Dart',
      '.vue': 'Vue',
      '.svelte': 'Svelte',
    };
    return languageMap[ext] || 'Other';
  }

  private detectLanguages(files: FileNode[]): Map<string, number> {
    const languages = new Map<string, number>();
    
    for (const file of files) {
      if (file.language) {
        languages.set(file.language, (languages.get(file.language) || 0) + 1);
      }
    }
    
    return languages;
  }

  private detectFrameworks(structure: ProjectStructure): string[] {
    const frameworks: string[] = [];
    const rootFiles = structure.rootFiles;

    // JavaScript/TypeScript frameworks
    if (rootFiles.includes('next.config.js') || rootFiles.includes('next.config.ts')) {
      frameworks.push('Next.js');
    }
    if (rootFiles.includes('nuxt.config.js') || rootFiles.includes('nuxt.config.ts')) {
      frameworks.push('Nuxt.js');
    }
    if (rootFiles.includes('vite.config.js') || rootFiles.includes('vite.config.ts')) {
      frameworks.push('Vite');
    }
    if (rootFiles.includes('angular.json')) {
      frameworks.push('Angular');
    }
    if (structure.filesByLanguage.get('Vue')?.length) {
      frameworks.push('Vue.js');
    }

    // Python frameworks
    if (structure.directories.has('django')) {
      frameworks.push('Django');
    }
    if (structure.directories.has('flask')) {
      frameworks.push('Flask');
    }
    if (rootFiles.includes('fastapi')) {
      frameworks.push('FastAPI');
    }

    // Other frameworks
    if (rootFiles.includes('Gemfile')) {
      frameworks.push('Ruby on Rails');
    }

    return frameworks;
  }

  private detectBuildTools(structure: ProjectStructure): string[] {
    const tools: string[] = [];
    const rootFiles = structure.rootFiles;

    if (rootFiles.includes('package.json')) tools.push('npm');
    if (rootFiles.includes('yarn.lock')) tools.push('yarn');
    if (rootFiles.includes('pnpm-lock.yaml')) tools.push('pnpm');
    if (rootFiles.includes('webpack.config.js')) tools.push('webpack');
    if (rootFiles.includes('rollup.config.js')) tools.push('rollup');
    if (rootFiles.includes('Makefile')) tools.push('make');
    if (rootFiles.includes('CMakeLists.txt')) tools.push('cmake');
    if (rootFiles.includes('build.gradle')) tools.push('gradle');
    if (rootFiles.includes('pom.xml')) tools.push('maven');
    if (rootFiles.includes('Cargo.toml')) tools.push('cargo');

    return tools;
  }

  private detectTestFrameworks(structure: ProjectStructure): string[] {
    const frameworks: string[] = [];
    const allFiles = Array.from(structure.directories.values()).flat();

    const hasFiles = (patterns: string[]) =>
      allFiles.some(file => patterns.some(p => file.includes(p)));

    if (hasFiles(['jest.config', '.spec.', '.test.'])) frameworks.push('Jest');
    if (hasFiles(['vitest.config', '.vitest.'])) frameworks.push('Vitest');
    if (hasFiles(['mocha', '.spec.', '.test.'])) frameworks.push('Mocha');
    if (hasFiles(['pytest', 'test_'])) frameworks.push('pytest');
    if (hasFiles(['phpunit'])) frameworks.push('PHPUnit');
    if (hasFiles(['rspec'])) frameworks.push('RSpec');

    return frameworks;
  }

  private identifyEntryPoints(files: FileNode[], _structure: ProjectStructure): string[] {
    const entryPoints: string[] = [];

    // Common entry point patterns
    const patterns = [
      'index.js', 'index.ts', 'index.jsx', 'index.tsx',
      'main.js', 'main.ts', 'main.py',
      'app.js', 'app.ts', 'app.py',
      'server.js', 'server.ts',
      '__init__.py',
      'Main.java',
    ];

    for (const file of files) {
      const basename = path.basename(file.path);
      if (patterns.includes(basename)) {
        entryPoints.push(file.path);
      }
    }

    return entryPoints;
  }

  private identifyKeyFiles(files: FileNode[], structure: ProjectStructure): string[] {
    const keyFiles: string[] = [];

    // Configuration files are key
    keyFiles.push(...structure.configFiles);

    // Main source directories
    const mainDirs = ['src/', 'lib/', 'app/', 'core/'];
    for (const file of files) {
      if (mainDirs.some(dir => file.path.startsWith(dir))) {
        keyFiles.push(file.path);
      }
    }

    return keyFiles;
  }

  private calculateComplexity(files: FileNode[], structure: ProjectStructure): 'simple' | 'moderate' | 'complex' | 'very-complex' {
    const fileCount = files.length;
    const dirCount = structure.directories.size;
    const languageCount = structure.filesByLanguage.size;

    if (fileCount < 20 && dirCount < 5 && languageCount <= 1) return 'simple';
    if (fileCount < 100 && dirCount < 15 && languageCount <= 2) return 'moderate';
    if (fileCount < 500 && dirCount < 50 && languageCount <= 3) return 'complex';
    return 'very-complex';
  }

  private estimateLines(files: FileNode[]): number {
    // Rough estimate: average 100 lines per file
    return files.length * 100;
  }

  private isConfigFile(filename: string): boolean {
    const configPatterns = [
      'config', '.config', '.json', '.yaml', '.yml', '.toml',
      '.env', '.eslint', '.prettier', 'tsconfig', 'webpack', 'babel',
    ];
    return configPatterns.some(p => filename.includes(p));
  }

  private isTestFile(filePath: string): boolean {
    const testPatterns = [
      '.test.', '.spec.', '__tests__', '/tests/', '/test/',
      'test_', '_test.', '.test/', '/spec/',
    ];
    return testPatterns.some(p => filePath.includes(p));
  }

  private isBuildFile(filename: string): boolean {
    const buildPatterns = [
      'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      'Makefile', 'CMakeLists.txt', 'build.gradle', 'pom.xml', 'Cargo.toml',
    ];
    return buildPatterns.includes(filename);
  }

  private isDocumentationFile(filename: string): boolean {
    const docPatterns = ['readme', '.md', 'changelog', 'contributing', 'license'];
    return docPatterns.some(p => filename.toLowerCase().includes(p));
  }

  private parseFile(content: string, language: string): {
    imports: string[];
    exports: string[];
    functions: string[];
    classes: string[];
    complexity: number;
  } {
    const result = {
      imports: [] as string[],
      exports: [] as string[],
      functions: [] as string[],
      classes: [] as string[],
      complexity: 0,
    };

    // Simple regex-based parsing (can be enhanced with proper AST parsing)
    const lines = content.split('\n');

    for (const line of lines) {
      // Imports
      if (language === 'JavaScript' || language === 'TypeScript') {
        const importMatch = line.match(/import\s+.*\s+from\s+['"](.+)['"]/);
        if (importMatch) result.imports.push(importMatch[1]);

        const requireMatch = line.match(/require\(['"](.+)['"]\)/);
        if (requireMatch) result.imports.push(requireMatch[1]);

        // Exports
        if (line.includes('export ')) result.exports.push(line.trim());

        // Functions
        const funcMatch = line.match(/(?:function|const|let|var)\s+(\w+)\s*[=\(]/);
        if (funcMatch) result.functions.push(funcMatch[1]);

        // Classes
        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) result.classes.push(classMatch[1]);
      } else if (language === 'Python') {
        const importMatch = line.match(/(?:import|from)\s+(\w+)/);
        if (importMatch) result.imports.push(importMatch[1]);

        const defMatch = line.match(/def\s+(\w+)/);
        if (defMatch) result.functions.push(defMatch[1]);

        const classMatch = line.match(/class\s+(\w+)/);
        if (classMatch) result.classes.push(classMatch[1]);
      }

      // Complexity indicators
      if (line.includes('if ') || line.includes('for ') || line.includes('while ')) {
        result.complexity++;
      }
    }

    return result;
  }

  private detectImportType(content: string, language: string): 'import' | 'require' | 'include' {
    if (language === 'JavaScript' || language === 'TypeScript') {
      if (content.includes('import ')) return 'import';
      if (content.includes('require(')) return 'require';
    }
    return 'import';
  }

  private extractFilePatterns(text: string): string[] {
    const patterns: string[] = [];
    
    // Extract file paths mentioned in text
    const filePathRegex = /(?:src\/|lib\/|app\/)?[\w\-]+(?:\/[\w\-]+)*\.[\w]+/g;
    const matches = text.match(filePathRegex);
    
    if (matches) {
      patterns.push(...matches);
    }

    return patterns;
  }

  private generateRecommendations(analysis: CodebaseAnalysis): string {
    const { complexity } = analysis;

    if (complexity === 'very-complex') {
      return `
1. ⚠️ **Large Codebase Detected** - Focus on specific modules first
2. 🔍 Use keyword search to narrow down affected files
3. 📊 Review architecture to understand component interactions
4. 🎯 Start with entry points and work backwards
5. 💾 Cache frequently accessed files to reduce API calls
      `.trim();
    } else if (complexity === 'complex') {
      return `
1. 📁 Review project structure to identify affected areas
2. 🔗 Trace dependencies between related files
3. ✅ Check test files for usage examples
4. 📝 Review documentation for context
      `.trim();
    } else {
      return `
1. ✅ Manageable codebase - full analysis possible
2. 📖 Start with entry points and key files
3. 🔍 Search for keywords related to the issue
      `.trim();
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

export default CodebaseAnalyzer;
