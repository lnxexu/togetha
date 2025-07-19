// import { Entypo, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
// import { useNavigation, useRoute } from '@react-navigation/native';
// import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
// import React, { JSX, useState, useEffect } from 'react';
// import {
//   Alert,
//   ScrollView,
//   StyleSheet,
//   Text,
//   TouchableOpacity,
//   View,
//   ActivityIndicator
// } from 'react-native';
// import { Dropdown } from 'react-native-element-dropdown';
// import type { RootStackParamList } from '../navigation/AppNavigator';

// interface CourseOption {
//   label: string;
//   value: string;
// }

// type OnboardingRouteParams = {
//   userEmail: string;
//   userName: string;
// };

// interface ContentPreferenceOption {
//   label: string;
//   value: string;
// }

// const API_BASE_URL = 'http://127.0.0.1:8000';

// const courseData: CourseOption[] = [
//   { label: 'Nursing', value: 'nursing' },
//   { label: 'Pharmacy', value: 'pharmacy' },
//   { label: 'Medical Technology', value: 'medtech' },
// ];

// const contentPreferences: ContentPreferenceOption[] = [
//   { label: 'Video Lectures', value: 'video_lectures' },
//   { label: 'E-books', value: 'e_books' },
//   { label: 'Podcasts', value: 'podcasts' },
// ];

// const contentPreferenceIcons: Record<string, JSX.Element> = {
//   video_lectures: <MaterialCommunityIcons name="video" size={24} />,
//   e_books: <FontAwesome5 name="book" size={24} />,
//   podcasts: <Entypo name="mic" size={24} />
// };

// const PostSignupOnboardingScreen: React.FC = () => {
//   const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
//   const route = useRoute();
//   const params = route.params as OnboardingRouteParams | undefined;
//   const userEmail = params?.userEmail;
//   const userName = params?.userName;

//   const [selectedCourse, setSelectedCourse] = useState<string | undefined>(undefined);
//   const [selectedContentPreferences, setSelectedContentPreferences] = useState<string[]>([]);
//   const [isSubmitting, setIsSubmitting] = useState(false);

//   useEffect(() => {
//     if (!userEmail || !userName) {
//       Alert.alert(
//         'Missing Information',
//         'Required user information is missing. Please sign up again.',
//         [
//           {
//             text: 'Go to Sign Up',
//             onPress: () => navigation.navigate('Signup')
//           }
//         ]
//       );
//     }
//   }, [userEmail, userName, navigation]);

//   const handleContentPreferenceSelect = (value: string) => {
//     setSelectedContentPreferences((prev) => {
//       if (prev.includes(value)) {
//         return prev.filter((item) => item !== value);
//       } else {
//         return [...prev, value];
//       }
//     });
//   };

//   const handleFinishOnboarding = async () => {
//     if (!selectedCourse) {
//       Alert.alert('Selection Required', 'Please select your preferred health science course.');
//       return;
//     }
//     if (selectedContentPreferences.length === 0) {
//       Alert.alert('Selection Required', 'Please choose at least one content preference.');
//       return;
//     }

//     setIsSubmitting(true);

//     try {
//       // Send the preferences to backend
//       const response = await fetch(`${API_BASE_URL}/users/api/update-preferences/`, {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({
//           user_email: userEmail,
//           course: selectedCourse,
//           content_preferences: selectedContentPreferences
//         }),
//       });

//       if (!response.ok) {
//         const errorText = await response.text();
//         console.error('Server error:', errorText);
//         throw new Error(`HTTP error! status: ${response.status}`);
//       }

//       const data = await response.json();

//       if (data.success) {
//         // Navigate to Home after successful preference update
//         navigation.navigate('Home');
//       } else {
//         Alert.alert('Error', data.message || 'Failed to save preferences');
//       }
//     } catch (error) {
//       console.error('Error saving preferences:', error);
//       Alert.alert('Network Error', 'Please check your connection and try again.');
//     } finally {
//       setIsSubmitting(false);
//     }
//   };

//   return (
//     <View style={styles.wrapper}>
//       <ScrollView
//         style={{ backgroundColor: '#F1D3FF' }}
//         contentContainerStyle={styles.scrollContainer}>
//         <View style={styles.container}>
//           <Text style={styles.appName}>Togetha</Text>
//           <Text style={styles.header}>Let's personalize your experience</Text>

//           <Text style={styles.subHeader}>Choose your program:</Text>
//           <Dropdown
//             style={styles.dropdown}
//             placeholderStyle={styles.placeholderStyle}
//             selectedTextStyle={styles.selectedTextStyle}
//             iconStyle={styles.iconStyle}
//             data={courseData}
//             maxHeight={300}
//             labelField="label"
//             valueField="value"
//             placeholder="Select course"
//             value={selectedCourse}
//             onChange={(item: CourseOption) => setSelectedCourse(item.value)}
//             renderItem={(item: CourseOption) => (
//               <View style={styles.item} key={item.value}>
//                 <Text style={styles.textItem}>{item.label}</Text>
//               </View>
//             )}
//           />

//           <Text style={styles.subHeader}>Choose your preferences</Text>
//           <Text style={styles.description}>
//             Please select your preferred mode of learning. Your selection will help the platform tailor academic content to your preferred learning style.
//           </Text>

//           <View style={styles.contentPreferenceContainer}>
//             {contentPreferences.map((option) => {
//               const isSelected = selectedContentPreferences.includes(option.value);
//               return (
//                 <TouchableOpacity
//                   key={option.value}
//                   style={[
//                     styles.preferenceButton,
//                     isSelected && styles.preferenceButtonSelected,
//                   ]}
//                   onPress={() => handleContentPreferenceSelect(option.value)}
//                 >
//                   <View style={styles.iconWithLabel}>
//                     {React.cloneElement(contentPreferenceIcons[option.value], {
//                       color: isSelected ? '#fff' : '#6A009C',
//                     })}
//                     <Text
//                       style={[
//                         styles.preferenceButtonText,
//                         isSelected && styles.preferenceButtonTextSelected,
//                       ]}
//                     >
//                       {option.label}
//                     </Text>
//                   </View>
//                 </TouchableOpacity>
//               );
//             })}
//           </View>
//         </View>
//       </ScrollView>

//       <TouchableOpacity
//         style={styles.fixedFinishButton}
//         onPress={handleFinishOnboarding}
//         disabled={isSubmitting}
//       >
//         {isSubmitting ? (
//           <ActivityIndicator color="#fff" />
//         ) : (
//           <Text style={styles.finishButtonText}>Proceed</Text>
//         )}
//       </TouchableOpacity>
//     </View>
//   );
// };

// const styles = StyleSheet.create({
//   scrollContainer: {
//     flexGrow: 1,
//     justifyContent: 'center',
//     paddingVertical: 20,
//     backgroundColor: '#F1D3FF',
//   },
//   container: {
//     flex: 1,
//     padding: 20,
//     justifyContent: 'center',
//   },
//   appName: {
//     fontSize: 32,
//     color: '#6A009C',
//     textAlign: 'center',
//     marginBottom: 10,
//     fontFamily: 'Lexend',
//   },
//   header: {
//     fontSize: 15,
//     fontFamily: 'Inter-Medium',
//     marginBottom: 20,
//     color: '#333',
//     textAlign: 'center',
//   },
//   subHeader: {
//     fontSize: 16,
//     fontFamily: 'Inter-Bold',
//     marginTop: 20,
//     marginBottom: 5,
//     letterSpacing: 0.5,
//     color: '#6A009C',
//     textAlign: 'left',
//   },
//   description: {
//     fontSize: 14,
//     fontFamily: 'Inter-Regular',
//     color: '#555',
//     marginBottom: 10,
//     marginTop: 5,
//   },
//   dropdown: {
//     height: 50,
//     borderColor: 'gray',
//     borderWidth: 0.5,
//     borderRadius: 30,
//     paddingHorizontal: 20,
//     backgroundColor: '#fff',
//   },
//   placeholderStyle: {
//     fontSize: 16,
//     color: '#6A009C',
//     fontFamily: 'Inter-Medium',
//   },
//   selectedTextStyle: {
//     fontSize: 16,
//     color: '#6A009C',
//     fontFamily: 'Inter-Bold',
//   },
//   iconStyle: {
//     width: 20,
//     height: 20,
//   },
//   item: {
//     paddingVertical: 17,
//     paddingHorizontal: 20,
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//   },
//   textItem: {
//     flex: 1,
//     fontSize: 16,
//     fontFamily: 'Inter-Regular',
//   },
//   contentPreferenceContainer: {
//     flexDirection: 'row',
//     flexWrap: 'wrap',
//     justifyContent: 'center',
//     marginTop: 10,
//   },
//   preferenceButton: {
//     borderWidth: 1,
//     borderColor: '#ffffffff',
//     paddingVertical: 10,
//     paddingHorizontal: 15,
//     borderRadius: 20,
//     margin: 5,
//     backgroundColor: '#fff',
//   },
//   preferenceButtonSelected: {
//     backgroundColor: '#6A009C',
//   },
//   preferenceButtonText: {
//     color: '#6A009C',
//     fontSize: 14,
//     fontFamily: 'Inter-Medium',
//   },
//   preferenceButtonTextSelected: {
//     color: '#fff',
//   },
//   finishButton: {
//     backgroundColor: '#A32EDA',
//     paddingVertical: 15,
//     borderRadius: 25,
//     marginTop: 40,
//     paddingHorizontal: 20,
//     alignSelf: 'center',
//   },
//   finishButtonText: {
//     color: '#fff',
//     fontSize: 18,
//     fontWeight: 'bold',
//   },
//   wrapper: {
//     flex: 1,
//     backgroundColor: '#F1D3FF',
//   },
//   fixedFinishButton: {
//     position: 'absolute',
//     bottom: 50,
//     left: 20,
//     right: 20,
//     backgroundColor: '#A32EDA',
//     paddingVertical: 15,
//     borderRadius: 25,
//     alignItems: 'center',
//   },
//   iconWithLabel: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//   },
// });

// // Add this export at the end of the file
// export default PostSignupOnboardingScreen;