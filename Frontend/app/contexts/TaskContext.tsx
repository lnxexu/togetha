import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Task } from '../task-management/types/Task';

interface TaskContextProps {
  tasks: Task[];
  onMarkComplete: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}

const TaskContext = createContext<TaskContextProps | undefined>(undefined);

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

interface TaskProviderProps {
  children: ReactNode;
}

export const TaskProvider: React.FC<TaskProviderProps> = ({ children }) => {
  const [tasks, setTasks] = useState<Task[]>([]); // You may want to initialize with your data

  const onMarkComplete = (taskId: string) => {
    setTasks(prev => prev.map(task =>
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const onDeleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  return (
    <TaskContext.Provider value={{ tasks, onMarkComplete, onDeleteTask }}>
      {children}
    </TaskContext.Provider>
  );
};
