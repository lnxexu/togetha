import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import ChatBot from '../chatbot/AI';
import Home from '../home';
import NewNoteEditor from '../note-taking/NewNoteEditor';
import NotesScreen from '../note-taking/notes';
import LoginScreen from '../onboarding/signin';
import SignupScreen from '../onboarding/signup';
import WelcomeScreen from '../onboarding/Welcome';
import ToDo from '../task-management/ToDo';
import AddTask from '../task-management/AddTask';
import TaskDetails from '../task-management/TaskDetails';

export type RootStackParamList = {
  Welcome: undefined;
  Signup: undefined;
  Login: undefined;
  Home: undefined;
  Notes: undefined;
  NoteEditor: {
    noteId?: string;
    initialNote?: {
      title: string;
      content: string;
      subject?: string;
      linkedTask?: string;
      tags?: string[];
      attachments?: any[];
      createdAt?: string;
      updatedAt?: string;
    };
  } | undefined;
  ToDo: undefined;
  TaskDetails: {
    taskId: string;
  };
  AddTask: {
    quadrant?: 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important';
  };
  PDFs: undefined;
  RINA: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator 
      initialRouteName="Welcome"
      screenOptions={{ headerShown: false, animation: 'none' }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Home" component={Home} />
      <Stack.Screen name="Notes" component={NotesScreen} />
      <Stack.Screen name="NoteEditor" component={NewNoteEditor} />
      <Stack.Screen name="ToDo" component={ToDo} />
      <Stack.Screen name="TaskDetails" component={TaskDetails} />
      <Stack.Screen name="AddTask" component={AddTask} />
      <Stack.Screen name="RINA" component={ChatBot} />

      {/* Add other screens when they're ready */}
      {/* <Stack.Screen name="PDFs" component={PDFsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} /> */}
    </Stack.Navigator>
  );
};

export default AppNavigator;