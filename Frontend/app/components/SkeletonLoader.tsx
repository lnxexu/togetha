import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

interface SkeletonLoaderProps {
  type?: "dashboard" | "tasks" | "notes" | "card" | "list" | "custom";
  count?: number;
  height?: number;
  width?: number | string;
  borderRadius?: number;
  style?: any;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  type = "card",
  count = 1,
  height = 100,
  width: itemWidth = "100%",
  borderRadius = 8,
  style,
}) => {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    shimmerAnimation.start();

    return () => shimmerAnimation.stop();
  }, [shimmerAnim]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.7],
  });

  const SkeletonItem = ({
    customHeight = height,
    customWidth = itemWidth,
    borderRadius: customBorderRadius = borderRadius,
  }: {
    customHeight?: number;
    customWidth?: string | number;
    borderRadius?: number;
  }) => (
    <Animated.View
      style={[
        styles.skeletonItem,
        {
          height: customHeight,
          width: customWidth,
          borderRadius: customBorderRadius,
          opacity: shimmerOpacity,
        },
        style,
      ]}
    />
  );

  const renderDashboardSkeleton = () => (
    <View style={styles.container}>
      {/* Header skeleton */}
      <View style={styles.dashboardHeader}>
        <SkeletonItem customHeight={40} customWidth="60%" />
        <SkeletonItem customHeight={20} customWidth="40%" />
      </View>

      {/* Stats cards skeleton */}
      <View style={styles.statsContainer}>
        {[1, 2, 3].map((_, index) => (
          <View key={index} style={styles.statCard}>
            <SkeletonItem customHeight={60} customWidth="100%" />
            <View style={styles.statContent}>
              <SkeletonItem customHeight={16} customWidth="70%" />
              <SkeletonItem customHeight={12} customWidth="50%" />
            </View>
          </View>
        ))}
      </View>

      {/* Note folders skeleton */}
      <View style={styles.sectionContainer}>
        <SkeletonItem customHeight={24} customWidth="40%" />
        <View style={styles.folderGrid}>
          {[1, 2, 3].map((_, index) => (
            <View key={index} style={styles.folderCard}>
              <SkeletonItem customHeight={80} customWidth="100%" />
              <SkeletonItem customHeight={16} customWidth="80%" />
              <SkeletonItem customHeight={12} customWidth="60%" />
            </View>
          ))}
        </View>
      </View>

      {/* Recent tasks skeleton */}
      <View style={styles.sectionContainer}>
        <SkeletonItem customHeight={24} customWidth="40%" />
        {[1, 2, 3].map((_, index) => (
          <View key={index} style={styles.taskItem}>
            <SkeletonItem
              customHeight={20}
              customWidth={20}
              borderRadius={10}
            />
            <View style={styles.taskContent}>
              <SkeletonItem customHeight={16} customWidth="70%" />
              <SkeletonItem customHeight={12} customWidth="50%" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderTasksSkeleton = () => (
    <View style={styles.container}>
      {/* Header with filters */}
      <View style={styles.tasksHeader}>
        <SkeletonItem customHeight={40} customWidth="60%" />
        <View style={styles.filterContainer}>
          {[1, 2, 3].map((_, index) => (
            <SkeletonItem
              key={index}
              customHeight={32}
              customWidth={80}
              borderRadius={16}
            />
          ))}
        </View>
      </View>

      {/* Task list */}
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.taskCard}>
          <View style={styles.taskCardHeader}>
            <SkeletonItem
              customHeight={20}
              customWidth={20}
              borderRadius={10}
            />
            <View style={styles.taskCardContent}>
              <SkeletonItem customHeight={18} customWidth="80%" />
              <SkeletonItem customHeight={14} customWidth="60%" />
            </View>
            <SkeletonItem
              customHeight={24}
              customWidth={60}
              borderRadius={12}
            />
          </View>
          <SkeletonItem customHeight={12} customWidth="90%" />
          <View style={styles.taskCardFooter}>
            <SkeletonItem customHeight={16} customWidth="30%" />
            <SkeletonItem customHeight={16} customWidth="25%" />
          </View>
        </View>
      ))}
    </View>
  );

  const renderNotesSkeleton = () => (
    <View style={styles.container}>
      {/* Header with search */}
      <View style={styles.notesHeader}>
        <SkeletonItem customHeight={40} customWidth="70%" />
        <SkeletonItem customHeight={40} customWidth={40} borderRadius={20} />
      </View>

      {/* Notes grid */}
      <View style={styles.notesGrid}>
        {Array.from({ length: count }).map((_, index) => (
          <View key={index} style={styles.noteCard}>
            <SkeletonItem customHeight={120} customWidth="100%" />
            <View style={styles.noteCardContent}>
              <SkeletonItem customHeight={16} customWidth="90%" />
              <SkeletonItem customHeight={14} customWidth="70%" />
              <SkeletonItem customHeight={12} customWidth="50%" />
            </View>
            <View style={styles.noteCardFooter}>
              <SkeletonItem customHeight={12} customWidth="40%" />
              <SkeletonItem
                customHeight={20}
                customWidth={20}
                borderRadius={10}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderListSkeleton = () => (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.listItem}>
          <SkeletonItem customHeight={50} customWidth={50} borderRadius={25} />
          <View style={styles.listContent}>
            <SkeletonItem customHeight={16} customWidth="70%" />
            <SkeletonItem customHeight={12} customWidth="50%" />
          </View>
          <SkeletonItem customHeight={24} customWidth={60} borderRadius={12} />
        </View>
      ))}
    </View>
  );

  const renderCardSkeleton = () => (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.cardItem}>
          <SkeletonItem
            customHeight={height}
            customWidth={itemWidth}
            borderRadius={borderRadius}
          />
        </View>
      ))}
    </View>
  );

  const renderSkeleton = () => {
    switch (type) {
      case "dashboard":
        return renderDashboardSkeleton();
      case "tasks":
        return renderTasksSkeleton();
      case "notes":
        return renderNotesSkeleton();
      case "list":
        return renderListSkeleton();
      case "card":
      default:
        return renderCardSkeleton();
    }
  };

  return renderSkeleton();
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  skeletonItem: {
    backgroundColor: "#E1E9EE",
    marginVertical: 2,
  },

  // Dashboard styles
  dashboardHeader: {
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
  },
  statContent: {
    marginTop: 8,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  folderGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  folderCard: {
    flex: 1,
    marginHorizontal: 4,
    padding: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  taskContent: {
    flex: 1,
    marginLeft: 12,
  },

  // Tasks styles
  tasksHeader: {
    marginBottom: 20,
  },
  filterContainer: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8,
  },
  taskCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  taskCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  taskCardContent: {
    flex: 1,
    marginLeft: 12,
  },
  taskCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },

  // Notes styles
  notesHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  notesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  noteCard: {
    width: "48%",
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  noteCardContent: {
    marginTop: 8,
  },
  noteCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },

  // List styles
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    marginBottom: 8,
  },
  listContent: {
    flex: 1,
    marginLeft: 12,
  },

  // Card styles
  cardItem: {
    marginBottom: 12,
  },
});

export default SkeletonLoader;
