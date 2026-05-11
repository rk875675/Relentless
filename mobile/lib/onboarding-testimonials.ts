import type { ImageSourcePropType } from 'react-native';

/** Shown above the review carousel on onboarding screens that use it. */
export const ONBOARDING_TRUST_HEADLINE = 'Trusted by Elite Athletes';

/**
 * Onboarding social proof. Avatars are bundled JPEGs under
 * `assets/images/testimonials/`: Instagram profile photos for everyone except
 * Svenya Stoyanoff, who uses the official LSU roster image (jersey). Re-export
 * from IG when profile pics change; refresh Svenya from lsusports if they issue
 * a new headshot. Keep `require()` paths in sync.
 */
export type OnboardingTestimonial = {
  quote: string;
  name: string;
  detail: string;
  avatar: ImageSourcePropType;
};

export const ONBOARDING_TESTIMONIALS: OnboardingTestimonial[] = [
  {
    quote:
      "In a sport like pole vault, the greatest limiting factor is the athlete's mind. Mental training is a necessity at all levels and can even affect the best vaulters.",
    name: 'Beau Domingue',
    detail: 'D1 Pole Vaulter',
    avatar: require('@/assets/images/testimonials/beau-domingue.jpg'),
  },
  {
    quote:
      "Mentality is something I've always struggled with, especially going into races. Relentless has helped me feel more confident going into races to perform better.",
    name: 'Svenya Stoyanoff',
    detail: 'D1 Runner at LSU',
    avatar: require('@/assets/images/testimonials/svenya-stoyanoff.jpg'),
  },
  {
    quote:
      'In a sport where the mind can prevent the body from its potential, Relentless reframes training as something that is not only physical, but highly psychological.',
    name: 'Mats Swanson',
    detail: 'D1 Runner at LSU',
    avatar: require('@/assets/images/testimonials/mats-swanson.jpg'),
  },
  {
    quote:
      '[Relentless] is very immersive and allows me to lock in for my competitions. I highly recommend this for athletes who struggle with pre-race nerves or anxiety.',
    name: 'Niko Schultz',
    detail: '1:45 800m runner at Penn State',
    avatar: require('@/assets/images/testimonials/niko-schultz.jpg'),
  },
  {
    quote:
      'Understanding your mind is the first step in being a better athlete, and Relentless is the simplest way to help you show up at your best.',
    name: 'Brock Kelly',
    detail: '2:31 marathoner',
    avatar: require('@/assets/images/testimonials/brock-kelly.jpg'),
  },
];
