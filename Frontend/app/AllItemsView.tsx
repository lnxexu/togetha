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
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaWrapper } from "./components/SafeAreaWrapper";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { RootStackParamList } from "./navigation/AppNavigator";
import { API_URL, API_ENDPOINTS } from "../constants/ApiConfig";
import SkeletonLoader from "./components/SkeletonLoader";

const { width } = Dimensions.get("window");


type RouteParams = {
    viewType: "tasks" | "activity" | "notes" | "urgent-tasks";
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
    isOverdue?: boolean;
    isDueSoon?: boolean;
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

type Note = {
    id: string;
    title: string;
    content: string;
    folder?: string;
    createdAt: Date;
    updatedAt: Date;
    type: "text" | "image" | "drawing" | "document";
    tags?: string[];
};

// Create a unified ListItem type that can represent both Task, Activity, and Note
type ListItem = Task | Activity | Note;

// Type guard functions to check which type an item is
function isTask(item: ListItem): item is Task {
    return !!(item as Task).priority;
}

function isActivity(item: ListItem): item is Activity {
    return !!(item as Activity).type && (item as Activity).updatedAt !== undefined;
}

function isNote(item: ListItem): item is Note {
    return !!(item as Note).content && (item as Note).createdAt !== undefined;
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
            } else if (viewType === "urgent-tasks") {
                const response = await fetch(`${API_URL}/task_manager/tasks/`, {
                    headers: {
                        "Authorization": `Token ${token}`,
                        "Cache-Control": "no-cache",
                    },
                });

                if (!response.ok) {
                    throw new Error("Failed to fetch urgent tasks");
                }

                const tasks = await response.json();
                const now = new Date();
                const threeDaysFromNow = new Date();
                threeDaysFromNow.setDate(now.getDate() + 3);

                // Filter for overdue and upcoming tasks
                const urgentTasks = tasks
                    .filter((task: any) => !task.completed && task.due_datetime)
                    .map((task: any) => {
                        const dueDate = new Date(task.due_datetime);
                        const isOverdue = dueDate < now;
                        const isDueSoon = dueDate >= now && dueDate <= threeDaysFromNow;
                        
                        return {
                            ...task,
                            isOverdue,
                            isDueSoon,
                            dueDate
                        };
                    })
                    .filter((task: any) => task.isOverdue || task.isDueSoon)
                    .sort((a: any, b: any) => {
                        // Sort overdue tasks first, then by due date
                        if (a.isOverdue && !b.isOverdue) return -1;
                        if (!a.isOverdue && b.isOverdue) return 1;
                        return a.dueDate.getTime() - b.dueDate.getTime();
                    })
                    .map((task: any) => ({
                        id: task.id,
                        title: task.title || task.text,
                        category: task.category || "General",
                        time: new Date(task.due_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        priority: mapPriority(task.priority),
                        status: mapStatus(task.status),
                        due_datetime: task.due_datetime,
                        isOverdue: task.isOverdue,
                        isDueSoon: task.isDueSoon,
                        type: 'task' as const,
                    }));

                setItems(urgentTasks);
            } else if (viewType === "notes") {
                const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}`, {
                    headers: {
                        "Authorization": `Token ${token}`,
                        "Cache-Control": "no-cache",
                    },
                });

                if (!response.ok) {
                    throw new Error("Failed to fetch notes");
                }

                const notes = await response.json();

                // Transform notes data to match our UI structure
                const transformedNotes = notes
                    .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                    .map((note: any) => ({
                        id: note.id,
                        title: note.title || "Untitled Note",
                        content: note.content || "",
                        folder: note.folder || "Unorganized",
                        createdAt: new Date(note.created_at),
                        updatedAt: new Date(note.updated_at),
                        type: note.type || "text",
                        tags: note.tags || [],
                    }));

                setItems(transformedNotes);
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

    // Helper function to get appropriate preview text for different note types
    const getNotePreview = (note: Note): string => {
        switch (note.type) {
            case 'drawing':
                return '🎨 Hand-drawn sketch with annotations and creative elements';
            case 'document':
                // For documents, try to extract meaningful text from the content
                const documentText = note.content
                    .replace(/<[^>]*>/g, '') // Remove HTML tags
                    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
                    .replace(/&[a-z]+;/gi, '') // Remove other HTML entities
                    .trim();
                return documentText.length > 0 
                    ? `📄 ${documentText.substring(0, 110) + (documentText.length > 110 ? '...' : '')}`
                    : '📄 Document with formatted content and media';
            case 'image':
                return '🖼️ Image note with visual content and captions';
            case 'text':
            default:
                // For text notes, clean and format the content
                const textContent = note.content
                    .replace(/<[^>]*>/g, '') // Remove HTML tags
                    .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
                    .replace(/&[a-z]+;/gi, '') // Remove other HTML entities
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .trim();
                return textContent.length > 0
                    ? textContent.substring(0, 100) + (textContent.length > 100 ? '...' : '')
                    : 'Empty note - tap to add content';
        }
    };

    // Helper function to get appropriate icon for note type
    const getNoteIcon = (noteType: string) => {
        switch (noteType) {
            case 'drawing':
                return 'draw';
            case 'document':
                return 'description';
            case 'image':
                return 'image';
            case 'text':
            default:
                return 'note';
        }
    };

    // Helper function to get appropriate icon color for note type
    const getNoteIconColor = (noteType: string) => {
        switch (noteType) {
            case 'drawing':
                return '#F59E0B'; // Amber for drawings
            case 'document':
                return '#EF4444'; // Red for documents
            case 'image':
                return '#10B981'; // Green for images
            case 'text':
            default:
                return '#3B82F6'; // Blue for text notes
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
            style={[
                styles.taskCard,
                item.isOverdue && styles.overdueCard,
                item.isDueSoon && styles.dueSoonCard
            ]}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("TaskDetails", { taskId: item.id })}
        >
            <View style={[
                styles.borderLeft, 
                { backgroundColor: item.isOverdue ? "#EF4444" : item.isDueSoon ? "#F59E0B" : getPriorityColor(item.priority) }
            ]} />
            <View style={styles.taskHeader}>
                <View style={styles.taskInfo}>
                    <View style={styles.taskTitleRow}>
                        <Text style={styles.taskTitle} numberOfLines={1}>
                            {item.title}
                        </Text>
                        {item.isOverdue && (
                            <View style={styles.overdueLabel}>
                                <Text style={styles.overdueLabelText}>OVERDUE</Text>
                            </View>
                        )}
                        {item.isDueSoon && !item.isOverdue && (
                            <View style={styles.dueSoonLabel}>
                                <Text style={styles.dueSoonLabelText}>DUE SOON</Text>
                            </View>
                        )}
                    </View>
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
                    <Text style={[
                        styles.taskDueDate,
                        item.isOverdue && styles.overdueDateText,
                        item.isDueSoon && styles.dueSoonDateText
                    ]}>
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

    const renderNoteItem = (item: Note) => (
        <TouchableOpacity
            style={styles.noteCard}
            activeOpacity={0.8}
            onPress={() => navigation.navigate("NoteEditor", { noteId: item.id })}
        >
            <View style={styles.noteCardContent}>
                <View style={[styles.noteIcon, { backgroundColor: `${getNoteIconColor(item.type)}15` }]}>
                    <MaterialIcons
                        name={getNoteIcon(item.type)}
                        size={24}
                        color={getNoteIconColor(item.type)}
                    />
                </View>
                <View style={styles.noteContent}>
                    <Text style={styles.noteTitle} numberOfLines={2}>
                        {item.title || 'Untitled Note'}
                    </Text>
                    <Text style={styles.notePreview} numberOfLines={3}>
                        {getNotePreview(item)}
                    </Text>
                    <View style={styles.noteDetailsRow}>
                        <Text style={[styles.noteFolder, { color: getNoteIconColor(item.type) }]}>
                            {item.folder || 'Unorganized'}
                        </Text>
                        <Text style={styles.noteDate}>
                            {new Date(item.updatedAt).toLocaleDateString()}
                        </Text>
                    </View>
                </View>
            </View>
        </TouchableOpacity>
    );

    // Use type guard to render the correct item type
    const renderListItem = ({ item }: { item: ListItem }) => {
        if (isTask(item)) {
            return renderTaskItem(item);
        } else if (isNote(item)) {
            return renderNoteItem(item);
        } else {
            return renderActivityItem(item);
        }
    };

    return (
        <SafeAreaWrapper backgroundColor="#F8FAFC">
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
                    {viewType === "tasks" ? "All Priority Tasks" : 
                     viewType === "urgent-tasks" ? "Urgent & Overdue Tasks" :
                     viewType === "notes" ? "All Notes" : 
                     "All Recent Activity"}
                </Text>
                {(viewType === "tasks" || viewType === "notes" || viewType === "urgent-tasks") && (
                    <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => 
                            (viewType === "tasks" || viewType === "urgent-tasks")
                                ? navigation.navigate("AddTask", { quadrant: 'urgent-important' })
                                : navigation.navigate("Notes")
                        }
                    >
                        <MaterialIcons name="add" size={24} color="#6A009C" />
                    </TouchableOpacity>
                )}

            </View>

            {loading && !refreshing ? (
                <SkeletonLoader 
                    type={viewType === "tasks" || viewType === "urgent-tasks" ? "tasks" : viewType === "notes" ? "notes" : "list"} 
                    count={6} 
                />
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
        </SafeAreaWrapper>
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
    // Note styles
    noteCard: {
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
    noteCardContent: {
        flexDirection: "row",
        alignItems: "flex-start",
    },
    noteIcon: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: "#EFF6FF",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    noteContent: {
        flex: 1,
    },
    noteTitle: {
        fontSize: 16,
        fontFamily: "Inter-Bold",
        color: "#1E293B",
        marginBottom: 8,
        lineHeight: 22,
    },
    notePreview: {
        fontSize: 14,
        color: "#64748B",
        fontFamily: "Inter-Regular",
        marginBottom: 12,
        lineHeight: 20,
    },
    noteDetailsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    noteFolder: {
        fontSize: 12,
        fontFamily: "Inter-Medium",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: "rgba(59, 130, 246, 0.1)", // Default background
        overflow: "hidden",
    },
    noteDate: {
        fontSize: 12,
        color: "#64748B",
        fontFamily: "Inter-Regular",
    },
    // Overdue and Due Soon styles
    overdueCard: {
        borderColor: "#EF4444",
        borderWidth: 2,
        backgroundColor: "#FEF2F2",
    },
    dueSoonCard: {
        borderColor: "#F59E0B",
        borderWidth: 2,
        backgroundColor: "#FFFBEB",
    },
    taskTitleRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
        flexWrap: "wrap",
    },
    overdueLabel: {
        backgroundColor: "#EF4444",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    overdueLabelText: {
        fontSize: 10,
        color: "#FFFFFF",
        fontFamily: "Inter-Bold",
        textTransform: "uppercase",
    },
    dueSoonLabel: {
        backgroundColor: "#F59E0B",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    dueSoonLabelText: {
        fontSize: 10,
        color: "#FFFFFF",
        fontFamily: "Inter-Bold",
        textTransform: "uppercase",
    },
    overdueDateText: {
        color: "#EF4444",
        fontFamily: "Inter-Bold",
    },
    dueSoonDateText: {
        color: "#F59E0B",
        fontFamily: "Inter-Bold",
    },
});
