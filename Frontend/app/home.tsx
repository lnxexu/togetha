import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Navbar from './NavBar';
import { RootStackParamList } from './navigation/AppNavigator';

// Updated data to reflect health sciences focus
const priorityTasks = [
  { id: 1, title: 'Pharmacology Quiz Review', subject: 'Pharmacology', time: '10:00 AM', priority: 'High', status: 'In Progress' },
  { id: 2, title: 'Clinical Skills Practice', subject: 'RLE', time: '2:00 PM', priority: 'Medium', status: 'Pending' },
  { id: 3, title: 'Anatomy & Physiology Notes', subject: 'A&P', time: '4:30 PM', priority: 'High', status: 'Completed' },
];

const quickAccess = [
  { id: 1, title: 'Recent Notes', icon: 'note', count: '12', color: '#6b009c17' },
  { id: 2, title: 'Study Materials', icon: 'library-books', count: '8', color: '#6b009c17' },
  { id: 3, title: 'Ask RINA', icon: 'psychology', count: 'AI', color: '#6b009c17' },   

];

const recentActivity = [
  { id: 1, type: 'note', title: 'Cardiovascular System Overview', subject: 'A&P', time: '2 hours ago' },
  { id: 2, type: 'quiz', title: 'Drug Classifications Practice', subject: 'Pharmacology', time: '4 hours ago' },
  { id: 3, type: 'study', title: 'Microbiology Lab Manual', subject: 'Microbiology', time: '6 hours ago' },
];

// Get current week dates
const getCurrentWeek = () => {
  const today = new Date();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - today.getDay() + i);
    week.push({
      day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
      date: date.getDate(),
      isToday: date.getDate() === today.getDate(),
    });
  }
  return week;
};
export default function Home() {
const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState('tasks');
  const weekDates = getCurrentWeek();

const getPriorityColor = (priority: 'High' | 'Medium' | 'Low' | string) => {
  switch (priority) {
    case 'High': return '#E74C3C';
    case 'Medium': return '#F39C12';
    case 'Low': return '#27AE60';
    default: return '#7F8C8D';
  }
};

const getActivityIcon = (type: string): keyof typeof MaterialIcons.glyphMap => {
  return type as keyof typeof MaterialIcons.glyphMap;
};

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
  <View style={styles.headerGreeting}>
    <Text style={styles.welcomeText}>Welcome,</Text>
    <Text style={styles.nameText}>Orentt!</Text>
  </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.notificationIcon}>
            <MaterialIcons name="notifications" size={24} color="#2C3E50" />
            <View style={styles.notificationDot} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

  {/* Quick Access */}
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>QUICK ACCESS</Text>
    <View style={styles.quickAccessGrid}>
      {quickAccess.map((item) => (
        <TouchableOpacity key={item.id} style={styles.quickAccessCard}>
          <View style={[styles.quickAccessIcon, { backgroundColor: item.color }]}>
            <MaterialIcons name={getActivityIcon(item.icon)} size={30} color="#6A009C" />
          </View>
          <Text style={styles.quickAccessTitle}>{item.title}</Text>
          <Text style={styles.quickAccessCount}>{item.count}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>

  {/* Priority Tasks - Horizontal Scroll */}
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>PRIORITY TASKS</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 20, paddingTop: 10, paddingBottom: 20 }}>
      {priorityTasks.map((task) => (
        <View key={task.id}  style={[styles.taskCardHorizontal]} >
          <View style={styles.taskHeader}>
            <View style={styles.taskInfo}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.taskSubject}>{task.subject}</Text>
            </View>
            <View style={styles.taskMeta}>
              <Text style={styles.taskTime}>{task.time}</Text>
              <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(task.priority) }]}>
                <Text style={styles.priorityText}>{task.priority}</Text>
              </View>
            </View>
          </View>
          <View style={styles.taskFooter}>
            <Text style={[
              styles.taskStatus,
              { color: task.status === 'Completed' ? '#27AE60' : 
                      task.status === 'In Progress' ? '#F39C12' : '#E74C3C' }
            ]}>{task.status}</Text>
            <TouchableOpacity style={styles.taskAction}>
              <MaterialIcons name="more-vert" size={20} color="#7F8C8D" />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  </View>

  {/* Recent Activity - Vertical */}
<View style={styles.section}>
  <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingLeft: 20, paddingTop: 10, paddingBottom: 20 }}>
    {recentActivity.map((activity) => (
      <View key={activity.id} style={styles.activityCardHorizontal}>
        <View style={styles.activityIcon}>
          <MaterialIcons name={getActivityIcon(activity.type)} size={20} color="#6A009C" />
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityTitle}>{activity.title}</Text>
          <Text style={styles.activitySubject}>{activity.subject}</Text>
        </View>
        <Text style={styles.activityTime}>{activity.time}</Text>
      </View>
    ))}
  </ScrollView>
</View>
</ScrollView>


      {/* Navigation Bar */}
      <Navbar activeRoute="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfcfcff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 10,
    backgroundColor: '#fcfcfcff',
    elevation: 2,
  },
headerGreeting: {
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'flex-start',
  paddingBottom: 20,
  paddingHorizontal: 20,
},

welcomeText: {
  fontSize: 20,
  fontFamily: 'Inter-Regular',  
  color: '#2C3E50',
},

nameText: {
  fontSize: 24,
  fontFamily: 'Inter-Bold',
  color: '#6A009C',
  marginTop: 4,
},
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#AD00FF',
  },
  greeting: {
    fontSize: 14,
    color: '#7F8C8D',
    marginTop: 2,
  },
  notificationIcon: {
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E74C3C',
  },
  content: {
    flex: 1,
  },

  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C3E50',
    marginBottom: 15,
    paddingHorizontal: 20,
  },
  quickAccessGrid: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  quickAccessCard: {
  backgroundColor: '#fcfcfcff',
    borderRadius: 12,
    padding: 15,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  quickAccessIcon: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  quickAccessTitle: {
    fontSize: 12,
    color: '#2C3E50',
    textAlign: 'center',
    marginBottom: 5,
  },
  quickAccessCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#AD00FF',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#AD00FF',
  },
  tabText: {
    fontSize: 14,
    color: '#7F8C8D',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#fff',
  },
  taskCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  taskSubject: {
    fontSize: 12,
    color: '#333333',
    fontWeight: '500',
  },
  taskMeta: {
    alignItems: 'flex-end',
  },
  taskTime: {
    fontSize: 12,
    color: '#7F8C8D',
    marginBottom: 5,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  priorityText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  taskAction: {
    padding: 5,
  },
activityCardHorizontal: {
  backgroundColor: '#fcfcfcff',
  width: 250,
  marginRight: 15,
  borderRadius: 12,
  padding: 15,
  flexDirection: 'row',
  alignItems: 'center',
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
},
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6b009c17',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  activitySubject: {
    fontSize: 12,
    color: '#333333',
    fontWeight: '500',
  },
  activityTime: {
    fontSize: 11,
    color: '#7F8C8D',
  },
  taskCardHorizontal: {
  backgroundColor: '#fcfcfcff',
  width: 250,
  marginRight: 15,
  borderRadius: 12,
  padding: 15,
  elevation: 2,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
},
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 11,
    color: '#7F8C8D',
    marginTop: 4,
  },
  chatbotIcon: {
    width: 24,
    height: 24,
  },
});