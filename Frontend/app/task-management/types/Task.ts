import { UUID } from "crypto";


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
  due_datetime?: string; // Full datetime from backend
  created_at: string;
  updated_at: string;
  completed_at?: string;
  
  // Frontend computed properties


  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  overdue: boolean;
  user?: string;
}


// Form data used when creating or updating tasks
export interface TaskFormData {
  title: string;
  description?: string;
  priority?: Priority;
  category?: string;
  due_datetime?: Date;
  due_time?: string; // Time string (HH:MM:SS or HH:MM AM/PM)
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