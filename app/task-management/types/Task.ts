export type Priority = 
  | 'urgent-important'
  | 'not-urgent-important'
  | 'urgent-not-important'
  | 'not-urgent-not-important';

export type TaskStatus = 
  | 'todo'
  | 'in-progress'
  | 'completed'
  | 'on-hold';

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  category?: TaskCategory;
  priority: Priority;
  status: TaskStatus;
  dueDate?: Date;
  completed: boolean;
  overdue: boolean;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskFormData {
  title: string;
  description?: string;
  category?: TaskCategory;
  priority?: Priority;
  status?: TaskStatus;
  dueDate?: Date;
}
