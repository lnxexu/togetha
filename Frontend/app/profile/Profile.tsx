import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Image,
    ScrollView,
    Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Navbar from '../NavBar';
import { userService, UserProfile } from './services/userService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const Profile: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const [userData, setUserData] = useState<UserProfile | null>(null);

    // Load user data when screen is focused
    useFocusEffect(
        useCallback(() => {
            loadUserData();
        }, [])
    );

    const loadUserData = async () => {
        try {
            const profile = await userService.getUserProfile();
            setUserData(profile);
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    };

    const handleLogout = () => {
        // Implement logout logic here
        navigation.navigate('Welcome');
    };

    const handleManageProfile = () => {
        navigation.navigate('ManageProfile');
    };

    const handleEditProfile = () => {
        navigation.navigate('EditProfile');
    };

    // Show loading or empty state if userData is not loaded
    if (!userData) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
                <Navbar activeRoute="Profile" />
            </View>
        );
    }

    const progressData = [
        {
            title: "Tasks Completed",
            value: userData.tasksCompleted,
            icon: "check-circle",
            color: "#4CAF50",
            description: "Total tasks completed this month"
        },
        {
            title: "Notes Created",
            value: userData.notesCreated,
            icon: "note",
            color: "#2196F3",
            description: "Notes created this month"
        },
        {
            title: "Study Streak",
            value: userData.studyStreak,
            icon: "local-fire-department",
            color: "#FF5722",
            description: "Days in a row"
        },
        {
            title: "Learning Hours",
            value: userData.learningHours,
            icon: "access-time",
            color: "#9C27B0",
            description: "Hours spent learning this month"
        }
    ];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <View style={styles.titleSection}>
                        <Text style={styles.settingsTitle}>Settings</Text>
                        <Text style={styles.settingsDescription}>Manage your account settings</Text>
                    </View>
                    <TouchableOpacity
                        style={styles.logoutButton}
                        onPress={handleLogout}
                    >
                        <MaterialIcons name="logout" size={24} color="#FF5722" />
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.profileSection}>
                    <View style={styles.profilePicContainer}>
                        {userData.profilePicture ? (
                            <Image 
                                source={{ uri: userData.profilePicture }} 
                                style={styles.profilePic}
                            />
                        ) : (
                            <View style={styles.defaultProfilePic}>
                                <MaterialIcons name="person" size={40} color="#6A009C" />
                            </View>
                        )}
                    </View>
                    
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{userData.name}</Text>
                        <Text style={styles.joinDate}>Member since {userData.joinDate}</Text>
                    </View>

                    <TouchableOpacity
                        style={styles.editButton}
                        onPress={handleManageProfile}
                    >
                        <MaterialIcons name="edit" size={24} color="#6A009C" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <Text style={styles.sectionTitle}>Your Progress</Text>
                
                <View style={styles.progressContainer}>
                    {progressData.map((item, index) => (
                        <View key={index} style={styles.progressCard}>
                            <View style={styles.progressHeader}>
                                <View style={[styles.iconContainer, { backgroundColor: `${item.color}20` }]}>
                                    <MaterialIcons 
                                        name={item.icon as any} 
                                        size={24} 
                                        color={item.color} 
                                    />
                                </View>
                                <View style={styles.progressInfo}>
                                    <Text style={styles.progressTitle}>{item.title}</Text>
                                    <Text style={styles.progressDescription}>{item.description}</Text>
                                </View>
                            </View>
                            <Text style={[styles.progressValue, { color: item.color }]}>
                                {item.value}
                            </Text>
                        </View>
                    ))}
                </View>

                
            </ScrollView>

            <Navbar activeRoute="Profile" />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'ios' ? 50 : 35,
        paddingBottom: 20,
        backgroundColor: "#F5E1FD",
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    titleSection: {
        flex: 1,
    },
    settingsTitle: {
        fontSize: 32,
        color: '#6A009C',
        fontFamily: 'Inter-Bold',
    },
    settingsDescription: {
        fontSize: 14,
        color: '#666',
        fontFamily: 'Inter-Medium',
        marginTop: 4,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: '#FF5722',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    logoutText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#FF5722',
        fontFamily: 'Inter-Medium',
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    profilePicContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        overflow: 'hidden',
    },
    profilePic: {
        width: '100%',
        height: '100%',
        borderRadius: 40,
    },
    defaultProfilePic: {
        width: '100%',
        height: '100%',
        borderRadius: 40,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 24,
        color: '#1E293B',
        fontFamily: 'Inter-Bold',
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 16,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
        marginBottom: 2,
    },
    joinDate: {
        fontSize: 14,
        color: '#adb5bd',
        fontFamily: 'Inter-Regular',
    },
    editButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 100,
    },
    sectionTitle: {
        fontSize: 20,
        color: '#1E293B',
        fontFamily: 'Inter-Bold',
        marginBottom: 16,
        marginTop: 8,
    },
    progressContainer: {
        gap: 12,
        marginBottom: 32,
    },
    progressCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    progressHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    progressInfo: {
        flex: 1,
    },
    progressTitle: {
        fontSize: 16,
        color: '#1E293B',
        fontFamily: 'Inter-SemiBold',
        marginBottom: 4,
    },
    progressDescription: {
        fontSize: 14,
        color: '#6c757d',
        fontFamily: 'Inter-Regular',
    },
    progressValue: {
        fontSize: 28,
        fontFamily: 'Inter-Bold',
    },
    quickActionsContainer: {
        gap: 12,
        marginBottom: 32,
    },
    quickActionCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    quickActionIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#f0e6ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    quickActionTitle: {
        fontSize: 18,
        color: '#1E293B',
        fontFamily: 'Inter-Bold',
        marginBottom: 4,
        flex: 1,
    },
    quickActionDescription: {
        fontSize: 14,
        color: '#6c757d',
        fontFamily: 'Inter-Regular',
        flex: 2,
        marginRight: 12,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 18,
        color: '#6A009C',
        fontFamily: 'Inter-Medium',
    },
});

export default Profile;
