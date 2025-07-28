export type Priority = 
  | 'urgent-important'
  | 'not-urgent-important'
  | 'urgent-not-important'
  | 'not-urgent-not-important';

export interface Task {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  priority: Priority;
  dueDate?: Date;
  dueTime?: string;
  completed: boolean;
  overdue: boolean;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskFormData {
  title: string;
  description?: string;
  subject?: string;
  priority?: Priority;
  dueDate?: Date;
  dueTime?: string;
  completed?: boolean;
}
