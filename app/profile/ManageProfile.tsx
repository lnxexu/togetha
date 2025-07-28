import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    TextInput,
    Image,
    ScrollView,
    Platform,
    Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { userService, UserProfile } from './services/userService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ManageProfile: React.FC = () => {
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

    const handleEditProfile = () => {
        navigation.navigate('EditProfile');
    };

    const handleChangeProfilePicture = () => {
        // Implement image picker logic here
        Alert.alert('Change Profile Picture', 'This feature will be implemented soon!');
    };

    const handleClearCache = () => {
        Alert.alert(
            'Clear Cache',
            'This will clear app cache and temporary files. Continue?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => {
                    Alert.alert('Success', 'Cache cleared successfully!');
                }}
            ]
        );
    };

    const handleExportData = () => {
        Alert.alert('Export Data', 'Your data export will be available soon!');
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'This action cannot be undone. All your data will be permanently deleted.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => {
                    Alert.alert('Account Deletion', 'This feature will be implemented with proper authentication.');
                }}
            ]
        );
    };

    // Show loading state if userData is not loaded
    if (!userData) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <MaterialIcons name="arrow-back" size={24} color="#6A009C" />
                </TouchableOpacity>
                
                <Text style={styles.title}>My Profile</Text>
                
                <View style={styles.placeholder} />
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Profile Summary */}
                <View style={styles.profileSummary}>
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
                    
                    <View style={styles.profileSummaryInfo}>
                        <Text style={styles.profileName}>{userData.name}</Text>
                        <Text style={styles.profileEmail}>{userData.email}</Text>
                        <Text style={styles.profileJoinDate}>Member since {userData.joinDate}</Text>
                    </View>
                </View>

                {/* Profile Actions */}
                <Text style={styles.sectionTitle}>Profile Management</Text>
                
                <View style={styles.settingsContainer}>
                    <TouchableOpacity 
                        style={styles.settingItem}
                        onPress={handleEditProfile}
                    >
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="edit" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Edit Profile</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.settingItem}
                        onPress={handleChangeProfilePicture}
                    >
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="photo-camera" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Change Profile Picture</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>
                </View>

                {/* Account Settings */}
                <Text style={styles.sectionTitle}>Account Settings</Text>
                
                <View style={styles.settingsContainer}>
                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="notifications" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Notifications</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="security" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Privacy & Security</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="lock" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Change Password</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>
                </View>

                {/* App Settings */}
                <Text style={styles.sectionTitle}>App Settings</Text>
                
                <View style={styles.settingsContainer}>
                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="language" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Language</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="dark-mode" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Theme</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity 
                        style={styles.settingItem}
                        onPress={handleClearCache}
                    >
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="clear-all" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Clear Cache</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>
                </View>

                {/* Data & Support */}
                <Text style={styles.sectionTitle}>Data & Support</Text>
                
                <View style={styles.settingsContainer}>
                    <TouchableOpacity 
                        style={styles.settingItem}
                        onPress={handleExportData}
                    >
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="download" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Export Data</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="help" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>Help & Support</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.settingItem}>
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="info" size={24} color="#6A009C" />
                            <Text style={styles.settingText}>About</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
                    </TouchableOpacity>
                </View>

                {/* Danger Zone */}
                <Text style={styles.sectionTitle}>Danger Zone</Text>
                
                <View style={styles.settingsContainer}>
                    <TouchableOpacity 
                        style={[styles.settingItem, styles.dangerItem]}
                        onPress={handleDeleteAccount}
                    >
                        <View style={styles.settingLeft}>
                            <MaterialIcons name="delete-forever" size={24} color="#FF5722" />
                            <Text style={[styles.settingText, styles.dangerText]}>Delete Account</Text>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color="#FF5722" />
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: Platform.OS === 'ios' ? 50 : 35,
        paddingBottom: 20,
        backgroundColor: "rgba(248, 250, 252, 0.95)",
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    backButton: {
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
    title: {
        fontSize: 24,
        color: '#6A009C',
        fontFamily: 'Inter-Bold',
    },
    placeholder: {
        width: 44,
        height: 44,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    profileSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    profilePicContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        overflow: 'hidden',
        marginRight: 16,
    },
    profilePic: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
    },
    defaultProfilePic: {
        width: '100%',
        height: '100%',
        borderRadius: 30,
        backgroundColor: '#f0e6ff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileSummaryInfo: {
        flex: 1,
    },
    profileName: {
        fontSize: 18,
        color: '#1E293B',
        fontFamily: 'Inter-Bold',
        marginBottom: 2,
    },
    profileEmail: {
        fontSize: 14,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
        marginBottom: 2,
    },
    profileJoinDate: {
        fontSize: 12,
        color: '#adb5bd',
        fontFamily: 'Inter-Regular',
    },
    sectionTitle: {
        fontSize: 20,
        color: '#1E293B',
        fontFamily: 'Inter-Bold',
        marginBottom: 16,
        marginTop: 8,
    },
    settingsContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 24,
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    settingItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f8f9fa',
    },
    settingLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingText: {
        marginLeft: 16,
        fontSize: 16,
        color: '#1E293B',
        fontFamily: 'Inter-Medium',
    },
    dangerItem: {
        borderWidth: 1,
        borderColor: '#ffebee',
    },
    dangerText: {
        color: '#FF5722',
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

export default ManageProfile;
