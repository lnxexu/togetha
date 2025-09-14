import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';

interface SimpleLineChartProps {
  data: number[];
  labels: string[];
  width?: number;
  height?: number;
  color?: string;
  title?: string;
}

export const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  data,
  labels,
  width = 300,
  height = 150,
  color = '#4CAF50',
  title,
}) => {
  if (data.length === 0) {
    return (
      <View style={[styles.container, { width, height: height + 40 }]}>
        {title && <Text style={styles.title}>{title}</Text>}
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No data available</Text>
        </View>
      </View>
    );
  }

  const maxValue = Math.max(...data, 1);
  const padding = 20;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  // Calculate points for the line
  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - (value / maxValue) * chartHeight;
    return { x, y };
  });

  // Create path string
  const pathData = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x} ${point.y}`;
    }
    return `${path} L ${point.x} ${point.y}`;
  }, '');

  return (
    <View style={[styles.container, { width, height: height + 40 }]}>
      {title && <Text style={styles.title}>{title}</Text>}
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
          <Line
            key={index}
            x1={padding}
            y1={padding + chartHeight * ratio}
            x2={width - padding}
            y2={padding + chartHeight * ratio}
            stroke="#E5E7EB"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
        
        {/* Line path */}
        <Path
          d={pathData}
          stroke={color}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Data points */}
        {points.map((point, index) => (
          <Circle
            key={index}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={color}
            stroke="#fff"
            strokeWidth="2"
          />
        ))}
        
        {/* Labels */}
        {labels.map((label, index) => {
          const point = points[index];
          if (!point) return null;
          return (
            <SvgText
              key={index}
              x={point.x}
              y={height - 5}
              fontSize="10"
              fill="#6B7280"
              textAnchor="middle"
            >
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
};

interface SimpleBarChartProps {
  data: { label: string; tasks: number; notes: number }[];
  width?: number;
  height?: number;
  title?: string;
}

export const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  data,
  width = 300,
  height = 200,
  title,
}) => {
  if (data.length === 0) {
    return (
      <View style={[styles.container, { width, height: height + 40 }]}>
        {title && <Text style={styles.title}>{title}</Text>}
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No data available</Text>
        </View>
      </View>
    );
  }

  const maxValue = Math.max(...data.flatMap(d => [d.tasks, d.notes]), 1);
  const padding = 30;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const barWidth = chartWidth / (data.length * 2.5);

  return (
    <View style={[styles.container, { width, height: height + 60 }]}>
      {title && <Text style={styles.title}>{title}</Text>}
      <Svg width={width} height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => (
          <Line
            key={index}
            x1={padding}
            y1={padding + chartHeight * ratio}
            x2={width - padding}
            y2={padding + chartHeight * ratio}
            stroke="#E5E7EB"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}
        
        {/* Bars */}
        {data.map((item, index) => {
          const x = padding + (index + 0.5) * (chartWidth / data.length);
          const tasksHeight = (item.tasks / maxValue) * chartHeight;
          const notesHeight = (item.notes / maxValue) * chartHeight;
          
          return (
            <React.Fragment key={index}>
              {/* Tasks bar */}
              <View>
                <rect
                  x={x - barWidth / 2}
                  y={padding + chartHeight - tasksHeight}
                  width={barWidth * 0.4}
                  height={tasksHeight}
                  fill="#4CAF50"
                />
              </View>
              
              {/* Notes bar */}
              <View>
                <rect
                  x={x + barWidth * 0.1}
                  y={padding + chartHeight - notesHeight}
                  width={barWidth * 0.4}
                  height={notesHeight}
                  fill="#2196F3"
                />
              </View>
              
              {/* Label */}
              <SvgText
                x={x}
                y={height}
                fontSize="10"
                fill="#6B7280"
                textAnchor="middle"
              >
                {item.label}
              </SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      
      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#4CAF50' }]} />
          <Text style={styles.legendText}>Tasks</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: '#2196F3' }]} />
          <Text style={styles.legendText}>Notes</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 12,
    textAlign: 'center',
  },
  noDataContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'Inter-Regular',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'Inter-Medium',
  },
});