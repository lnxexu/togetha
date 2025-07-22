import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState } from "react";
import {
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Navbar from "./NavBar";
import { RootStackParamList } from "./navigation/AppNavigator";

const { width } = Dimensions.get("window");

// Updated data to reflect health sciences focus
const priorityTasks = [
  {
    id: 1,
    title: "Pharmacology Quiz Review",
    subject: "Pharmacology",
    time: "10:00 AM",
    priority: "High",
    status: "In Progress",
  },
  {
    id: 2,
    title: "Clinical Skills Practice",
    subject: "RLE",
    time: "2:00 PM",
    priority: "Medium",
    status: "Pending",
  },
  {
    id: 3,
    title: "Anatomy & Physiology Notes",
    subject: "A&P",
    time: "4:30 PM",
    priority: "High",
    status: "Completed",
  },
];

const quickAccess = [
  {
    id: 1,
    title: "Recent Notes",
    icon: "note",
    count: "12",
    color: "#667EEA",
  },
  {
    id: 2,
    title: "Study Materials",
    icon: "library-books",
    count: "8",
    color: "#F093FB",
  },
  {
    id: 3,
    title: "Ask RINA",
    icon: "psychology",
    count: "AI",
    color: "#4FACFE",
  },
];

const recentActivity = [
  {
    id: 1,
    type: "note",
    title: "Cardiovascular System Overview",
    subject: "A&P",
    time: "2 hours ago",
  },
  {
    id: 2,
    type: "quiz",
    title: "Drug Classifications Practice",
    subject: "Pharmacology",
    time: "4 hours ago",
  },
  {
    id: 3,
    type: "study",
    title: "Microbiology Lab Manual",
    subject: "Microbiology",
    time: "6 hours ago",
  },
];

// Get current week dates
const getCurrentWeek = () => {
  const today = new Date();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - today.getDay() + i);
    week.push({
      day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
      date: date.getDate(),
      isToday: date.getDate() === today.getDate(),
    });
  }
  return week;
};

export default function Home() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [activeTab, setActiveTab] = useState("tasks");
  const weekDates = getCurrentWeek();

  const getPriorityColor = (priority: "High" | "Medium" | "Low" | string) => {
    switch (priority) {
      case "High":
        return "#FF6B6B";
      case "Medium":
        return "#FFD93D";
      case "Low":
        return "#6BCF7F";
      default:
        return "#A8A8A8";
    }
  };

  const getActivityIcon = (
    type: string
  ): keyof typeof MaterialIcons.glyphMap => {
    return type as keyof typeof MaterialIcons.glyphMap;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerGreeting}>
            <Text style={styles.welcomeText}>Good morning,</Text>
            <Text style={styles.nameText}>Orentt! 👋</Text>
          </View>
          <TouchableOpacity style={styles.notificationIcon}>
            <View style={styles.notificationIconContainer}>
              <MaterialIcons name="notifications" size={22} color="#6A009C" />
              <View style={styles.notificationDot} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Quick Access */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Access</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContainer}
          >
            {quickAccess.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.quickAccessCardHorizontal,
                  index === 0 && styles.firstCard,
                ]}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.quickAccessIcon,
                    { backgroundColor: item.color },
                  ]}
                >
                  <MaterialIcons
                    name={getActivityIcon(item.icon)}
                    size={24}
                    color="#FFFFFF"
                  />
                </View>
                <Text style={styles.quickAccessTitle}>{item.title}</Text>
                <Text style={styles.quickAccessCount}>{item.count}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Priority Tasks */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Priority Tasks</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContainer}
          >
            {priorityTasks.map((task, index) => (
              <TouchableOpacity
                key={task.id}
                style={[
                  styles.taskCardHorizontal,
                  index === 0 && styles.firstCard,
                ]}
                activeOpacity={0.8}
              >
                <View style={styles.taskHeader}>
                  <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={2}>
                      {task.title}
                    </Text>
                    <Text style={styles.taskSubject}>{task.subject}</Text>
                  </View>
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: getPriorityColor(task.priority) },
                    ]}
                  >
                    <Text style={styles.priorityText}>{task.priority}</Text>
                  </View>
                </View>

                <View style={styles.taskBody}>
                  <Text style={styles.taskTime}>{task.time}</Text>
                </View>

                <View style={styles.taskFooter}>
                  <View style={styles.statusContainer}>
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            task.status === "Completed"
                              ? "#10B981"
                              : task.status === "In Progress"
                              ? "#F59E0B"
                              : "#EF4444",
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.taskStatus,
                        {
                          color:
                            task.status === "Completed"
                              ? "#10B981"
                              : task.status === "In Progress"
                              ? "#F59E0B"
                              : "#EF4444",
                        },
                      ]}
                    >
                      {task.status}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.taskAction}>
                    <MaterialIcons name="more-vert" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity>
              <Text style={styles.seeAllText}>See All</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalScrollContainer}
          >
            {recentActivity.map((activity, index) => (
              <TouchableOpacity
                key={activity.id}
                style={[
                  styles.activityCardHorizontal,
                  index === 0 && styles.firstCard,
                ]}
                activeOpacity={0.8}
              >
                <View style={styles.activityIcon}>
                  <MaterialIcons
                    name={getActivityIcon(activity.type)}
                    size={20}
                    color="#6A009C"
                  />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activityTitle} numberOfLines={2}>
                    {activity.title}
                  </Text>
                  <Text style={styles.activitySubject}>{activity.subject}</Text>
                  <Text style={styles.activityTime}>{activity.time}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Bottom spacing for navbar */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Navigation Bar */}
      <Navbar activeRoute="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingBottom: 80, // Space for the navbar
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 24,
    backgroundColor: "#F8FAFC",
  },
  headerGreeting: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    lineHeight: 20,
  },
  nameText: {
    fontSize: 28,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginTop: 4,
    lineHeight: 32,
  },
  notificationIcon: {
    padding: 8,
  },
  notificationIconContainer: {
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  notificationDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    lineHeight: 24,
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6366F1",
  },
  quickAccessGrid: {
    flexDirection: "row",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  quickAccessCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.35,
    marginRight: 16,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  quickAccessIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  quickAccessTitle: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    marginBottom: 6,
    lineHeight: 16,
  },
  quickAccessCount: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  horizontalScrollContainer: {
    paddingLeft: 24,
    paddingRight: 12,
  },
  firstCard: {
    marginLeft: 0,
  },
  taskCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.7,
    marginRight: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: "#6A009C",
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  taskInfo: {
    flex: 1,
    paddingRight: 12,
  },
  taskTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 6,
    lineHeight: 20,
  },
  taskSubject: {
    fontSize: 13,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    backgroundColor: "#f2e5f8ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  taskBody: {
    marginBottom: 16,
  },
  taskTime: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Medium",
  },
  priorityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 60,
    alignItems: "center",
  },
  priorityText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    textTransform: "uppercase",
  },
  taskFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  taskStatus: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
  },
  taskAction: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  activityCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.65,
    marginRight: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 3,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f2e5f8ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 6,
    lineHeight: 18,
  },
  activitySubject: {
    fontSize: 12,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    backgroundColor: "#f2e5f8ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  activityTime: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "Inter-Regular",
  },
});