import AsyncStorage from '@react-native-async-storage/async-storage';
import { TaskCategory } from '../types/Task';

const CATEGORIES_STORAGE_KEY = 'task_categories';

// Default categories
const DEFAULT_CATEGORIES: TaskCategory[] = [
  {
    id: '1',
    name: 'Work',
    color: '#3B82F6',
    created_at: new Date(),
  },
  {
    id: '2',
    name: 'Personal',
    color: '#10B981',
    created_at: new Date(),
  },
  {
    id: '3',
    name: 'Health & Fitness',
    color: '#F59E0B',
    created_at: new Date(),
  },
  {
    id: '4',
    name: 'Learning',
    color: '#8B5CF6',
    created_at: new Date(),
  },
  {
    id: '5',
    name: 'Finance',
    color: '#EF4444',
    created_at: new Date(),
  },
  {
    id: '6',
    name: 'Home & Family',
    color: '#F97316',
    created_at: new Date(),
  },
  {
    id: '7',
    name: 'Shopping',
    color: '#EC4899',
    created_at: new Date(),
  },
  {
    id: '8',
    name: 'Travel',
    color: '#06B6D4',
    created_at: new Date(),
  },
];

export const categoryService = {
  // Get all categories
  async getCategories(): Promise<TaskCategory[]> {
    try {
      const storedCategories = await AsyncStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (storedCategories) {
        const categories = JSON.parse(storedCategories);
        // Convert date strings back to Date objects
        return categories.map((category: any) => ({
          ...category,
          createdAt: new Date(category.createdAt),
        }));
      }
      // If no categories exist, set and return default categories
      await this.setCategories(DEFAULT_CATEGORIES);
      return DEFAULT_CATEGORIES;
    } catch (error) {
      console.error('Error getting categories:', error);
      return DEFAULT_CATEGORIES;
    }
  },

  // Create a new category
  async createCategory(name: string, color: string): Promise<TaskCategory> {
    try {
      const categories = await this.getCategories();
      const newCategory: TaskCategory = {
        id: Date.now().toString(),
        name,
        color,
        created_at: new Date(),
      };
      const updatedCategories = [...categories, newCategory];
      await this.setCategories(updatedCategories);
      return newCategory;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  },

  // Update a category
  async updateCategory(id: string, updates: Partial<TaskCategory>): Promise<TaskCategory> {
    try {
      const categories = await this.getCategories();
      const categoryIndex = categories.findIndex(cat => cat.id === id);
      if (categoryIndex === -1) {
        throw new Error('Category not found');
      }
      
      const updatedCategory = { ...categories[categoryIndex], ...updates };
      categories[categoryIndex] = updatedCategory;
      await this.setCategories(categories);
      return updatedCategory;
    } catch (error) {
      console.error('Error updating category:', error);
      throw error;
    }
  },

  // Delete a category
  async deleteCategory(id: string): Promise<void> {
    try {
      const categories = await this.getCategories();
      const filteredCategories = categories.filter(cat => cat.id !== id);
      await this.setCategories(filteredCategories);
    } catch (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  },

  // Private method to save categories
  async setCategories(categories: TaskCategory[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categories));
    } catch (error) {
      console.error('Error saving categories:', error);
      throw error;
    }
  },
};