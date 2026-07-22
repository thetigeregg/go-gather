import { PogoEvent, SpotlightBonusInfo } from '@go-gather/shared';

/** Ported from pogo-cal's src/utils/spotlightBonus.ts. */
export function getSpotlightBonusInfo(event: PogoEvent): SpotlightBonusInfo | null {
  if (event.eventType !== 'pokemon-spotlight-hour' || !event.extraData?.spotlight?.bonus) {
    return null;
  }

  const bonus = event.extraData.spotlight.bonus.toLowerCase();

  let bonusType: SpotlightBonusInfo['bonusType'];
  if (/xp/.test(bonus)) {
    bonusType = 'xp';
  } else if (/stardust/.test(bonus)) {
    bonusType = 'stardust';
  } else if (/candy/.test(bonus)) {
    bonusType = 'candy';
  } else {
    console.log('No bonus type matched for:', bonus);
    return null;
  }

  let category: SpotlightBonusInfo['category'];
  if (/catch/.test(bonus)) {
    category = 'catch';
  } else if (/evolution/.test(bonus)) {
    category = 'evolve';
  } else if (/transfer/.test(bonus)) {
    category = 'transfer';
  } else {
    console.log('No category matched for:', bonus);
    return null;
  }

  return { category, bonusType };
}

export function getSpotlightBonusTypeIcon(bonusType: SpotlightBonusInfo['bonusType']): string {
  switch (bonusType) {
    case 'xp':
      return '/assets/pokemon-icons/xp.png';
    case 'stardust':
      return '/assets/pokemon-icons/stardust.png';
    case 'candy':
      return '/assets/pokemon-icons/candy.png';
  }
}
