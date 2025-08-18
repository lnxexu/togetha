import { TemplateType } from '../components/TemplateOverlay';

export interface TemplateConfig {
  name: string;
  description: string;
  icon: string;
  defaultGridSize?: number;
  defaultLineHeight?: number;
  defaultMargin?: number;
  recommendedTools?: string[];
  backgroundColor?: string;
}

export const TEMPLATE_CONFIGS: Record<TemplateType, TemplateConfig> = {
  blank: {
    name: 'Blank Canvas',
    description: 'Clean, unlimited canvas for free drawing',
    icon: 'crop-din',
    recommendedTools: ['pen', 'brush', 'pencil'],
    backgroundColor: '#FFFFFF',
  },
  
  grid: {
    name: 'Grid Paper',
    description: 'Perfect for technical drawings and sketches',
    icon: 'grid-on',
    defaultGridSize: 20,
    recommendedTools: ['pen', 'pencil'],
    backgroundColor: '#FFFFFF',
  },
  
  lines: {
    name: 'Lined Paper',
    description: 'Great for note-taking and writing',
    icon: 'format-align-justify',
    defaultLineHeight: 24,
    defaultMargin: 40,
    recommendedTools: ['pen', 'pencil'],
    backgroundColor: '#FFFFFF',
  },
  
  dots: {
    name: 'Dot Grid',
    description: 'Flexible grid for bullet journaling',
    icon: 'more-horiz',
    recommendedTools: ['pen', 'marker'],
    backgroundColor: '#FFFFFF',
  },
  
  sketch: {
    name: 'Sketch Pad',
    description: 'Construction lines for artistic sketching',
    icon: 'brush',
    recommendedTools: ['pencil', 'brush'],
    backgroundColor: '#FAFAFA',
  },
  
  notes: {
    name: 'Note Layout',
    description: 'Structured layout for organized note-taking',
    icon: 'note-add',
    defaultLineHeight: 24,
    defaultMargin: 60,
    recommendedTools: ['pen', 'highlighter'],
    backgroundColor: '#FFFFFF',
  },
};

export function getTemplateConfig(template: TemplateType): TemplateConfig {
  return TEMPLATE_CONFIGS[template];
}

export function getTemplateOptions(template: TemplateType) {
  const config = getTemplateConfig(template);
  return {
    gridSize: config.defaultGridSize,
    lineHeight: config.defaultLineHeight,
    margin: config.defaultMargin,
  };
}

export function getRecommendedTools(template: TemplateType): string[] {
  return getTemplateConfig(template).recommendedTools || ['pen'];
}

export function getTemplateBackgroundColor(template: TemplateType): string {
  return getTemplateConfig(template).backgroundColor || '#FFFFFF';
}
