import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import { apiPost } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let lastRegisteredWorkerId: number | null = null;

export async function registerForPushNotificationsAsync(workerId: number): Promise<void> {
  if (Platform.OS === "web") return;
  // Re-register whenever the logged-in worker changes (e.g. worker A logs
  // out and worker B logs in on the same device) so the push token always
  // maps to the currently authenticated worker, not a stale prior session.
  if (lastRegisteredWorkerId === workerId) return;

  try {
    if (!Device.isDevice) {
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      return;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResponse.data;
    if (!token) return;

    await apiPost("/api/worker-portal/push-token", {
      token,
      platform: Platform.OS,
    });

    lastRegisteredWorkerId = workerId;
  } catch (err) {
    console.warn("Push notification registration failed", err);
  }
}

export function resetPushRegistrationState(): void {
  lastRegisteredWorkerId = null;
}
