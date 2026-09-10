import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /repos - List user's GitHub repos
 * Requires x-github-token header
 */
router.get('/repos', async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'GitHub token required. Connect your GitHub account or provide a token.',
    });
  }

  try {
    const response = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=100&type=owner',
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Genie-AI',
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('GitHub API error:', response.status, errorBody);
      return res.status(response.status).json({
        success: false,
        error: `GitHub API error: ${response.statusText}`,
      });
    }

    const repos = await response.json();

    const mapped = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      url: repo.html_url,
      updatedAt: repo.updated_at,
      language: repo.language,
      defaultBranch: repo.default_branch,
    }));

    return res.json({ success: true, data: mapped });
  } catch (error: any) {
    console.error('GitHub repos error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch repositories',
    });
  }
});

/**
 * GET /repos/:owner/:repo/tree - Get repository file tree
 * Requires x-github-token header
 */
router.get('/repos/:owner/:repo/tree', async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string;
  if (!token) {
    return res.status(401).json({ success: false, error: 'GitHub token required.' });
  }

  const { owner, repo } = req.params;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Genie-AI',
  };

  try {
    // Get repo info for default branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      return res.status(repoRes.status).json({ success: false, error: 'Repository not found.' });
    }
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    // Get recursive tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`,
      { headers }
    );
    if (!treeRes.ok) {
      return res.status(treeRes.status).json({ success: false, error: 'Failed to get repo tree.' });
    }
    const treeData = await treeRes.json();

    const skipDirs = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '__pycache__/', '.venv/', 'vendor/'];
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.eot', '.mp3', '.mp4', '.zip', '.tar', '.gz', '.pdf', '.lock'];

    const files = (treeData.tree || [])
      .filter((item: any) => {
        if (item.type !== 'blob') return false;
        const path: string = item.path;
        if (skipDirs.some(dir => path.startsWith(dir) || path.includes(`/${dir}`))) return false;
        if (binaryExts.some(ext => path.toLowerCase().endsWith(ext))) return false;
        if (item.size && item.size > 100 * 1024) return false;
        return true;
      })
      .map((item: any) => ({
        path: item.path,
        size: item.size || 0,
        sha: item.sha,
      }));

    return res.json({
      success: true,
      data: {
        defaultBranch,
        totalFiles: files.length,
        truncated: treeData.truncated || false,
        files,
      },
    });
  } catch (error: any) {
    console.error('GitHub tree error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to get repo tree' });
  }
});

/**
 * POST /repos/:owner/:repo/files - Fetch file contents
 * Requires x-github-token header
 * Body: { files: string[], ref?: string }
 */
router.post('/repos/:owner/:repo/files', async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string;
  if (!token) {
    return res.status(401).json({ success: false, error: 'GitHub token required.' });
  }

  const { owner, repo } = req.params;
  const { files: filePaths, ref } = req.body;

  if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
    return res.status(400).json({ success: false, error: 'files array is required.' });
  }

  if (filePaths.length > 50) {
    return res.status(400).json({ success: false, error: 'Maximum 50 files allowed.' });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Genie-AI',
  };

  try {
    const fetchedFiles: { path: string; content: string }[] = [];
    const errors: string[] = [];
    let totalSize = 0;
    const maxTotalSize = 500 * 1024; // 500KB

    // Fetch in batches of 10
    for (let i = 0; i < filePaths.length; i += 10) {
      const batch = filePaths.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (filePath: string) => {
          try {
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}${ref ? `?ref=${ref}` : ''}`;
            const fileRes = await fetch(url, { headers });
            if (!fileRes.ok) {
              return { error: `${filePath}: ${fileRes.statusText}` };
            }
            const fileData = await fileRes.json();
            if (fileData.encoding === 'base64' && fileData.content) {
              const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
              return { path: filePath, content };
            }
            return { error: `${filePath}: unsupported encoding` };
          } catch (err: any) {
            return { error: `${filePath}: ${err.message}` };
          }
        })
      );

      for (const result of results) {
        if ('error' in result) {
          errors.push(result.error as string);
        } else {
          totalSize += (result as any).content.length;
          if (totalSize > maxTotalSize) {
            errors.push(`Skipped remaining files: total size exceeds 500KB limit`);
            break;
          }
          fetchedFiles.push(result as { path: string; content: string });
        }
      }

      if (totalSize > maxTotalSize) break;
    }

    return res.json({
      success: true,
      data: {
        files: fetchedFiles,
        errors: errors.length > 0 ? errors : undefined,
        totalSize,
        fetchedCount: fetchedFiles.length,
      },
    });
  } catch (error: any) {
    console.error('GitHub files error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch files' });
  }
});

/**
 * POST /pull-request - Create a PR with file changes
 * Requires x-github-token header
 * Body: { owner, repo, title, body, files: [{path, content}], baseBranch?, branchName? }
 */
router.post('/pull-request', async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string;
  if (!token) {
    return res.status(401).json({ success: false, error: 'GitHub token required.' });
  }

  const { owner, repo, title, body: prBody, files, baseBranch, branchName } = req.body;

  if (!owner || !repo || !title || !files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ success: false, error: 'owner, repo, title, and files are required.' });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Genie-AI',
  };

  try {
    // Get repo info for default branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!repoRes.ok) {
      return res.status(repoRes.status).json({ success: false, error: 'Repository not found.' });
    }
    const repoData = await repoRes.json();
    const base = baseBranch || repoData.default_branch || 'main';

    // Get latest commit SHA on base branch
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${base}`,
      { headers }
    );
    if (!refRes.ok) {
      return res.status(500).json({ success: false, error: 'Failed to get base branch reference.' });
    }
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // Get the tree SHA
    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`,
      { headers }
    );
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // Create new branch
    const newBranch = branchName || `genie/review-fixes-${Date.now()}`;
    const createRefRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ref: `refs/heads/${newBranch}`,
          sha: latestCommitSha,
        }),
      }
    );
    if (!createRefRes.ok) {
      const err = await createRefRes.json();
      return res.status(createRefRes.status).json({ success: false, error: err.message || 'Failed to create branch.' });
    }

    // Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file: { path: string; content: string }) => {
        const blobRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
          }
        );
        const blob = await blobRes.json();
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        };
      })
    );

    // Create tree
    const treeRes2 = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
      }
    );
    const treeData2 = await treeRes2.json();

    // Create commit
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: title,
          tree: treeData2.sha,
          parents: [latestCommitSha],
        }),
      }
    );
    const newCommit = await newCommitRes.json();

    // Update branch ref
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${newBranch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommit.sha }),
      }
    );

    // Create PR
    const prRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          body: prBody || 'Created by Genie AI',
          head: newBranch,
          base,
        }),
      }
    );

    if (!prRes.ok) {
      const err = await prRes.json();
      return res.status(prRes.status).json({ success: false, error: err.message || 'Failed to create pull request.' });
    }

    const pr = await prRes.json();

    return res.json({
      success: true,
      data: {
        prUrl: pr.html_url,
        prNumber: pr.number,
        branchName: newBranch,
      },
    });
  } catch (error: any) {
    console.error('GitHub PR error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create pull request' });
  }
});

/**
 * POST /push - Push files to a GitHub repo (new or existing)
 * Requires x-github-token header
 * Body: { repoName, files, commitMessage, createNew?, description?, isPrivate? }
 */
router.post('/push', async (req: Request, res: Response) => {
  const token = req.headers['x-github-token'] as string;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'GitHub token required.',
    });
  }

  const { repoName, files, commitMessage, createNew, description, isPrivate } =
    req.body;

  if (!repoName || !files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'repoName and files are required.',
    });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Genie-AI',
  };

  try {
    // Get authenticated user
    const userRes = await fetch('https://api.github.com/user', { headers });
    if (!userRes.ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid GitHub token.',
      });
    }
    const user = await userRes.json();
    const owner = user.login;

    let repoFullName = `${owner}/${repoName}`;
    let defaultBranch = 'main';

    // Create repo if requested
    if (createNew) {
      const createRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: repoName,
          description: description || `Generated by Genie AI`,
          private: isPrivate ?? false,
          auto_init: true,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        return res.status(createRes.status).json({
          success: false,
          error: err.message || 'Failed to create repository',
        });
      }

      const newRepo = await createRes.json();
      repoFullName = newRepo.full_name;
      defaultBranch = newRepo.default_branch || 'main';

      // Wait briefly for auto_init to complete
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      // Get existing repo info
      const repoRes = await fetch(
        `https://api.github.com/repos/${repoFullName}`,
        { headers }
      );
      if (!repoRes.ok) {
        return res.status(404).json({
          success: false,
          error: `Repository ${repoFullName} not found.`,
        });
      }
      const repo = await repoRes.json();
      defaultBranch = repo.default_branch || 'main';
    }

    // Get latest commit SHA on default branch
    const refRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/ref/heads/${defaultBranch}`,
      { headers }
    );
    if (!refRes.ok) {
      return res.status(500).json({
        success: false,
        error: 'Failed to get branch reference. Repository may be empty.',
      });
    }
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // Get the tree SHA of the latest commit
    const commitRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits/${latestCommitSha}`,
      { headers }
    );
    const commitData = await commitRes.json();
    const baseTreeSha = commitData.tree.sha;

    // Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file: { path: string; content: string }) => {
        const blobRes = await fetch(
          `https://api.github.com/repos/${repoFullName}/git/blobs`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              content: file.content,
              encoding: 'utf-8',
            }),
          }
        );
        const blob = await blobRes.json();
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        };
      })
    );

    // Create a new tree
    const treeRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeItems,
        }),
      }
    );
    const treeData = await treeRes.json();

    // Create a new commit
    const newCommitRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: commitMessage || 'Add files from Genie AI',
          tree: treeData.sha,
          parents: [latestCommitSha],
        }),
      }
    );
    const newCommit = await newCommitRes.json();

    // Update the reference to point to the new commit
    const updateRefRes = await fetch(
      `https://api.github.com/repos/${repoFullName}/git/refs/heads/${defaultBranch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          sha: newCommit.sha,
        }),
      }
    );

    if (!updateRefRes.ok) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update branch reference.',
      });
    }

    return res.json({
      success: true,
      data: {
        repoUrl: `https://github.com/${repoFullName}`,
        commitSha: newCommit.sha,
      },
    });
  } catch (error: any) {
    console.error('GitHub push error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to push to GitHub',
    });
  }
});

export default router;
