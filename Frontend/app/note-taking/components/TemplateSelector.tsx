import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TemplateType } from './TemplateOverlay';
import TemplatePreview from './TemplatePreview';
import { TEMPLATE_CONFIGS, getTemplateConfig } from '../utils/templateConfig';

interface TemplateSelectorProps {
  currentTemplate: TemplateType;
  onTemplateChange: (template: TemplateType) => void;
  visible?: boolean;
}

// Get template list from configuration
const TEMPLATE_TYPES: TemplateType[] = Object.keys(TEMPLATE_CONFIGS) as TemplateType[];

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  currentTemplate,
  onTemplateChange,
  visible = true,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Template</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TEMPLATE_TYPES.map((templateType) => {
          const config = getTemplateConfig(templateType);
          return (
            <TouchableOpacity
              key={templateType}
              style={[
                styles.templateOption,
                currentTemplate === templateType && styles.selectedTemplate
              ]}
              onPress={() => onTemplateChange(templateType)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.templateIcon,
                currentTemplate === templateType && styles.selectedIcon
              ]}>
                <TemplatePreview 
                  template={templateType}
                  width={48}
                  height={48}
                />
              </View>
              <Text style={[
                styles.templateName,
                currentTemplate === templateType && styles.selectedText
              ]}>
                {config.name}
              </Text>
              <Text style={[
                styles.templateDescription,
                currentTemplate === templateType && styles.selectedDescriptionText
              ]}>
                {config.description}
              </Text>
              {config.recommendedTools && (
                <Text style={[
                  styles.recommendedTools,
                  currentTemplate === templateType && styles.selectedToolsText
                ]}>
                  {config.recommendedTools.slice(0, 2).join(', ')}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  templateOption: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    minWidth: 90,
    maxWidth: 100,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedTemplate: {
    backgroundColor: '#6A009C',
    borderColor: '#6A009C',
    shadowColor: '#6A009C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  templateIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  selectedIcon: {
    backgroundColor: '#6A009C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  templateName: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 2,
    textAlign: 'center',
  },
  selectedText: {
    color: '#FFFFFF',
  },
  templateDescription: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  selectedDescriptionText: {
    color: '#E5E7EB',
  },
  recommendedTools: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 2,
  },
  selectedToolsText: {
    color: '#D1D5DB',
  },
});

export default TemplateSelector;
