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

const EditProfile: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const [userData, setUserData] = useState<UserProfile | null>(null);
    const [originalData, setOriginalData] = useState<UserProfile | null>(null);
    const [isEditing, setIsEditing] = useState(false);

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
            setOriginalData(profile);
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    };

    const handleSave = async () => {
        if (!userData) return;

        try {
            const success = await userService.updateUserProfile(userData);
            if (success) {
                setIsEditing(false);
                setOriginalData(userData);
                Alert.alert('Success', 'Profile updated successfully!');
            } else {
                Alert.alert('Error', 'Failed to update profile. Please try again.');
            }
        } catch (error) {
            console.error('Error saving profile:', error);
            Alert.alert('Error', 'Failed to update profile. Please try again.');
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setUserData(originalData);
    };

    const handleChangeProfilePicture = () => {
        // Implement image picker logic here
        Alert.alert('Change Profile Picture', 'This feature will be implemented soon!');
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
    }

    const updateUserField = (field: keyof UserProfile, value: any) => {
        if (userData) {
            setUserData({ ...userData, [field]: value });
        }
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
                
                <Text style={styles.title}>Edit Profile</Text>
                
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={isEditing ? handleSave : () => setIsEditing(true)}
                >
                    <MaterialIcons 
                        name={isEditing ? "check" : "edit"} 
                        size={24} 
                        color="#6A009C" 
                    />
                </TouchableOpacity>
            </View>

            {/* Content */}
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Profile Picture Section */}
                <View style={styles.profilePictureSection}>
                    <View style={styles.profilePicContainer}>
                        {userData.profilePicture ? (
                            <Image 
                                source={{ uri: userData.profilePicture }} 
                                style={styles.profilePic}
                            />
                        ) : (
                            <View style={styles.defaultProfilePic}>
                                <MaterialIcons name="person" size={60} color="#6A009C" />
                            </View>
                        )}
                    </View>
                    
                    {isEditing && (
                        <TouchableOpacity
                            style={styles.changePictureButton}
                            onPress={handleChangeProfilePicture}
                        >
                            <MaterialIcons name="camera-alt" size={20} color="#6A009C" />
                            <Text style={styles.changePictureText}>Change Picture</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Form Fields */}
                <View style={styles.formContainer}>
                    <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Full Name</Text>
                        <TextInput
                            style={[styles.textInput, !isEditing && styles.disabledInput]}
                            value={userData.name}
                            onChangeText={(text) => updateUserField('name', text)}
                            editable={isEditing}
                            placeholder="Enter your full name"
                        />
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Email</Text>
                        <TextInput
                            style={[styles.textInput, !isEditing && styles.disabledInput]}
                            value={userData.email}
                            onChangeText={(text) => updateUserField('email', text)}
                            editable={isEditing}
                            placeholder="Enter your email"
                            keyboardType="email-address"
                        />
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Phone Number</Text>
                        <TextInput
                            style={[styles.textInput, !isEditing && styles.disabledInput]}
                            value={userData.phone || ''}
                            onChangeText={(text) => updateUserField('phone', text)}
                            editable={isEditing}
                            placeholder="Enter your phone number"
                            keyboardType="phone-pad"
                        />
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Location</Text>
                        <TextInput
                            style={[styles.textInput, !isEditing && styles.disabledInput]}
                            value={userData.location || ''}
                            onChangeText={(text) => updateUserField('location', text)}
                            editable={isEditing}
                            placeholder="Enter your location"
                        />
                    </View>

                    <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>Bio</Text>
                        <TextInput
                            style={[styles.textAreaInput, !isEditing && styles.disabledInput]}
                            value={userData.bio || ''}
                            onChangeText={(text) => updateUserField('bio', text)}
                            editable={isEditing}
                            placeholder="Tell us about yourself"
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </View>
                </View>

                {/* Action Buttons */}
                {isEditing && (
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.button, styles.cancelButton]}
                            onPress={handleCancel}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                            style={[styles.button, styles.saveButton]}
                            onPress={handleSave}
                        >
                            <Text style={styles.saveButtonText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                )}
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
    actionButton: {
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
    },
    profilePictureSection: {
        alignItems: 'center',
        marginBottom: 32,
    },
    profilePicContainer: {
        width: 120,
        height: 120,
        borderRadius: 60,
        overflow: 'hidden',
        marginBottom: 16,
    },
    profilePic: {
        width: '100%',
        height: '100%',
        borderRadius: 60,
    },
    defaultProfilePic: {
        width: '100%',
        height: '100%',
        borderRadius: 60,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    changePictureButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    changePictureText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#6A009C',
        fontFamily: 'Inter-Medium',
    },
    formContainer: {
        gap: 20,
        marginBottom: 32,
    },
    fieldContainer: {
        gap: 8,
    },
    fieldLabel: {
        fontSize: 16,
        color: '#1E293B',
        fontFamily: 'Inter-SemiBold',
    },
    textInput: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1E293B',
        fontFamily: 'Inter-Regular',
        borderWidth: 1,
        borderColor: '#e9ecef',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    textAreaInput: {
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: '#1E293B',
        fontFamily: 'Inter-Regular',
        borderWidth: 1,
        borderColor: '#e9ecef',
        minHeight: 100,
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    disabledInput: {
        backgroundColor: '#f8f9fa',
        color: '#6c757d',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    button: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cancelButton: {
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#e9ecef',
    },
    saveButton: {
        backgroundColor: '#6A009C',
    },
    cancelButtonText: {
        fontSize: 16,
        color: '#6c757d',
        fontFamily: 'Inter-SemiBold',
    },
    saveButtonText: {
        fontSize: 16,
        color: '#fff',
        fontFamily: 'Inter-SemiBold',
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

export default EditProfile;
