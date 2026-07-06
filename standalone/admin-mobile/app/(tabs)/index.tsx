import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface DashboardData {
  totalWorkers: number;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
  unassignedCount: number;
  expiringInNext30Days: {
    workerId: number;
    workerName: string;
    certName: string;
    expiryDate: string;
    daysUntilExpiry: number;
  }[];
}

interface SiteWithStats {
  id: number;
  name: string;
  location: string | null;
  workerCount: number;
  readyCount: number;
  expiringCount: number;
  nonCompliantCount: number;
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View
      style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.statIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon as any} size={16} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const colors = useColors();

  const dashboardQ = useQuery<DashboardData>({
    queryKey: ["admin-dashboard"],
    queryFn: () => apiFetch("/api/workforce/dashboard"),
  });

  const sitesQ = useQuery<SiteWithStats[]>({
    queryKey: ["admin-sites-with-stats"],
    queryFn: () => apiFetch("/api/workforce/sites-with-stats"),
  });

  const loading = dashboardQ.isLoading || sitesQ.isLoading;
  const refreshing = dashboardQ.isRefetching || sitesQ.isRefetching;

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const dashboard = dashboardQ.data;
  const sites = sitesQ.data ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            dashboardQ.refetch();
            sitesQ.refetch();
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.statsGrid}>
        <StatCard
          label="Total Workers"
          value={dashboard?.totalWorkers ?? 0}
          icon="users"
          color={colors.primary}
        />
        <StatCard
          label="Ready"
          value={dashboard?.readyCount ?? 0}
          icon="check-circle"
          color={colors.success}
        />
        <StatCard
          label="Expiring"
          value={dashboard?.expiringCount ?? 0}
          icon="clock"
          color={colors.warning}
        />
        <StatCard
          label="Non-compliant"
          value={dashboard?.nonCompliantCount ?? 0}
          icon="alert-triangle"
          color={colors.error}
        />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sites</Text>
      <View style={styles.sitesList}>
        {sites.map((site) => (
          <View
            key={site.id}
            style={[styles.siteCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.siteHeader}>
              <Text style={[styles.siteName, { color: colors.foreground }]}>{site.name}</Text>
              <Text style={[styles.siteWorkerCount, { color: colors.mutedForeground }]}>
                {site.workerCount} worker{site.workerCount === 1 ? "" : "s"}
              </Text>
            </View>
            {site.location ? (
              <Text style={[styles.siteLocation, { color: colors.mutedForeground }]}>
                {site.location}
              </Text>
            ) : null}
            <View style={styles.siteBadges}>
              <View style={[styles.badge, { backgroundColor: colors.successLight }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>
                  {site.readyCount} ready
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.warningLight }]}>
                <Text style={[styles.badgeText, { color: colors.warning }]}>
                  {site.expiringCount} expiring
                </Text>
              </View>
              <View style={[styles.badge, { backgroundColor: colors.errorLight }]}>
                <Text style={[styles.badgeText, { color: colors.error }]}>
                  {site.nonCompliantCount} issues
                </Text>
              </View>
            </View>
          </View>
        ))}
        {sites.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No sites yet.
          </Text>
        ) : null}
      </View>

      {dashboard?.expiringInNext30Days && dashboard.expiringInNext30Days.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Expiring Soon
          </Text>
          <View style={styles.sitesList}>
            {dashboard.expiringInNext30Days.slice(0, 10).map((item, idx) => (
              <View
                key={`${item.workerId}-${item.certName}-${idx}`}
                style={[styles.expiringRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.expiringName, { color: colors.foreground }]}>
                    {item.workerName}
                  </Text>
                  <Text style={[styles.expiringCert, { color: colors.mutedForeground }]}>
                    {item.certName}
                  </Text>
                </View>
                <Text style={[styles.expiringDays, { color: colors.warning }]}>
                  {item.daysUntilExpiry}d
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: {
    flexBasis: "47%",
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statValue: { fontSize: 22, fontWeight: "700" },
  statLabel: { fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  sitesList: { gap: 10 },
  siteCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  siteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  siteName: { fontSize: 15, fontWeight: "600" },
  siteWorkerCount: { fontSize: 12 },
  siteLocation: { fontSize: 12 },
  siteBadges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  emptyText: { fontSize: 13, textAlign: "center", paddingVertical: 12 },
  expiringRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  expiringName: { fontSize: 14, fontWeight: "600" },
  expiringCert: { fontSize: 12 },
  expiringDays: { fontSize: 14, fontWeight: "700" },
});
