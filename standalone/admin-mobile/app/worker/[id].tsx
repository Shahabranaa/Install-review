import React from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface WorkerCertification {
  id: number;
  expiryDate: string | null;
  verified: boolean;
  rejected: boolean;
  dateAchieved: string | null;
  certification: { name: string; category: string | null };
}

interface SiteAssignment {
  id: number;
  status: string;
  site: { id: number; name: string; location: string | null };
}

interface WorkerDetail {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  active: boolean;
  role: { name: string } | null;
  certifications: WorkerCertification[];
  assignments: SiteAssignment[];
}

function certStatus(cert: WorkerCertification): { label: string; color: "success" | "warning" | "error" } {
  if (cert.rejected) return { label: "Rejected", color: "error" };
  if (!cert.verified) return { label: "Pending review", color: "warning" };
  if (cert.expiryDate) {
    const days = Math.round(
      (new Date(cert.expiryDate).getTime() - Date.now()) / 86400000
    );
    if (days < 0) return { label: "Expired", color: "error" };
    if (days <= 30) return { label: `Expires in ${days}d`, color: "warning" };
  }
  return { label: "Verified", color: "success" };
}

export default function WorkerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();

  const workerQ = useQuery<WorkerDetail>({
    queryKey: ["worker-detail", id],
    queryFn: () => apiFetch(`/api/workforce/workers/${id}`),
    enabled: !!id,
  });

  if (workerQ.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const worker = workerQ.data;
  if (!worker) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Worker not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <View style={[styles.headerCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{worker.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>{worker.name}</Text>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {worker.role?.name ?? "No role"}
          {worker.company ? ` · ${worker.company}` : ""}
        </Text>
        {worker.email ? (
          <View style={styles.contactRow}>
            <Feather name="mail" size={13} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>{worker.email}</Text>
          </View>
        ) : null}
        {worker.phone ? (
          <View style={styles.contactRow}>
            <Feather name="phone" size={13} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>{worker.phone}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Sites</Text>
      <View style={styles.list}>
        {worker.assignments.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No site assignments.
          </Text>
        ) : (
          worker.assignments.map((a) => (
            <View
              key={a.id}
              style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={[styles.rowTitle, { color: colors.foreground }]}>{a.site.name}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
                {a.status}
              </Text>
            </View>
          ))
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Certifications</Text>
      <View style={styles.list}>
        {worker.certifications.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No certifications on file.
          </Text>
        ) : (
          worker.certifications.map((cert) => {
            const status = certStatus(cert);
            const bg =
              status.color === "success"
                ? colors.successLight
                : status.color === "warning"
                ? colors.warningLight
                : colors.errorLight;
            const fg =
              status.color === "success"
                ? colors.success
                : status.color === "warning"
                ? colors.warning
                : colors.error;
            return (
              <View
                key={cert.id}
                style={[styles.rowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>
                    {cert.certification.name}
                  </Text>
                  {cert.expiryDate ? (
                    <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
                      Expires {cert.expiryDate}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: bg }]}>
                  <Text style={{ color: fg, fontSize: 11, fontWeight: "600" }}>{status.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 10 },
  headerCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 4 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  name: { fontSize: 18, fontWeight: "700" },
  meta: { fontSize: 13 },
  contactRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginTop: 10 },
  list: { gap: 8 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rowTitle: { fontSize: 14, fontWeight: "600" },
  rowSubtitle: { fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  emptyText: { fontSize: 13, paddingVertical: 8 },
});
