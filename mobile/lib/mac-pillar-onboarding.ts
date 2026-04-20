import { colors } from '@/lib/theme';

export type MacPillarTag = 'M' | 'A' | 'C';

export type MacPillarContent = {
  letter: string;
  name: string;
  color: string;
  tagline: string;
  body: string;
};

/** Single source for MAC pillar copy used on framework intro and per-tag detail screens. */
export const MAC_PILLAR_BY_TAG: Record<MacPillarTag, MacPillarContent> = {
  M: {
    letter: 'M',
    name: 'Mindfulness',
    color: colors.ringMindfulness,
    tagline: 'Stay present when it matters most.',
    body: 'Notice where your attention is — and choose where it goes. Instead of spiraling before competition, you learn to stay locked in on what matters right now.',
  },
  A: {
    letter: 'A',
    name: 'Acceptance',
    color: colors.ringAcceptance,
    tagline: 'Feel it. Don\u2019t fight it.',
    body: "Discomfort is part of competing. The skill isn\u2019t avoiding it — it\u2019s learning to keep going when doubt, pain, or frustration show up.",
  },
  C: {
    letter: 'C',
    name: 'Commitment',
    color: colors.ringCommitment,
    tagline: 'Know why you show up.',
    body: "Connect to the reasons you compete. When you know who you want to become, it\u2019s easier to show up — even when you don\u2019t feel like it.",
  },
};

export const MAC_PILLARS_ORDER: readonly MacPillarTag[] = ['M', 'A', 'C'];

export function getMacPillarForTag(tag: string | undefined): MacPillarContent {
  if (tag === 'M' || tag === 'A' || tag === 'C') return MAC_PILLAR_BY_TAG[tag];
  return MAC_PILLAR_BY_TAG.M;
}
