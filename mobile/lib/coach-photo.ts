import type { ImageSourcePropType } from 'react-native';
import { GRANT_CHIASSON_NAME } from './grant-attribution';

/**
 * Grant's portrait ships as a bundled asset (it is not stored in the avatar
 * bucket), so anywhere a Grant program/coach is shown we fall back to this.
 */
export const GRANT_PHOTO = require('../assets/images/grant_chiasson_hero.png') as ImageSourcePropType;

/**
 * Resolve a coach avatar source: the signed URL when the API provides one,
 * otherwise Grant's bundled photo for any Grant-authored pack, otherwise null
 * (caller renders a neutral placeholder).
 */
export function coachAvatarSource(
  avatarUrl?: string | null,
  coachName?: string | null,
): ImageSourcePropType | null {
  if (avatarUrl) return { uri: avatarUrl };
  if (coachName === GRANT_CHIASSON_NAME) return GRANT_PHOTO;
  return null;
}
