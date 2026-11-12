import {
  Champagne,
  Confetti,
  FilmSlate,
  FlowerLotus,
  ForkKnife,
  HandHeart,
  Lightbulb,
  MaskHappy,
  MicrophoneStage,
  MusicNotes,
  PaintBrush,
  Smiley,
  SoccerBall,
  UsersThree,
  Waves,
  type Icon,
} from '@/components/icons';

import type { Category } from '@/data/events';

// One icon per category, shared by covers and filters.
export const categoryIcons: Record<Category, Icon> = {
  Music: MusicNotes,
  Nightlife: Champagne,
  Culture: MaskHappy,
  Food: ForkKnife,
  Water: Waves,
  Sport: SoccerBall,
  Art: PaintBrush,
  Comedy: Smiley,
  Film: FilmSlate,
  Wellness: FlowerLotus,
  Talks: MicrophoneStage,
  Workshop: Lightbulb,
  Family: UsersThree,
  Festival: Confetti,
  Charity: HandHeart,
};
