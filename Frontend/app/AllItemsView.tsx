import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState, useEffect, useCallback } from "react";
import {
    ActivityIndicator,
    Dimensions,
    FlatList,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "./navigation/AppNavigator";
import Navbar from "./NavBar";
import { API_URL, API_ENDPOINTS } from "../constants/ApiConfig";

const { width } = Dimensions.get("window");


type RouteParams = {
    viewType: "tasks" | "activity";
};

// Define the items types
type Task = {
    id: string;
    title: string;
    category: string;
    time: string;
    priority: string;
    status: string;
    due_datetime?: string;
    type?: 'task';

};

type Activity = {
    id: string;
    type: string;
    title: string;
    subject: string;
    time: string;
    updatedAt: Date;
};

// Create a unified ListItem type that can represent both Task and Activity
type ListItem = Task | Activity;

// Type guard functions to check which type an item is
function isTask(item: ListItem): item is Task {
    return !!(item as Task).priority;
}

function isActivity(item: ListItem): item is Activity {
    return !!(item as Activity).type && (item as Activity).updatedAt !== undefined;
}

export default function AllItemsView() {
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute();
    const { viewType } = route.params as RouteParams;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [items, setItems] = useState<ListItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const token = await AsyncStorage.getItem("authToken");
            if (!token) {
                navigation.navigate("Login");
                return;
            }

            if (viewType === "tasks") {
                const response = await fetch(`${API_URL}/task_manager/tasks/`, {
                    headers: {
                        "Authorization": `Token ${token}`,
                        "Cache-Control": "no-cache",
                    },
                });

                if (!response.ok) {
                    throw new Error("Failed to fetch tasks");
                }

                const tasks = await response.json();

                // Transform the tasks data to match our UI structure
                const transformedTasks = tasks
                    .filter((task: any) => !task.completed)
                    .sort((a: any, b: any) => {
                        // Sort by priority: high > medium > low
                        const priorityOrder = { urgent_important: 3, not_urgent_important: 2, urgent_not_important: 1, not_urgent_not_important: 0 };
                        return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
                    })
                    .map((task: any) => ({
                        id: task.id,
                        title: task.text,
                        subject: task.category ? task.category.name : "General",
                        time: task.due_date ? new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "No due date",
                        priority: mapPriority(task.priority),
                        status: mapStatus(task.status),
                        due_date: task.due_date,
                        type: 'task' as const, // Explicitly mark as a task
                    }));

                setItems(transformedTasks);
            } else {
                // Fetch notes and tasks for recent activity
                const [notesResponse, tasksResponse] = await Promise.all([
                    fetch(`${API_URL}/note_taking/notes/`, {
                        headers: {
                            "Authorization": `Token ${token}`,
                            "Cache-Control": "no-cache",
                        },
                    }),
                    fetch(`${API_URL}/task_manager/tasks/`, {
                        headers: {
                            "Authorization": `Token ${token}`,
                            "Cache-Control": "no-cache",
                        },
                    })
                ]);

                if (!notesResponse.ok || !tasksResponse.ok) {
                    throw new Error("Failed to fetch activity data");
                }

                const notes = await notesResponse.json();
                const tasks = await tasksResponse.json();

                // Combine and sort by updated_at
                const combinedActivity: Activity[] = [
                    ...notes.map((note: any) => ({
                        id: note.id,
                        type: "note",
                        title: note.title || "Untitled Note",
                        subject: getSubjectFromTags(note.tags),
                        time: formatTimeAgo(new Date(note.updated_at)),
                        updatedAt: new Date(note.updated_at),
                    })),
                    ...tasks.map((task: any) => ({
                        id: task.id,
                        type: "task",
                        title: task.text || "Unnamed Task",
                        subject: task.category?.name || "General",
                        time: formatTimeAgo(new Date(task.updated_at)),
                        updatedAt: new Date(task.updated_at),
                    })),
                ];

                // Sort by most recent
                combinedActivity.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
                setItems(combinedActivity);
            }
        } catch (error) {
            console.error(`Error fetching ${viewType}:`, error);
            setError(`Failed to load ${viewType}`);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [viewType, navigation]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, [fetchData]);

    // Helper function to get subject from tags
    const getSubjectFromTags = (tags: any[]) => {
        if (!tags || tags.length === 0) return "General";
        return typeof tags[0] === 'object' ? tags[0].name : tags[0];
    };

    // Helper function to format time ago
    const formatTimeAgo = (date: Date) => {
        const now = new Date();
        const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

        if (diffInHours < 1) {
            const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
            return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
        } else if (diffInHours < 24) {
            return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
        } else {
            const diffInDays = Math.floor(diffInHours / 24);
            return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
        }
    };

    // Helper function to map priority from backend to UI
    const mapPriority = (priority: string) => {
        switch (priority) {
            case 'urgent_important':
                return 'High';
            case 'not_urgent_important':
                return 'Medium';
            case 'urgent_not_important':
                return 'Medium';
            case 'not_urgent_not_important':
                return 'Low';
            default:
                return 'Medium';
        }
    };

    // Helper function to map status from backend to UI
    const mapStatus = (status: string) => {
        switch (status) {
            case 'not_started':
                return 'Pending';
            case 'in_progress':
                return 'In Progress';
            case 'completed':
                return 'Completed';
            default:
                return 'Pending';
        }
    };

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
        switch (type) {
            case 'note':
                return 'note';
            case 'task':
                return 'check-circle';
            case 'quiz':
                return 'quiz';
            case 'study':
                return 'school';
            default:
                return 'history';
        }
    };

    const renderTaskItem = (item: Task) => (
        <TouchableOpacity
            style={styles.taskCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("TaskDetails", { taskId: item.id })}
        >
            <View style={[styles.borderLeft, { backgroundColor: getPriorityColor(item.priority) }]} />
            <View style={styles.taskHeader}>
                <View style={styles.taskInfo}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                        {item.title}
                    </Text>
                    <Text style={styles.taskSubject}>{item.category}</Text>
                </View>
                <View
                    style={[
                        styles.priorityBadge,
                        { backgroundColor: getPriorityColor(item.priority) },
                    ]}
                >
                    <Text style={styles.priorityText}>{item.priority}</Text>
                </View>
            </View>

            <View style={styles.taskBody}>
                <Text style={styles.taskTime}>{item.time}</Text>
                {item.due_datetime && (
                    <Text style={styles.taskDueDate}>
                        Due: {new Date(item.due_datetime).toLocaleDateString()}
                    </Text>
                )}
            </View>

            <View style={styles.taskFooter}>
                <View style={styles.statusContainer}>
                    <View
                        style={[
                            styles.statusDot,
                            {
                                backgroundColor:
                                    item.status === "Completed"
                                        ? "#10B981"
                                        : item.status === "In Progress"
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
                                    item.status === "Completed"
                                        ? "#10B981"
                                        : item.status === "In Progress"
                                            ? "#F59E0B"
                                            : "#EF4444",
                            },
                        ]}
                    >
                        {item.status}
                    </Text>
                </View>
                <TouchableOpacity style={styles.taskAction}>
                    <MaterialIcons name="more-vert" size={18} color="#9CA3AF" />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );


    const renderActivityItem = (item: Activity) => (
        <TouchableOpacity
            style={styles.activityCard}
            activeOpacity={0.8}
            onPress={() => {
                if (item.type === 'note') {
                    navigation.navigate("Notes");
                } else if (item.type === 'task') {
                    navigation.navigate("TaskDetails", {
                        taskId: item.id,
                    });
                }
            }}
        >
            <View style={styles.activityCardContent}>
                <View style={styles.activityIcon}>
                    <MaterialIcons
                        name={getActivityIcon(item.type)}
                        size={24}
                        color="#6A009C"
                    />
                </View>
                <View style={styles.activityContent}>
                    <Text style={styles.activityTitle} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <View style={styles.activityDetailsRow}>
                        <Text style={styles.activitySubject}>{item.subject}</Text>
                    </View>
                    <Text style={styles.activityTime}>{item.time}</Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    // Use type guard to render the correct item type
    const renderListItem = ({ item }: { item: ListItem }) => {
        if (isTask(item)) {
            return renderTaskItem(item);
        } else {
            return renderActivityItem(item);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
                    <MaterialIcons name="arrow-back" size={24} color="#6A009C" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {viewType === "tasks" ? "All Priority Tasks" : "All Recent Activity"}
                </Text>
                {viewType === "tasks" && (
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => navigation.navigate("AddTask", { quadrant: 'urgent-important' })}
                    >
                        <MaterialIcons name="add" size={24} color="#6A009C" />
                    </TouchableOpacity>
                )}

            </View>

            {loading && !refreshing ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#6A009C" />
                </View>
            ) : error ? (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                        style={styles.retryButton}
                        onPress={fetchData}
                    >
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            ) : items.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <MaterialIcons
                        name={viewType === "tasks" ? "assignment" : "history"}
                        size={64}
                        color="#CBD5E0"
                    />
                    <Text style={styles.emptyText}>
                        {viewType === "tasks"
                            ? "No priority tasks yet"
                            : "No recent activity"}
                    </Text>
                    {viewType === "tasks" && (
                        <TouchableOpacity
                            style={styles.addNewButton}
                            onPress={() => navigation.navigate("AddTask", { quadrant: 'urgent-important' })}
                        >
                            <Text style={styles.addNewButtonText}>Add New Task</Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <FlatList
                    data={items}
                    renderItem={renderListItem}
                    keyExtractor={(item) => `${viewType}-${item.id}`}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={["#6A009C"]}
                            tintColor="#6A009C"
                        />
                    }
                />
            )}

            {/* Bottom Navigation */}
            <Navbar activeRoute="Home" />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#F8FAFC",
        paddingBottom: 80, // Space for the navbar
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 8 : 16,
        paddingBottom: 16,
        backgroundColor: "#F8FAFC",
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        elevation: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
    },
    backButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: "#F1E6FF",
    },
    headerTitle: {
        fontSize: 20,
        fontFamily: "Inter-Bold",
        color: "#1E293B",
    },
    addButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: "#F1E6FF",
    },
    loaderContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    errorText: {
        fontSize: 16,
        color: "#EF4444",
        fontFamily: "Inter-Medium",
        marginBottom: 12,
    },
    retryButton: {
        backgroundColor: "#6A009C",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    retryText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontFamily: "Inter-Medium",
    },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
    },
    emptyText: {
        fontSize: 18,
        color: "#94A3B8",
        fontFamily: "Inter-Medium",
        marginTop: 16,
        marginBottom: 16,
    },
    addNewButton: {
        backgroundColor: "#6A009C",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
    },
    addNewButtonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontFamily: "Inter-Medium",
    },
    listContent: {
        padding: 16,
        paddingBottom: 100, // Extra space at bottom
    },
    taskCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        marginBottom: 16,
        padding: 16,
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
        position: "relative",
    },
    borderLeft: {
        position: "absolute",
        left: 0,
        top: 16,
        bottom: 16,
        width: 4,
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
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
        fontSize: 18,
        fontFamily: "Inter-Bold",
        color: "#1E293B",
        marginBottom: 8,
        lineHeight: 24,
    },
    taskSubject: {
        fontSize: 14,
        color: "#6A009C",
        fontFamily: "Inter-Medium",
        backgroundColor: "#F1E6FF",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        alignSelf: "flex-start",
    },
    priorityBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        minWidth: 60,
        alignItems: "center",
    },
    priorityText: {
        fontSize: 12,
        color: "#FFFFFF",
        fontFamily: "Inter-Bold",
        textTransform: "uppercase",
    },
    taskBody: {
        marginBottom: 16,
    },
    taskTime: {
        fontSize: 14,
        color: "#64748B",
        fontFamily: "Inter-Medium",
        marginBottom: 4,
    },
    taskDueDate: {
        fontSize: 14,
        color: "#64748B",
        fontFamily: "Inter-Medium",
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
        fontSize: 14,
        fontFamily: "Inter-Medium",
    },
    taskAction: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: "#F8FAFC",
    },
    activityCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        marginBottom: 16,
        padding: 16,
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    activityCardContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    activityIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: "#F1E6FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    activityContent: {
        flex: 1,
    },
    activityTitle: {
        fontSize: 16,
        fontFamily: "Inter-Bold",
        color: "#1E293B",
        marginBottom: 8,
        lineHeight: 22,
    },
    activityDetailsRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
    },
    activitySubject: {
        fontSize: 12,
        color: "#6A009C",
        fontFamily: "Inter-Medium",
        backgroundColor: "#F1E6FF",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    activityTime: {
        fontSize: 12,
        color: "#64748B",
        fontFamily: "Inter-Regular",
        marginTop: 4,
    },
});
