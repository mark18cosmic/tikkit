import * as Device from 'expo-device';
import { Platform } from 'react-native';

// The iOS Simulator has no camera and no haptic engine. Every physical
// iPhone has a rear camera, so "physical device" is a reliable proxy.
export const isPhysicalDevice = Device.isDevice;
export const hasCamera = Platform.OS !== 'web' && Device.isDevice;
