
export type Priority = 
  | "urgent-important"
  | "not-urgent-important"
  | "urgent-not-important"
  | "not-urgent-not-important";


// Base Task interface that matches the backend model structure
export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: Priority;
  category?: string;
  category_name?: string;
  due_date?: string; // ISO format date string from backend
  due_time?: string; // Time string from backend (HH:MM:SS or HH:MM AM/PM)
  due_datetime?: Date | null; // Full datetime from backend
  created_at: string;
  updated_at: string;
  completed_at?: string;
  overdue: boolean;
  user?: string;
}


// Form data used when creating or updating tasks
export interface TaskFormData {
  title: string;
  description?: string | null;
  priority?: Priority;
  category?: string | null;
  due_datetime?: Date | null;
  due_time?: string | null; 
  completed?: boolean;
  user?: string;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

// Task category type
export interface TaskCategory {
  id: string;
  name: string;
  color?: string;
  created_at: Date;
  task_count?: number;
}