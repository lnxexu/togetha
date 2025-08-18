import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import WelcomeScreen from '../onboarding/Welcome';
import LoginScreen from '../onboarding/signin';
import SignupScreen from '../onboarding/signup';

//main pages
import ChatBot from '../chatbot/AI';
import Home from '../home';
import NotesScreen from '../note-taking/notes';
import ToDo from '../task-management/ToDo';
import AllItemsView from '../AllItemsView';
import Notifications from '../notifications/notifications';
import Logs from '../logs/logs';

//note-taking components
import ImportPDFPage from '../note-taking/ImportPDFPage';
import NewNoteEditor from '../note-taking/NewNoteEditor';
import { DrawingEditor } from '../note-taking';

//task management components
import AddTask from '../task-management/AddTask';
import TaskDetails from '../task-management/TaskDetails';
import EisenhowerListPage from '../task-management/EisenhowerListPage';

//profile components
import Profile from '../profile/Profile';
import ManageProfile from '../profile/ManageProfile';
import EditProfile from '../profile/EditProfile';
import HelpSupport from '../profile/HelpSupport';
import About from '../profile/About';

export type RootStackParamList = {
  Welcome: undefined;
  Signup: undefined;
  Login: undefined;
  Home: undefined;
  Notes: undefined;
  Notifications: undefined;
  NoteEditor: {
    noteId?: string;
    initialNote?: {
      title: string;
      content: string;
      formatted_content?: string; // Add formatted_content field
      subject?: string;
      linkedTask?: string;
      tags?: string[];
      attachments?: any[];
      createdAt?: string;
      updatedAt?: string;
      folderId?: string | null; // Optional folderId for note organization
    };
  
  } | undefined;
  ToDo: undefined;
  TaskDetails: {
    taskId: string;
  };
  AddTask: {
    quadrant?: 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important';
  };
  editTaskId: { editTaskId: string } | undefined;
  AllItemsView: {
    viewType: 'tasks' | 'activity';
  };
  EisenhowerList: {
    tasks: any[];
    quadrant: string;
    onTaskPress?: (taskId: string) => void;
    onAddTask?: () => void;
    onEditTask?: (taskId: string) => void;
    onDeleteTask?: (taskId: string) => void;
    onMarkComplete?: (taskId: string) => void;
    onViewAll?: () => void;
  };
  PDFs: undefined;
  RINA: undefined;
  DrawingEditor: {
    initialSetup?: {
      title: string;
      size: string;
      orientation: string;
      template: string;
      dimensions: string;
    };
  } | undefined;
  Profile: undefined;
  ManageProfile: undefined;
  EditProfile: undefined;
  HelpSupport: undefined;
  About: undefined;
  Logs: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();


// Custom toast configuration
const toastConfig = {
  success: (props: any) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: '#22C55E',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderLeftWidth: 4,
        height: 65,
        marginHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        flex: 1,
        justifyContent: 'center',
      }}
      text1Style={{
        fontSize: 15,
        fontWeight: '700',
        color: '#16A34A',
        fontFamily: 'Inter-Bold',
        marginBottom: 2,
      }}
      text2Style={{
        fontSize: 13,
        color: '#374151',
        fontFamily: 'Inter-Regular',
        lineHeight: 18,
      }}
      renderLeadingIcon={() => (
        <View style={{ justifyContent: 'center', paddingLeft: 12 }}>
          <Ionicons name="checkmark-circle" size={22} color="#22C55E" />
        </View>
      )}
    />
  ),
  error: (props: any) => (
    <ErrorToast
      {...props}
      style={{
        borderLeftColor: '#EF4444',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderLeftWidth: 4,
        height: 65,
        marginHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        flex: 1,
        justifyContent: 'center',
      }}
      text1Style={{
        fontSize: 15,
        fontWeight: '700',
        color: '#DC2626',
        fontFamily: 'Inter-Bold',
        marginBottom: 2,
      }}
      text2Style={{
        fontSize: 13,
        color: '#374151',
        fontFamily: 'Inter-Regular',
        lineHeight: 18,
      }}
      renderLeadingIcon={() => (
        <View style={{ justifyContent: 'center', paddingLeft: 12 }}>
          <Ionicons name="close-circle" size={22} color="#EF4444" />
        </View>
      )}
    />
  ),
  info: (props: any) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: '#3B82F6',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderLeftWidth: 4,
        height: 65,
        marginHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        flex: 1,
        justifyContent: 'center',
      }}
      text1Style={{
        fontSize: 15,
        fontWeight: '700',
        color: '#2563EB',
        fontFamily: 'Inter-Bold',
        marginBottom: 2,
      }}
      text2Style={{
        fontSize: 13,
        color: '#374151',
        fontFamily: 'Inter-Regular',
        lineHeight: 18,
      }}
      renderLeadingIcon={() => (
        <View style={{ justifyContent: 'center', paddingLeft: 12 }}>
          <Ionicons name="information-circle" size={22} color="#3B82F6" />
        </View>
      )}
    />
  ),
  warning: (props: any) => (
    <BaseToast
      {...props}
      style={{
        borderLeftColor: '#F59E0B',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderLeftWidth: 4,
        height: 65,
        marginHorizontal: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        flex: 1,
        justifyContent: 'center',
      }}
      text1Style={{
        fontSize: 15,
        fontWeight: '700',
        color: '#D97706',
        fontFamily: 'Inter-Bold',
        marginBottom: 2,
      }}
      text2Style={{
        fontSize: 13,
        color: '#374151',
        fontFamily: 'Inter-Regular',
        lineHeight: 18,
      }}
      renderLeadingIcon={() => (
        <View style={{ justifyContent: 'center', paddingLeft: 12 }}>
          <Ionicons name="warning" size={22} color="#F59E0B" />
        </View>
      )}
    />
  ),
};

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Welcome"
        screenOptions={{ headerShown: false, animation: 'none' }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />

        {/* Main Screens */}
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="Notes" component={NotesScreen} />
        <Stack.Screen name="Notifications" component={Notifications} />
        <Stack.Screen name="ToDo" component={ToDo} />
        <Stack.Screen name="RINA" component={ChatBot} />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen name="Logs" component={Logs} /> 

        {/* Profile components */}
        <Stack.Screen name="ManageProfile" component={ManageProfile} />
        <Stack.Screen name="EditProfile" component={EditProfile} />
        <Stack.Screen name="HelpSupport" component={HelpSupport} />
        <Stack.Screen name="About" component={About} />


        {/* Note Taking components */}
        <Stack.Screen name="NoteEditor" component={NewNoteEditor} />
        <Stack.Screen name="PDFs" component={ImportPDFPage} />
        <Stack.Screen name="DrawingEditor" component={DrawingEditor} />

        {/* Task Management components */}
        <Stack.Screen name="TaskDetails" component={TaskDetails} />
        <Stack.Screen name="AddTask" component={AddTask} />
        <Stack.Screen name="editTaskId" component={AddTask} />
        <Stack.Screen name="EisenhowerList" component={EisenhowerListPage} />
        <Stack.Screen name="AllItemsView" component={AllItemsView}/>
        
      </Stack.Navigator>
      <Toast config={toastConfig} />
    </NavigationContainer>
  );
};

export default AppNavigator;