import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'eventspace/onboarded/v1';

export const hasOnboarded = () => AsyncStorage.getItem(KEY).then((v) => v === '1', () => true);
export const setOnboarded = () => AsyncStorage.setItem(KEY, '1').catch(() => {});
