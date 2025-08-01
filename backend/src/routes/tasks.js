/**
 * TASK MANAGEMENT API ROUTES
 * 
 * Comprehensive RESTful API endpoints for task lifecycle management in the Taskify system.
 * This module provides full CRUD operations for tasks with advanced features including
 * status tracking, priority management, time estimation, and tag-based organization.
 * 
 * ENDPOINT OVERVIEW:
 * - GET    /api/tasks     - Retrieve all tasks with advanced filtering
 * - GET    /api/tasks/:id - Retrieve specific task by ID
 * - POST   /api/tasks     - Create new task with full metadata
 * - PUT    /api/tasks/:id - Update existing task properties
 * - DELETE /api/tasks/:id - Delete task and associated data
 * 
 * CORE FEATURES:
 * - Complete task lifecycle management (creation to completion)
 * - Multi-dimensional filtering (project, status, priority)
 * - Tag-based organization and categorization
 * - Time estimation and actual hours tracking
 * - Due date management and deadline tracking
 * - Database-agnostic JSON tag storage
 * - Project association and validation
 * 
 * DATA FIELDS:
 * - id: Unique task identifier (auto-generated)
 * - project_id: Associated project (foreign key, required)
 * - title: Task title/summary (required)
 * - description: Detailed task description (optional)
 * - status: Task status (todo, in_progress, done, on_hold)
 * - priority: Task priority (low, medium, high, critical)
 * - due_date: Task deadline (ISO date string, optional)
 * - estimated_hours: Time estimation for planning
 * - actual_hours: Actual time spent (time tracking)
 * - tags: Array of categorization tags (JSON stored)
 * - created_at: Task creation timestamp
 * - updated_at: Last modification timestamp
 * 
 * ADVANCED FEATURES:
 * - Cross-database tag handling (JSON for SQLite, native for PostgreSQL)
 * - Dynamic query building for flexible filtering
 * - Project name inclusion via JOIN operations
 * - Comprehensive validation and error handling
 * - Time tracking integration
 * 
 * QUERY PARAMETERS:
 * - project_id: Filter tasks by specific project
 * - status: Filter by task status
 * - priority: Filter by task priority
 * 
 * DATABASE COMPATIBILITY:
 * - PostgreSQL: Native JSON column support for tags
 * - SQLite: JSON string storage with automatic parsing
 * - Unified API regardless of backend database
 * - Proper data type handling for different databases
 * 
 * VALIDATION RULES:
 * - project_id and title required for creation
 * - Project existence validation before task creation
 * - Status and priority default value handling
 * - Optional field management with COALESCE updates
 * 
 * RESPONSE FORMAT:
 * Success: { success: true, data: {...}, count?: number }
 * Error: { success: false, error: "message" }
 * 
 * HTTP STATUS CODES:
 * - 200: Successful GET/PUT operations
 * - 201: Successful POST (task created)
 * - 400: Bad request (validation errors, project not found)
 * - 404: Task not found
 * - 500: Internal server error
 */

import express from 'express';
import dbFactory from '../database/connectionFactory.js';
import { dbConfig } from '../config/database.js';

const router = express.Router();

// GET /api/tasks - Get all tasks
router.get('/', async (req, res, next) => {
  try {
    const { project_id, status, priority } = req.query;
    const db = dbFactory.getConnection();
    
    let query = 'SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id';
    const params = [];
    const conditions = [];
    
    if (project_id) {
      conditions.push('t.project_id = ?');
      params.push(project_id);
    }
    
    if (status) {
      conditions.push('t.status = ?');
      params.push(status);
    }
    
    if (priority) {
      conditions.push('t.priority = ?');
      params.push(priority);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY t.created_at DESC';
    
    const result = await db.query(query, params);
    
    // Parse tags for SQLite (stored as JSON string)
    const tasks = result.rows.map(task => ({
      ...task,
      tags: dbConfig.type === 'sqlite' && task.tags ? JSON.parse(task.tags) : task.tags
    }));
    
    res.json({
      success: true,
      data: tasks,
      count: tasks.length
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/tasks/:id - Get task by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = dbFactory.getConnection();
    
    const result = await db.query(
      'SELECT t.*, p.name as project_name FROM tasks t LEFT JOIN projects p ON t.project_id = p.id WHERE t.id = ?',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    const task = result.rows[0];
    
    // Parse tags for SQLite
    if (dbConfig.type === 'sqlite' && task.tags) {
      task.tags = JSON.parse(task.tags);
    }
    
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tasks - Create new task
router.post('/', async (req, res, next) => {
  try {
    const { project_id, title, description, status, priority, due_date, estimated_hours, tags } = req.body;
    
    if (!project_id || !title) {
      return res.status(400).json({
        success: false,
        error: 'project_id and title are required'
      });
    }
    
    const db = dbFactory.getConnection();
    
    // Check if project exists
    const projectCheck = await db.query('SELECT id FROM projects WHERE id = ?', [project_id]);
    if (projectCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Project not found'
      });
    }
    
    // Handle tags based on database type
    const tagsValue = dbConfig.type === 'sqlite' 
      ? (tags ? JSON.stringify(tags) : null)
      : tags;
    
    const result = await db.query(
      'INSERT INTO tasks (project_id, title, description, status, priority, due_date, estimated_hours, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *',
      [
        project_id, 
        title, 
        description || null, 
        status || 'todo', 
        priority || 'medium',
        due_date || null,
        estimated_hours || null,
        tagsValue
      ]
    );
    
    const task = result.rows[0] || { 
      id: result.lastID, 
      project_id, 
      title, 
      description, 
      status: status || 'todo',
      priority: priority || 'medium',
      due_date,
      estimated_hours,
      tags
    };
    
    // Parse tags for SQLite
    if (dbConfig.type === 'sqlite' && task.tags) {
      task.tags = JSON.parse(task.tags);
    }
    
    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, due_date, estimated_hours, actual_hours, tags } = req.body;
    
    const db = dbFactory.getConnection();
    
    // Check if task exists
    const taskCheck = await db.query('SELECT id FROM tasks WHERE id = ?', [id]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    // Handle tags based on database type
    const tagsValue = tags !== undefined
      ? (dbConfig.type === 'sqlite' ? JSON.stringify(tags) : tags)
      : null;
    
    const result = await db.query(
      'UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), status = COALESCE(?, status), priority = COALESCE(?, priority), due_date = COALESCE(?, due_date), estimated_hours = COALESCE(?, estimated_hours), actual_hours = COALESCE(?, actual_hours), tags = COALESCE(?, tags), updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *',
      [
        title || null, 
        description || null, 
        status || null, 
        priority || null,
        due_date || null,
        estimated_hours || null,
        actual_hours || null,
        tagsValue,
        id
      ]
    );
    
    const task = result.rows[0] || { 
      id, 
      title, 
      description, 
      status, 
      priority,
      due_date,
      estimated_hours,
      actual_hours,
      tags
    };
    
    // Parse tags for SQLite
    if (dbConfig.type === 'sqlite' && task.tags) {
      task.tags = JSON.parse(task.tags);
    }
    
    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const db = dbFactory.getConnection();
    
    const result = await db.query('DELETE FROM tasks WHERE id = ?', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;