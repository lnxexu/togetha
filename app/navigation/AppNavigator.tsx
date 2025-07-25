import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import WelcomeScreen from '../onboarding/Welcome';
import LoginScreen from '../onboarding/signin';
import SignupScreen from '../onboarding/signup';

//main pages
import ChatBot from '../chatbot/AI';
import Home from '../home';
import NotesScreen from '../note-taking/notes';
import ToDo from '../task-management/ToDo';

//note-taking components
import ImportPDFPage from '../note-taking/ImportPDFPage';
import NewNoteEditor from '../note-taking/NewNoteEditor';

//task management components
import AddTask from '../task-management/AddTask';
import TaskDetails from '../task-management/TaskDetails';
import EisenhowerListPage from '../task-management/EisenhowerListPage';

import { Task } from '../task-management/types/Task';

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
  EisenhowerList: {
    tasks: Task[];
    quadrant: 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important';
    onMarkComplete: (taskId: string) => void;
    onDeleteTask: (taskId: string) => void;
  };
  PDFs: undefined;
  RINA: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
        <Stack.Screen name="ToDo" component={ToDo} />
        <Stack.Screen name="RINA" component={ChatBot} />

        {/* Note Taking components */}
        <Stack.Screen name="NoteEditor" component={NewNoteEditor} />
        <Stack.Screen name="PDFs" component={ImportPDFPage} />

        {/* Task Management components */}
        <Stack.Screen name="TaskDetails" component={TaskDetails} />
        <Stack.Screen name="AddTask" component={AddTask} />
        <Stack.Screen name="EisenhowerList" component={EisenhowerListPage} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;