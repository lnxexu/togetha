import React, { useState, useCallback } from "react";
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
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { userService, UserProfile } from "./services/userService";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "@/constants/ApiConfig";
import { Picker } from "@react-native-picker/picker";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const EditProfile: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [originalData, setOriginalData] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load user data when screen is focused
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener("focus", () => {
        loadUserData();
      });
      return unsubscribe;
    }, [navigation])
  );

  const loadUserData = async () => {
    try {
      // Clear cache to ensure fresh data
      await userService.clearProfileCache();

      // Get fresh data from endpoint
      const userInfo = await userService.getUserInfo(true);
      console.log("Profile picture path:", userInfo.profile?.profile_picture);

      // Properly combine profile data ensuring all fields are preserved
      const profile = {
        ...userInfo,
      };

      setUserData(profile);
      setOriginalData(profile);
    } catch (error) {
      console.error("Error loading user data:", error);
      Alert.alert("Error", "Failed to load profile data. Please try again.");
    }
  };

  const handleSave = async () => {
    if (!userData) return;

    try {
      const updatedProfile = await userService.updateUserProfile(userData);
      setIsEditing(false);
      setUserData(updatedProfile);
      setOriginalData(updatedProfile);

      // Store updated fields in AsyncStorage for other screens
      if (updatedProfile.profile?.full_name) {
        await AsyncStorage.setItem(
          "userName",
          updatedProfile.profile.full_name
        );
      }

      if (updatedProfile.username) {
        await AsyncStorage.setItem("username", updatedProfile.username);
      }

      if (updatedProfile.profile?.profile_picture) {
        await AsyncStorage.setItem(
          "userProfilePicture",
          updatedProfile.profile.profile_picture
        );
      }

      // Force a refresh of the profile data in cache
      await userService.clearProfileCache();

      Alert.alert("Success", "Profile updated successfully!", [
        {
          text: "OK",
          onPress: () => {
            // Return to profile screen after successful update
            navigation.navigate("Profile");
          },
        },
      ]);
    } catch (error) {
      console.error("Error saving profile:", error);
      Alert.alert("Error", "Failed to update profile. Please try again.");
    }
  };

  const formatBirthdate = (dateString?: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; 
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleCancel = () => {
    setIsEditing(false);
    setUserData(originalData);
  };

  const handleChangeProfilePicture = async () => {
    try {
      // Debug: Check if token exists before proceeding
      const debugToken = await userService.getAuthToken();
      console.log("Debug - Auth token available:", !!debugToken);

      // Request permission to access the photo library
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photo library to change your profile picture."
        );
        return;
      }

      // Launch the image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];

        // Create a new FormData object
        const formData = new FormData();

        // Add the image to the form data
        formData.append("profile_picture", {
          uri: selectedImage.uri,
          name: selectedImage.fileName || "profile-picture.jpg",
          type: "image/jpeg",
        } as any);

        // Show loading indicator or disable buttons
        setIsEditing(false);

        try {
          // Upload the image
          const updatedProfile = await userService.updateProfilePicture(
            formData
          );

          // Update the local state
          setUserData({
            ...userData,
            profile: {
              ...userData?.profile,
              profile_picture: updatedProfile.profile?.profile_picture,
            },
          });
          setOriginalData({
            ...originalData,
            profile: {
              ...originalData?.profile,
              profile_picture: updatedProfile.profile?.profile_picture,
            },
          });

          await AsyncStorage.setItem(
            "userProfilePicture",
            updatedProfile.profile?.profile_picture ?? ""
          );

          Alert.alert("Success", "Profile picture updated successfully!");
        } catch (error) {
          console.error("Error:", error);
          Alert.alert(
            "Error",
            "Failed to update profile picture. Please try again."
          );
        }
      }
    } catch (error) {
      console.error("Error changing profile picture:", error);
      Alert.alert(
        "Error",
        "Failed to update profile picture. Please try again."
      );
    }
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
        <View style={styles.profilePictureSection}>
          <View style={styles.profilePicContainer}>
            {userData.profile?.profile_picture ? (
              <Image
                source={{
                  uri: userData.profile.profile_picture.startsWith("http")
                    ? userData.profile.profile_picture
                    : `${API_URL}${userData.profile.profile_picture}`,
                }}
                style={styles.profilePic}
                onError={(e) =>
                  console.log("Image loading error:", e.nativeEvent.error)
                }
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
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={userData.username}
              onChangeText={(text) => updateUserField("username", text)}
              editable={isEditing}
              placeholder="Enter your desired username"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={userData.profile?.full_name}
              onChangeText={(text) => {
                if (userData) {
                  setUserData({
                    ...userData,
                    profile: {
                      ...userData.profile,
                      full_name: text,
                    },
                  });
                }
              }}
              editable={isEditing}
              placeholder="Enter your full name"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={userData.email}
              onChangeText={(text) => updateUserField("email", text)}
              editable={isEditing}
              placeholder="Enter your email"
              keyboardType="email-address"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Phone Number</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={userData.profile?.phone_number || ""}
              onChangeText={(text) => {
                if (userData) {
                  setUserData({
                    ...userData,
                    profile: {
                      ...userData.profile,
                      phone_number: text,
                    },
                  });
                }
              }}
              editable={isEditing}
              placeholder="Enter your phone_number number"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Gender</Text>
            {isEditing ? (
              <View style={[styles.picker, styles.textInput, !isEditing && styles.disabledInput]}>
                <Picker
                  selectedValue={userData.profile?.gender || ""}
                  onValueChange={(itemValue) => {
                    if (userData) {
                      setUserData({
                        ...userData,
                        profile: {
                          ...userData.profile,
                          gender: itemValue,
                        },
                      });
                    }
                  }}
                  enabled={isEditing}
                >
                  <Picker.Item label="Select gender" value="" />
                  <Picker.Item label="Male" value="Male" />
                  <Picker.Item label="Female" value="Female" />
                  <Picker.Item label="Non-binary" value="Non-binary" />
                  <Picker.Item
                    label="Prefer not to say"
                    value="Prefer not to say"
                  />
                  <Picker.Item label="Other" value="Other" />
                </Picker>
              </View>
            ) : (
              <Text style={styles.textInput}>
                {userData.profile?.gender || ""}
              </Text>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Birthdate</Text>
            {isEditing ? (
              <TextInput
                style={[styles.textInput, !isEditing && styles.disabledInput]}
                value={userData.profile?.birthdate || ""}
                onChangeText={(text) => {
                  if (userData) {
                    setUserData({
                      ...userData,
                      profile: {
                        ...userData.profile,
                        birthdate: text,
                      },
                    });
                  }
                }}
                editable={isEditing}
                placeholder="YYYY-MM-DD"
                keyboardType="numeric"
              />
            ) : (
              <Text style={styles.textInput}>
                {formatBirthdate(userData.profile?.birthdate)}
              </Text>
            )}
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={userData.profile?.location || ""}
              onChangeText={(text) => {
                if (userData) {
                  setUserData({
                    ...userData,
                    profile: {
                      ...userData.profile,
                      location: text,
                    },
                  });
                }
              }}
              editable={isEditing}
              placeholder="Enter your location"
            />
          </View>

          <View style={styles.fieldContainer}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              style={[styles.textAreaInput, !isEditing && styles.disabledInput]}
              value={userData.profile?.bio || ""}
              onChangeText={(text) => {
                if (userData) {
                  setUserData({
                    ...userData,
                    profile: {
                      ...userData.profile,
                      bio: text,
                    },
                  });
                }
              }}
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
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
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
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    color: "#6A009C",
    fontFamily: "Inter-Bold",
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1E293B",
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
    alignItems: "center",
    marginBottom: 32,
  },
  profilePicContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: "hidden",
    marginBottom: 16,
  },
  profilePic: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
  },
  defaultProfilePic: {
    width: "100%",
    height: "100%",
    borderRadius: 60,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  changePictureButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  changePictureText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
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
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
  },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  textAreaInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
    borderWidth: 1,
    borderColor: "#e9ecef",
    minHeight: 100,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  disabledInput: {
    backgroundColor: "#f8f9fa",
    color: "#6c757d",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 32,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#e9ecef",
  },
  saveButton: {
    backgroundColor: "#6A009C",
  },
  cancelButtonText: {
    fontSize: 16,
    color: "#6c757d",
    fontFamily: "Inter-SemiBold",
  },
  saveButtonText: {
    fontSize: 16,
    color: "#fff",
    fontFamily: "Inter-SemiBold",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
  },
  picker: {
    height: 'auto',
    width: "100%",
    padding: 0
  },
});

export default EditProfile;
