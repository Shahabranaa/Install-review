import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

interface WorkerProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  passportNo: string | null;
  passportExpiryDate: string | null;
  passportWasabiKey: string | null;
  nokName: string | null;
  nokPhone: string | null;
  cvWasabiKey: string | null;
  cvUploadedAt: string | null;
}

interface WorkerCert {
  id: number;
  expiryDate: string | null;
  verified: boolean;
  rejected: boolean;
  fileUrl: string | null;
  dateAchieved: string | null;
  certification: { name: string };
}

interface RotationPeriod {
  id: number;
  plannedStart: string;
  plannedEnd: string | null;
  status: string;
  siteName: string;
  siteLocation: string | null;
}

interface ScheduleResponse {
  rotations: RotationPeriod[];
}

function fmtDate(d: string | null) {
  if (!d) return null;
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  );
}

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function monthsAgo(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth())
  );
}

function SummaryCard({
  title,
  icon,
  color,
  children,
  onPress,
}: {
  title: string;
  icon: string;
  color: string;
  children: React.ReactNode;
  onPress?: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBox, { backgroundColor: color + "18" }]}>
          <Feather name={icon as any} size={16} color={color} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        {onPress && (
          <TouchableOpacity onPress={onPress} style={styles.cardChevron}>
            <Feather
              name="chevron-right"
              size={16}
              color={colors.mutedForeground}
            />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function AlertBanner({
  icon,
  title,
  message,
  variant,
  onPress,
}: {
  icon: string;
  title: string;
  message: string;
  variant: "warning" | "error";
  onPress?: () => void;
}) {
  const colors = useColors();
  const bg =
    variant === "error" ? colors.errorLight : colors.warningLight;
  const border =
    variant === "error" ? colors.errorBorder : colors.warningBorder;
  const iconColor = variant === "error" ? colors.error : colors.warning;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[styles.alertBanner, { backgroundColor: bg, borderColor: border }]}
    >
      <Feather name={icon as any} size={16} color={iconColor} />
      <View style={styles.alertText}>
        <Text style={[styles.alertTitle, { color: iconColor }]}>{title}</Text>
        <Text style={[styles.alertMsg, { color: iconColor + "cc" }]}>
          {message}
        </Text>
      </View>
      {onPress && (
        <Feather name="chevron-right" size={14} color={iconColor + "aa"} />
      )}
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { worker } = useAuth();

  const profileQ = useQuery<WorkerProfile>({
    queryKey: ["worker-profile"],
    queryFn: () => apiFetch("/api/worker-portal/profile"),
  });

  const certsQ = useQuery<WorkerCert[]>({
    queryKey: ["worker-certs"],
    queryFn: () => apiFetch("/api/worker-portal/certifications"),
  });

  const scheduleQ = useQuery<ScheduleResponse>({
    queryKey: ["worker-schedule"],
    queryFn: () => apiFetch("/api/worker-portal/schedule"),
  });

  const isRefreshing =
    profileQ.isFetching || certsQ.isFetching || scheduleQ.isFetching;

  function onRefresh() {
    qc.invalidateQueries({ queryKey: ["worker-profile"] });
    qc.invalidateQueries({ queryKey: ["worker-certs"] });
    qc.invalidateQueries({ queryKey: ["worker-schedule"] });
  }

  const profile = profileQ.data;
  const certs = certsQ.data ?? [];
  const rotations = scheduleQ.data?.rotations ?? [];

  const certSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in60 = new Date(today);
    in60.setDate(in60.getDate() + 60);
    let valid = 0,
      expiringSoon = 0,
      expired = 0,
      needsAction = 0;
    for (const c of certs) {
      if (c.rejected || !c.fileUrl || !c.dateAchieved) {
        needsAction++;
        continue;
      }
      if (c.expiryDate) {
        const exp = new Date(c.expiryDate + "T00:00:00");
        if (exp < today) {
          expired++;
          continue;
        }
        if (exp <= in60) {
          expiringSoon++;
          continue;
        }
      }
      valid++;
    }
    return { total: certs.length, valid, expiringSoon, expired, needsAction };
  }, [certs]);

  const nextRotation = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = rotations
      .filter((r) => {
        if (r.status === "cancelled") return false;
        const start = new Date(r.plannedStart + "T00:00:00");
        const end = r.plannedEnd ? new Date(r.plannedEnd + "T00:00:00") : null;
        return end === null || end >= today;
      })
      .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    return upcoming[0] ?? null;
  }, [rotations]);

  const profileChecks = useMemo(() => {
    if (!profile) return { pct: 0, done: 0, total: 6 };
    const checks = [
      !!profile.name,
      !!profile.email,
      !!profile.phone,
      !!profile.passportWasabiKey,
      !!profile.cvWasabiKey,
      !!(profile.nokName && profile.nokPhone),
    ];
    const done = checks.filter(Boolean).length;
    return { pct: Math.round((done / checks.length) * 100), done, total: checks.length };
  }, [profile]);

  const passportAlert = useMemo(() => {
    if (!profile?.passportExpiryDate) return null;
    const days = daysUntil(profile.passportExpiryDate);
    if (days > 90) return null;
    return { days, isExpired: days < 0 };
  }, [profile]);

  const cvAlert = useMemo(() => {
    if (!profile?.cvUploadedAt || !profile.cvWasabiKey) return null;
    const months = monthsAgo(profile.cvUploadedAt);
    return months >= 6 ? months : null;
  }, [profile]);

  const isLoading = profileQ.isLoading || certsQ.isLoading || scheduleQ.isLoading;

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: insets.bottom + 100 },
      ]}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={!!isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
        Welcome back,
      </Text>
      <Text style={[styles.name, { color: colors.foreground }]}>
        {worker?.name ?? "Worker"}
      </Text>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          {passportAlert && (
            <AlertBanner
              icon="shield"
              variant={passportAlert.isExpired ? "error" : "warning"}
              title={
                passportAlert.isExpired
                  ? "Passport expired"
                  : "Passport expiring soon"
              }
              message={
                passportAlert.isExpired
                  ? `Expired ${Math.abs(passportAlert.days)}d ago — update your profile`
                  : `Expires in ${passportAlert.days} day${passportAlert.days !== 1 ? "s" : ""} — update your profile`
              }
              onPress={() => router.push("/(tabs)/profile")}
            />
          )}

          {cvAlert !== null && (
            <AlertBanner
              icon="file-text"
              variant="warning"
              title="Update your CV"
              message={`Uploaded ${cvAlert} month${cvAlert !== 1 ? "s" : ""} ago — keep it current`}
              onPress={() => router.push("/(tabs)/profile")}
            />
          )}

          {profile && (
            <SummaryCard
              title="Profile"
              icon="user"
              color={
                profileChecks.pct === 100
                  ? colors.success
                  : profileChecks.pct >= 60
                  ? colors.primary
                  : colors.warning
              }
              onPress={() => router.push("/(tabs)/profile")}
            >
              <View style={styles.progressRow}>
                <Text
                  style={[styles.progressLabel, { color: colors.mutedForeground }]}
                >
                  {profileChecks.done}/{profileChecks.total} fields complete
                </Text>
                <Text
                  style={[styles.progressPct, { color: colors.foreground }]}
                >
                  {profileChecks.pct}%
                </Text>
              </View>
              <View
                style={[styles.progressBar, { backgroundColor: colors.muted }]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${profileChecks.pct}%` as any,
                      backgroundColor:
                        profileChecks.pct === 100
                          ? colors.success
                          : profileChecks.pct >= 60
                          ? colors.primary
                          : colors.warning,
                    },
                  ]}
                />
              </View>
            </SummaryCard>
          )}

          <SummaryCard
            title="Certifications"
            icon="award"
            color={
              certSummary.expired > 0 || certSummary.needsAction > 0
                ? colors.error
                : certSummary.expiringSoon > 0
                ? colors.warning
                : colors.success
            }
            onPress={() => router.push("/(tabs)/certifications")}
          >
            {certSummary.total === 0 ? (
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                No certifications on record
              </Text>
            ) : (
              <View style={styles.badgeRow}>
                {certSummary.valid > 0 && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colors.successLight,
                        borderColor: colors.successBorder,
                      },
                    ]}
                  >
                    <Feather
                      name="check-circle"
                      size={11}
                      color={colors.success}
                    />
                    <Text style={[styles.badgeText, { color: colors.success }]}>
                      {certSummary.valid} valid
                    </Text>
                  </View>
                )}
                {certSummary.expiringSoon > 0 && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colors.warningLight,
                        borderColor: colors.warningBorder,
                      },
                    ]}
                  >
                    <Feather name="clock" size={11} color={colors.warning} />
                    <Text
                      style={[styles.badgeText, { color: colors.warning }]}
                    >
                      {certSummary.expiringSoon} expiring
                    </Text>
                  </View>
                )}
                {certSummary.expired > 0 && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colors.errorLight,
                        borderColor: colors.errorBorder,
                      },
                    ]}
                  >
                    <Feather
                      name="x-circle"
                      size={11}
                      color={colors.error}
                    />
                    <Text style={[styles.badgeText, { color: colors.error }]}>
                      {certSummary.expired} expired
                    </Text>
                  </View>
                )}
                {certSummary.needsAction > 0 && (
                  <View
                    style={[
                      styles.badge,
                      {
                        backgroundColor: colors.errorLight,
                        borderColor: colors.errorBorder,
                      },
                    ]}
                  >
                    <Feather
                      name="alert-triangle"
                      size={11}
                      color={colors.error}
                    />
                    <Text style={[styles.badgeText, { color: colors.error }]}>
                      {certSummary.needsAction} action needed
                    </Text>
                  </View>
                )}
              </View>
            )}
          </SummaryCard>

          <SummaryCard
            title="Schedule"
            icon="calendar"
            color={colors.primary}
            onPress={() => router.push("/(tabs)/schedule")}
          >
            {!nextRotation ? (
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                No upcoming rotations scheduled
              </Text>
            ) : (
              <View style={styles.rotationBox}>
                <View style={styles.rotationRow}>
                  <View
                    style={[
                      styles.rotationDot,
                      {
                        backgroundColor:
                          nextRotation.status === "active"
                            ? colors.success
                            : colors.primary,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.rotationStatus,
                      {
                        color:
                          nextRotation.status === "active"
                            ? colors.success
                            : colors.primary,
                      },
                    ]}
                  >
                    {nextRotation.status === "active"
                      ? "Current rotation"
                      : "Upcoming rotation"}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.rotationSite,
                    { color: colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {nextRotation.siteName}
                </Text>
                {nextRotation.siteLocation && (
                  <Text
                    style={[
                      styles.rotationLocation,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    <Feather name="map-pin" size={11} />{" "}
                    {nextRotation.siteLocation}
                  </Text>
                )}
                <Text
                  style={[
                    styles.rotationDates,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {fmtDate(nextRotation.plannedStart)}
                  {nextRotation.plannedEnd
                    ? ` → ${fmtDate(nextRotation.plannedEnd)}`
                    : " onwards"}
                </Text>
              </View>
            )}
          </SummaryCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  name: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  loadingBox: { flex: 1, alignItems: "center", paddingTop: 40 },
  alertBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertText: { flex: 1, gap: 2 },
  alertTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  alertMsg: { fontSize: 12, fontFamily: "Inter_400Regular" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
  },
  cardIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardChevron: { padding: 2 },
  cardBody: { padding: 14, paddingTop: 10 },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  progressLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressPct: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rotationBox: { gap: 4 },
  rotationRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rotationDot: { width: 6, height: 6, borderRadius: 3 },
  rotationStatus: { fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  rotationSite: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rotationLocation: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rotationDates: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
