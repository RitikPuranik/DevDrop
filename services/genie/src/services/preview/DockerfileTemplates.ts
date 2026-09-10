/**
 * Dockerfile templates for different programming languages
 */

export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'unknown';

/**
 * Detect primary programming language from files
 */
export function detectLanguageFromFiles(files: Array<{ path: string; content: string }>): SupportedLanguage {
  const extensionCounts: Record<string, number> = {};
  
  // Count file extensions
  files.forEach(file => {
    const ext = file.path.split('.').pop()?.toLowerCase() || '';
    extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
  });

  // Check for specific configuration files that indicate language
  const hasPackageJson = files.some(f => f.path === 'package.json' || f.path.endsWith('/package.json'));
  const hasRequirementsTxt = files.some(f => f.path === 'requirements.txt' || f.path.endsWith('/requirements.txt'));
  const hasPyprojectToml = files.some(f => f.path === 'pyproject.toml' || f.path.endsWith('/pyproject.toml'));
  
  // Python indicators
  const pythonFileCount = (extensionCounts['py'] || 0);
  
  // TypeScript/JavaScript indicators
  const tsFileCount = (extensionCounts['ts'] || 0) + (extensionCounts['tsx'] || 0);
  const jsFileCount = (extensionCounts['js'] || 0) + (extensionCounts['jsx'] || 0);
  const nodeFileCount = tsFileCount + jsFileCount;

  // Decision logic
  if (hasPyprojectToml || hasRequirementsTxt || (pythonFileCount > 0 && !hasPackageJson)) {
    console.log(`Detected Python project (${pythonFileCount} .py files)`);
    return 'python';
  }
  
  if (hasPackageJson || nodeFileCount > 0) {
    if (tsFileCount > jsFileCount) {
      console.log(`Detected TypeScript project (${tsFileCount} .ts files)`);
      return 'typescript';
    }
    console.log(`Detected JavaScript project (${jsFileCount} .js files)`);
    return 'javascript';
  }

  // Fallback: check which has more files
  if (pythonFileCount > nodeFileCount) {
    console.log(`Detected Python project by file count (${pythonFileCount} .py files)`);
    return 'python';
  } else if (nodeFileCount > 0) {
    console.log(`Detected JavaScript/TypeScript project by file count (${nodeFileCount} files)`);
    return tsFileCount > jsFileCount ? 'typescript' : 'javascript';
  }

  console.warn('Could not detect language from files, defaulting to TypeScript');
  return 'unknown';
}

/**
 * Create Dockerfile for Node.js/TypeScript/JavaScript projects
 */
export function createNodeDockerfile(isStaticSite: boolean = false): string {
  // For static HTML sites, serve directly with nginx
  if (isStaticSite) {
    return `FROM nginx:1.21-alpine

# Copy all files to nginx html directory
COPY . /usr/share/nginx/html/

# Debug: List files to verify copy
RUN echo "=== Files copied to nginx html directory ===" && \\
    ls -la /usr/share/nginx/html/ && \\
    echo "=== Contents of assets/ if exists ===" && \\
    (ls -la /usr/share/nginx/html/assets/ 2>/dev/null || echo "No assets folder found") && \\
    echo "=== Checking index.html ===" && \\
    (cat /usr/share/nginx/html/index.html | head -n 5 || echo "No index.html found")

# Create nginx MIME types configuration first
RUN printf 'types {\\n\\
    text/html                             html htm shtml;\\n\\
    text/css                              css;\\n\\
    text/xml                              xml;\\n\\
    application/javascript                js;\\n\\
    application/json                      json;\\n\\
    image/gif                             gif;\\n\\
    image/jpeg                            jpeg jpg;\\n\\
    image/png                             png;\\n\\
    image/svg+xml                         svg svgz;\\n\\
    image/webp                            webp;\\n\\
    font/woff                             woff;\\n\\
    font/woff2                            woff2;\\n\\
    font/ttf                              ttf;\\n\\
    font/otf                              otf;\\n\\
}' > /etc/nginx/mime.types

# Create nginx config using printf to avoid heredoc issues
RUN printf 'server {\\n\\
    listen 80;\\n\\
    server_name _;\\n\\
    root /usr/share/nginx/html;\\n\\
    index index.html;\\n\\
\\n\\
    # Include MIME types\\n\\
    include /etc/nginx/mime.types;\\n\\
    default_type application/octet-stream;\\n\\
\\n\\
    # Serve static assets directly (CSS, JS, images, fonts)\\n\\
    location ~* \\.(css|js)$ {\\n\\
        try_files $uri =404;\\n\\
        expires 30d;\\n\\
        add_header Cache-Control "public, no-transform";\\n\\
    }\\n\\
\\n\\
    location ~* \\.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {\\n\\
        try_files $uri =404;\\n\\
        expires 1y;\\n\\
        add_header Cache-Control "public, immutable";\\n\\
    }\\n\\
\\n\\
    # Serve HTML files and directory index\\n\\
    location / {\\n\\
        try_files $uri $uri/index.html $uri.html =404;\\n\\
    }\\n\\
\\n\\
    # Enable gzip compression\\n\\
    gzip on;\\n\\
    gzip_vary on;\\n\\
    gzip_proxied any;\\n\\
    gzip_comp_level 6;\\n\\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;\\n\\
\\n\\
    # Error pages\\n\\
    error_page 404 /404.html;\\n\\
    location = /404.html {\\n\\
        internal;\\n\\
    }\\n\\
}' > /etc/nginx/conf.d/default.conf

# Fix permissions
RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
  }

  // For Node.js apps with build step (Vite, React, etc.)
  return `# Stage 1: Build the application
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:1.21-alpine

# Copy built files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Create nginx MIME types configuration
RUN printf 'types {\\n\\
    text/html                             html htm shtml;\\n\\
    text/css                              css;\\n\\
    text/xml                              xml;\\n\\
    application/javascript                js;\\n\\
    application/json                      json;\\n\\
    image/gif                             gif;\\n\\
    image/jpeg                            jpeg jpg;\\n\\
    image/png                             png;\\n\\
    image/svg+xml                         svg svgz;\\n\\
    image/webp                            webp;\\n\\
    font/woff                             woff;\\n\\
    font/woff2                            woff2;\\n\\
    font/ttf                              ttf;\\n\\
    font/otf                              otf;\\n\\
}' > /etc/nginx/mime.types

# Create nginx config for SPA (Single Page Application)
RUN printf 'server {\\n\\
    listen 80;\\n\\
    server_name _;\\n\\
    root /usr/share/nginx/html;\\n\\
    index index.html;\\n\\
\\n\\
    # Include MIME types\\n\\
    include /etc/nginx/mime.types;\\n\\
    default_type application/octet-stream;\\n\\
\\n\\
    # Serve static assets directly (CSS, JS, images, fonts)\\n\\
    location ~* \\.(css|js)$ {\\n\\
        try_files $uri =404;\\n\\
        expires 30d;\\n\\
        add_header Cache-Control "public, no-transform";\\n\\
    }\\n\\
\\n\\
    location ~* \\.(jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot|webp|avif)$ {\\n\\
        try_files $uri =404;\\n\\
        expires 1y;\\n\\
        add_header Cache-Control "public, immutable";\\n\\
    }\\n\\
\\n\\
    # SPA fallback: serve index.html for all routes\\n\\
    location / {\\n\\
        try_files $uri $uri/ /index.html;\\n\\
    }\\n\\
\\n\\
    # Enable gzip compression\\n\\
    gzip on;\\n\\
    gzip_vary on;\\n\\
    gzip_proxied any;\\n\\
    gzip_comp_level 6;\\n\\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;\\n\\
}' > /etc/nginx/conf.d/default.conf

# Debug: List files to verify copy
RUN echo "=== Files in nginx html directory ===" && \\
    ls -la /usr/share/nginx/html/ && \\
    echo "=== Contents of assets/ if exists ===" && \\
    (ls -la /usr/share/nginx/html/assets/ 2>/dev/null || echo "No assets folder") && \\
    echo "=== Checking index.html ===" && \\
    (cat /usr/share/nginx/html/index.html | head -n 10 || echo "No index.html")

# Fix permissions
RUN chmod -R 755 /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
}

/**
 * Create Dockerfile for Python projects
 */
export function createPythonDockerfile(): string {
  return `# Python application Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Copy application code
COPY . .

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Expose port (default 8080 for Python web apps)
EXPOSE 8080

# Run the application
# Try common Python entry points and web servers
CMD if [ -f "main.py" ]; then \\
        python main.py; \\
    elif [ -f "app.py" ]; then \\
        # Check if app.py uses argparse with serve command
        if grep -q "argparse\\|ArgumentParser" app.py && grep -q "serve" app.py; then \\
            python app.py serve; \\
        # Try different ways to run Flask/FastAPI apps
        elif grep -q "Flask" app.py; then \\
            python app.py; \\
        elif grep -q "FastAPI" app.py; then \\
            uvicorn app:app --host 0.0.0.0 --port 8080 || python app.py; \\
        else \\
            python app.py; \\
        fi; \\
    elif [ -f "server.py" ]; then \\
        python server.py; \\
    elif [ -f "wsgi.py" ]; then \\
        gunicorn wsgi:app --bind 0.0.0.0:8080; \\
    else \\
        echo "No entry point found (main.py, app.py, server.py). Starting Python shell..."; \\
        python -c "print('Please add main.py or app.py with a web server')"; \\
        tail -f /dev/null; \\
    fi
`;
}

/**
 * Check if project is a static HTML site
 */
function isStaticHtmlSite(files: Array<{ path: string; content: string }>): boolean {
  const hasIndexHtml = files.some(f => 
    f.path === 'index.html' || f.path.endsWith('/index.html')
  );
  
  // Check for typical static site files
  const hasStaticAssets = files.some(f => {
    const path = f.path.toLowerCase();
    return path.endsWith('.css') || path.endsWith('.html') || path.includes('styles');
  });
  
  // Check for build tools that indicate it's NOT a static site
  const hasBuildTools = files.some(f => {
    const path = f.path.toLowerCase();
    return path === 'package.json' || 
           path === 'tsconfig.json' || 
           path === 'vite.config.ts' || 
           path === 'webpack.config.js' ||
           path.includes('server.ts') ||
           path.includes('server.js');
  });
  
  // Check for TypeScript/TSX files (indicates build step needed)
  const hasTypeScriptFiles = files.some(f => {
    const path = f.path.toLowerCase();
    return path.endsWith('.ts') || path.endsWith('.tsx');
  });
  
  // Check if there are more HTML/CSS/JS files than backend code
  let staticFileCount = 0;
  let backendFileCount = 0;
  
  files.forEach(f => {
    const path = f.path.toLowerCase();
    if (path.endsWith('.html') || path.endsWith('.css') || 
        (path.endsWith('.js') && !path.includes('src/') && !path.includes('server'))) {
      staticFileCount++;
    }
    if ((path.includes('server.') || path.includes('app.') || path.includes('api/')) &&
        (path.endsWith('.ts') || path.endsWith('.js'))) {
      backendFileCount++;
    }
  });
  
  // It's a static site if:
  // 1. Has index.html
  // 2. Has other static assets (CSS, etc.)
  // 3. NO build tools (package.json, tsconfig.json, etc.)
  // 4. NO TypeScript files
  // 5. Has more static files than backend files OR no backend files at all
  const isStatic = hasIndexHtml && 
                   hasStaticAssets && 
                   !hasBuildTools && 
                   !hasTypeScriptFiles &&
                   (staticFileCount > backendFileCount || backendFileCount === 0);
  
  if (isStatic) {
    console.log(`✓ Detected static HTML site (${staticFileCount} static files, ${backendFileCount} backend files, no build tools)`);
  }
  
  return isStatic;
}

/**
 * Get Dockerfile content based on detected language
 */
export function getDockerfileForLanguage(language: SupportedLanguage, files: Array<{ path: string; content: string }> = []): string {
  switch (language) {
    case 'python':
      return createPythonDockerfile();
    case 'typescript':
    case 'javascript':
      const isStatic = isStaticHtmlSite(files);
      console.log(`Creating Node Dockerfile (static site: ${isStatic})`);
      return createNodeDockerfile(isStatic);
    case 'unknown':
    default:
      // Check if it's a static HTML site even if language is unknown
      const isStaticUnknown = isStaticHtmlSite(files);
      if (isStaticUnknown) {
        console.log('Unknown language but detected static HTML site - using nginx');
        return createNodeDockerfile(true);
      }
      console.warn('Unknown language, using Node.js Dockerfile as fallback');
      return createNodeDockerfile(false);
  }
}

/**
 * Detect language and generate appropriate Dockerfile
 */
export function generateDockerfile(files: Array<{ path: string; content: string }>): string {
  const language = detectLanguageFromFiles(files);
  return getDockerfileForLanguage(language, files);
}
