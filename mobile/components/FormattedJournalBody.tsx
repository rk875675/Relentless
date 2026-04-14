import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/lib/theme';

type Props = { body: string };

const LABEL_RE = /^([A-Za-z ]+): (.+)$/;

function renderBlock(block: string, key: number) {
  const lines = block.split('\n').filter((l) => l.trim());
  if (!lines.length) return null;

  if (lines.every((l) => l.trim().startsWith('•'))) {
    return (
      <View key={key} style={styles.group}>
        {lines.map((l, i) => (
          <View key={i} style={styles.bulletRow}>
            <Text style={styles.bulletDot}>{'\u2022'}</Text>
            <Text style={styles.bulletText}>{l.trim().slice(1).trim()}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (lines.length >= 2 && lines.every((l) => LABEL_RE.test(l.trim()))) {
    return (
      <View key={key} style={styles.group}>
        {lines.map((l, i) => {
          const m = l.trim().match(LABEL_RE)!;
          return (
            <Text key={i} style={styles.labeledLine}>
              <Text style={styles.labelText}>{m[1]}:{' '}</Text>
              <Text style={styles.valueText}>{m[2]}</Text>
            </Text>
          );
        })}
      </View>
    );
  }

  if (lines.length >= 2 && lines[0].includes('?')) {
    return (
      <View key={key} style={styles.group}>
        <Text style={styles.questionText}>{lines[0].trim()}</Text>
        <Text style={styles.answerText}>
          {lines.slice(1).join('\n').trim()}
        </Text>
      </View>
    );
  }

  return (
    <Text key={key} style={[styles.answerText, styles.group]}>
      {block.trim()}
    </Text>
  );
}

export default function FormattedJournalBody({ body }: Props) {
  const sections = body.split('\n\n---\n\n');

  return (
    <View>
      {sections.map((section, si) => {
        const blocks = section.split('\n\n').filter((b) => b.trim());
        return (
          <React.Fragment key={si}>
            {si > 0 && <View style={styles.divider} />}
            {blocks.map((b, bi) => renderBlock(b, bi))}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  group: {
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  bulletDot: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    width: 16,
  },
  bulletText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
  labeledLine: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  labelText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  valueText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  questionText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: 4,
  },
  answerText: {
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
  },
});
