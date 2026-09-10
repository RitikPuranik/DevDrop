
import { Router } from 'express';
import { ProjectRepository } from '../../storage/repositories/ProjectRepository';
import { supabaseAuth, AuthenticatedRequest } from '../middleware/supabaseAuth';
import { Response } from 'express';

const router = Router();
const projectRepository = new ProjectRepository();

/**
 * GET /api/projects
 * Get all projects for the authenticated user
 */
router.get('/projects', supabaseAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ 
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request' 
      });
      return;
    }

    const projects = await projectRepository.findByUserId(req.userId);
    
    res.json({
      success: true,
      data: projects,
      message: 'Projects fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch projects' 
    });
  }
});

/**
 * GET /api/projects/:id
 * Get a specific project by ID
 */
router.get('/projects/:id', supabaseAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ 
        success: false,
        error: 'Unauthorized',
        message: 'User ID not found in request' 
      });
      return;
    }

    const { id } = req.params;
    const project = await projectRepository.findById(id);

    if (!project) {
      res.status(404).json({ 
        success: false,
        error: 'Not Found',
        message: 'Project not found' 
      });
      return;
    }

    // Verify the project belongs to the authenticated user
    // Note: ProjectContext doesn't have userId, but we can check via repository
    const userProjects = await projectRepository.findByUserId(req.userId);
    const userOwnsProject = userProjects.some(p => p.id === id);

    if (!userOwnsProject) {
      res.status(403).json({ 
        success: false,
        error: 'Forbidden',
        message: 'You do not have permission to access this project' 
      });
      return;
    }

    res.json({
      success: true,
      data: project,
      message: 'Project fetched successfully'
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal Server Error',
      message: 'Failed to fetch project' 
    });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/projects', supabaseAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User ID not found in request' 
      });
      return;
    }

    const projectData = req.body;
    
    // Validate required fields
    if (!projectData.name || !projectData.rootPath) {
      res.status(400).json({ 
        error: 'Bad Request',
        message: 'Project name and rootPath are required' 
      });
      return;
    }

    const project = await projectRepository.create(req.userId, projectData);
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to create project' 
    });
  }
});

/**
 * PUT /api/projects/:id
 * Update a project
 */
router.put('/projects/:id', supabaseAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User ID not found in request' 
      });
      return;
    }

    const { id } = req.params;
    const updates = req.body;

    // Verify the project exists and belongs to the user
    const userProjects = await projectRepository.findByUserId(req.userId);
    const userOwnsProject = userProjects.some(p => p.id === id);

    if (!userOwnsProject) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: 'You do not have permission to modify this project' 
      });
      return;
    }

    const updatedProject = await projectRepository.update(id, updates);
    
    res.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to update project' 
    });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a project
 */
router.delete('/projects/:id', supabaseAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User ID not found in request' 
      });
      return;
    }

    const { id } = req.params;

    // Verify the project exists and belongs to the user
    const userProjects = await projectRepository.findByUserId(req.userId);
    const userOwnsProject = userProjects.some(p => p.id === id);

    if (!userOwnsProject) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: 'You do not have permission to delete this project' 
      });
      return;
    }

    await projectRepository.delete(id);
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to delete project' 
    });
  }
});

/**
 * GET /api/projects/search
 * Search projects by name
 */
router.get('/projects/search', supabaseAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.userId) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User ID not found in request' 
      });
      return;
    }

    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      res.status(400).json({ 
        error: 'Bad Request',
        message: 'Search query parameter "q" is required' 
      });
      return;
    }

    const projects = await projectRepository.search(req.userId, q);
    
    res.json(projects);
  } catch (error) {
    console.error('Error searching projects:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to search projects' 
    });
  }
});

export default router;
