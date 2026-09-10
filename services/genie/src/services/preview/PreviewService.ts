import { spawn } from 'child_process';
import tmp from 'tmp';
import fs from 'fs';
import path from 'path';
import { generateDockerfile, detectLanguageFromFiles } from './DockerfileTemplates';

export interface IPreviewService {
  generatePreview(generationId: string, files: Array<{ path: string; content: string }>): Promise<{ previewUrl: string }>;
}

export class PreviewService implements IPreviewService {
  private flyApiToken: string;

  constructor() {
    if (!process.env.FLY_API_TOKEN) {
      throw new Error('FLY_API_TOKEN environment variable is not set.');
    }
    this.flyApiToken = process.env.FLY_API_TOKEN;
  }

  async generatePreview(generationId: string, files: Array<{ path: string; content: string }>): Promise<{ previewUrl: string }> {
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    const appName = `preview-${generationId.replace(/_/g, "-")}`.toLowerCase();

    try {
      // 1. Detect language from files
      const language = detectLanguageFromFiles(files);
      console.log(`Detected language: ${language} for generation ${generationId}`);

      // 2. Write files to temp directory
      for (const file of files) {
        const filePath = path.join(tmpDir.name, file.path);
        const dirName = path.dirname(filePath);
        if (!fs.existsSync(dirName)) {
          fs.mkdirSync(dirName, { recursive: true });
        }
        fs.writeFileSync(filePath, file.content);
      }

      // 3. Create Dockerfile based on detected language
      const dockerfileContent = generateDockerfile(files);
      fs.writeFileSync(path.join(tmpDir.name, 'Dockerfile'), dockerfileContent);

      // 4. Create a fly.toml file
      const flyTomlContent = this.createFlyToml(appName, language);
      fs.writeFileSync(path.join(tmpDir.name, 'fly.toml'), flyTomlContent);

      // 5. Deploy using flyctl
      await this.deployWithFlyctl(tmpDir.name, appName);

      return { previewUrl: `https://${appName}.fly.dev` };

    } finally {
      tmpDir.removeCallback();
    }
  }

  private runCommand(command: string, args: string[], workDir: string): Promise<{ code: number | null, stdout: string, stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: workDir,
            env: { ...process.env, FLY_API_TOKEN: this.flyApiToken },
            shell: false,
            windowsHide: true
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`${command} stdout: ${output}`);
            stdout += output;
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            console.error(`${command} stderr: ${output}`);
            stderr += output;
        });

        child.on('close', (code) => {
            resolve({ code, stdout, stderr });
        });
    });
  }

  private async deployWithFlyctl(workDir: string, appName: string): Promise<void> {
    // Check if app already exists
    const listResult = await this.runCommand('flyctl', ['apps', 'list', '--json'], workDir);
    
    let appExists = false;
    if (listResult.code === 0 && listResult.stdout) {
      try {
        const apps = JSON.parse(listResult.stdout);
        appExists = apps.some((app: any) => app.Name === appName);
      } catch (e) {
        console.warn('Failed to parse flyctl apps list output, will attempt to create app');
      }
    }

    // Only create app if it doesn't exist
    if (!appExists) {
      console.log(`Creating new Fly.io app: ${appName}`);
      const createResult = await this.runCommand('flyctl', ['apps', 'create', appName, '--org', 'personal'], workDir);

      if (createResult.code !== 0) {
        // Check if error is because app already exists (race condition or parsing failure)
        const errorMsg = createResult.stderr.toLowerCase();
        if (!errorMsg.includes('already') && !errorMsg.includes('taken')) {
          throw new Error(`flyctl apps create failed with code ${createResult.code}: ${createResult.stderr}`);
        }
        console.log(`App ${appName} already exists, proceeding with deployment`);
      }
    } else {
      console.log(`App ${appName} already exists, updating deployment`);
    }

    // Deploy (this will update existing app or deploy new one)
    const deployResult = await this.runCommand('flyctl', ['deploy', '--remote-only'], workDir);

    if (deployResult.code !== 0) {
        throw new Error(`flyctl deploy failed with code ${deployResult.code}: ${deployResult.stderr}`);
    }
  }

  private createFlyToml(appName: string, language: string): string {
    // Determine internal port based on language
    const internalPort = language === 'python' ? 8080 : 80;
    
    return `app = "${appName}"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = ${internalPort}
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
`;
  }
}

