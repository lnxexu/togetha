import React, { useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export interface Flashcard {
  question: string;
  answer?: string;
}

interface FlashcardModalProps {
  visible: boolean;
  onClose: () => void;
  flashcards: Flashcard[];
  title?: string;
}

const FlashcardModal: React.FC<FlashcardModalProps> = ({ visible, onClose, flashcards, title = 'Practice Questions' }) => {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const total = flashcards?.length || 0;
  const current = flashcards?.[index] || { question: '', answer: '' };
  const displayIndex = Math.max(1, Math.min(index + 1, Math.max(total, 1)));

  const canPrev = index > 0;
  const canNext = index < total - 1;

  const handlePrev = () => {
    if (!canPrev) return;
    setShowAnswer(false);
    setIndex((i) => Math.max(0, i - 1));
  };

  const handleNext = () => {
    if (!canNext) return;
    setShowAnswer(false);
    setIndex((i) => Math.min(total - 1, i + 1));
  };

  const progressText = useMemo(() => `${Math.min(index + 1, total)} / ${Math.max(total, 1)}`, [index, total]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.container}>
        <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </LinearGradient>

        {total === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No flashcards to show</Text>
            <Text style={styles.emptySubtitle}>Ask Rina to create practice questions or flashcards to see them here.</Text>
          </View>
        ) : (
          <View style={styles.content}>
            {total > 1 && (
              <View style={styles.progressBarWrapper}>
                <View style={styles.progressTrack} />
                <View style={[styles.progressFill, { width: `${((index + 1) / total) * 100}%` }]} />
                <Text style={styles.progressText}>{progressText}</Text>
              </View>
            )}

            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.numberChip}>
                  <Text style={styles.numberChipText}>{displayIndex}</Text>
                </View>
              </View>
              <ScrollView style={styles.cardScroll} contentContainerStyle={{ padding: 16 }}>
                {!showAnswer ? (
                  <>
                    <Text style={styles.cardLabel}>Q (Front)</Text>
                    <Text style={styles.questionText}>{current.question || '—'}</Text>
                  </>
                ) : (
                  <>
                    <Text style={[styles.cardLabel, { color: '#065F46' }]}>A (Back)</Text>
                    <Text style={styles.answerText}>{current.answer || '—'}</Text>
                  </>
                )}
              </ScrollView>

              {!!current.answer && (
                <TouchableOpacity style={styles.flipButton} onPress={() => setShowAnswer((v) => !v)}>
                  <Ionicons name={showAnswer ? 'eye-off' : 'eye'} size={16} color="#6B46C1" />
                  <Text style={styles.flipText}>{showAnswer ? 'Hide answer' : 'Show answer'}</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.footerActions}>
              {total > 1 && (
                <TouchableOpacity
                  style={[styles.navButton, !canPrev && styles.navButtonDisabled]}
                  onPress={handlePrev}
                  disabled={!canPrev}
                  accessibilityLabel="Previous"
                >
                  <Ionicons name="chevron-back" size={20} color={canPrev ? '#6B46C1' : '#94A3B8'} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.showButton}
                onPress={() => setShowAnswer((v) => !v)}
                accessibilityLabel="Toggle answer"
              >
                <LinearGradient colors={["#6366F1", "#8B5CF6"]} style={styles.showButtonGradient}>
                  <Text style={styles.showButtonText}>{showAnswer ? 'Show Question' : 'Show Answer'}</Text>
                </LinearGradient>
              </TouchableOpacity>

              {total > 1 && (
                <TouchableOpacity
                  style={[styles.navButton, !canNext && styles.navButtonDisabled]}
                  onPress={handleNext}
                  disabled={!canNext}
                  accessibilityLabel="Next"
                >
                  <Ionicons name="chevron-forward" size={20} color={canNext ? '#6B46C1' : '#94A3B8'} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#6B46C1',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)'
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  progressBarWrapper: {
    position: 'relative',
    height: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#E2E8F0',
    borderRadius: 8,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#6B46C1',
    borderRadius: 8,
  },
  progressText: {
    position: 'absolute',
    right: 0,
    top: -18,
    fontSize: 12,
    color: '#64748B',
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardScroll: {
    flex: 1,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  numberChip: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  numberChipText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 12,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    lineHeight: 26,
    color: '#111827',
  },
  answerText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#065F46',
  },
  flipButton: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    gap: 8,
  },
  flipText: {
    fontSize: 13,
    color: '#6B46C1',
    fontWeight: '600',
    marginLeft: 6,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  navButtonDisabled: {
    opacity: 0.6,
  },
  showButton: {
    flex: 1,
    marginHorizontal: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  showButtonGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  showButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default FlashcardModal;
