import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    bio?: string;
    phone?: string;
    location?: string;
    profilePicture?: string;
    joinDate: string;
    tasksCompleted: number;
    notesCreated: number;
    studyStreak: number;
    learningHours: number;
}

class UserService {
    private static instance: UserService;
    private readonly STORAGE_KEY = '@user_profile';

    private constructor() {}

    static getInstance(): UserService {
        if (!UserService.instance) {
            UserService.instance = new UserService();
        }
        return UserService.instance;
    }

    async getUserProfile(): Promise<UserProfile | null> {
        try {
            const userData = await AsyncStorage.getItem(this.STORAGE_KEY);
            if (userData) {
                return JSON.parse(userData);
            }
            
            // Return default user if no data exists
            const defaultUser: UserProfile = {
                id: '1',
                name: 'John Doe',
                email: 'john.doe@example.com',
                bio: 'Computer Science student passionate about learning and productivity.',
                phone: '+1 (555) 123-4567',
                location: 'New York, NY',
                profilePicture: undefined,
                joinDate: 'January 2024',
                tasksCompleted: 24,
                notesCreated: 18,
                studyStreak: 7,
                learningHours: 42,
            };
            
            // Save default user to storage
            await this.updateUserProfile(defaultUser);
            return defaultUser;
        } catch (error) {
            console.error('Error getting user profile:', error);
            return null;
        }
    }

    async updateUserProfile(profile: UserProfile): Promise<boolean> {
        try {
            await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
            return true;
        } catch (error) {
            console.error('Error updating user profile:', error);
            return false;
        }
    }

    async updateUserStats(stats: {
        tasksCompleted?: number;
        notesCreated?: number;
        studyStreak?: number;
        learningHours?: number;
    }): Promise<boolean> {
        try {
            const currentProfile = await this.getUserProfile();
            if (!currentProfile) return false;

            const updatedProfile: UserProfile = {
                ...currentProfile,
                ...stats,
            };

            return await this.updateUserProfile(updatedProfile);
        } catch (error) {
            console.error('Error updating user stats:', error);
            return false;
        }
    }

    async incrementTasksCompleted(): Promise<boolean> {
        try {
            const currentProfile = await this.getUserProfile();
            if (!currentProfile) return false;

            return await this.updateUserStats({
                tasksCompleted: currentProfile.tasksCompleted + 1,
            });
        } catch (error) {
            console.error('Error incrementing tasks completed:', error);
            return false;
        }
    }

    async incrementNotesCreated(): Promise<boolean> {
        try {
            const currentProfile = await this.getUserProfile();
            if (!currentProfile) return false;

            return await this.updateUserStats({
                notesCreated: currentProfile.notesCreated + 1,
            });
        } catch (error) {
            console.error('Error incrementing notes created:', error);
            return false;
        }
    }

    async updateStudyStreak(days: number): Promise<boolean> {
        try {
            return await this.updateUserStats({
                studyStreak: days,
            });
        } catch (error) {
            console.error('Error updating study streak:', error);
            return false;
        }
    }

    async clearUserData(): Promise<boolean> {
        try {
            await AsyncStorage.removeItem(this.STORAGE_KEY);
            return true;
        } catch (error) {
            console.error('Error clearing user data:', error);
            return false;
        }
    }
}

export const userService = UserService.getInstance();
