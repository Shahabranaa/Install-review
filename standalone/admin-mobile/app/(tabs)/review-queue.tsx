import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  TextInput,
  Linking,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiFetch, apiPatch } from "@/lib/api";
import { getBaseUrl } from "@/lib/config";

interface ReviewItem {
  workerId: number;
  workerName: string;
  certId: number;
  certName: string;
  certCategory: string | null;
  dateAchieved: string | null;
  expiryDate: string | null;
  submittedAt: string;
  fileUrl: string | null;
}

export default function ReviewQueueScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ReviewItem | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const queueQ = useQuery<ReviewItem[]>({
    queryKey: ["review-queue"],
    queryFn: () => apiFetch("/api/workforce/review-queue"),
  });

  async function approve(item: ReviewItem) {
    const key = `${item.workerId}-${item.certId}`;
    setBusyKey(key);
    try {
      await apiPatch(`/api/workforce/workers/${item.workerId}/certifications/${item.certId}`, {
        verified: true,
        verifiedAt: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey: ["review-queue"] });
    } catch (err) {
      console.warn("Failed to approve", err);
    } finally {
      setBusyKey(null);
    }
  }

  async function submitReject() {
    if (!rejectTarget) return;
    const key = `${rejectTarget.workerId}-${rejectTarget.certId}`;
    setBusyKey(key);
    try {
      await apiPatch(
        `/api/workforce/workers/${rejectTarget.workerId}/certifications/${rejectTarget.certId}/reject`,
        { rejected: true, rejectionComment: rejectComment || null }
      );
      qc.invalidateQueries({ queryKey: ["review-queue"] });
      setRejectTarget(null);
      setRejectComment("");
    } catch (err) {
      console.warn("Failed to reject", err);
    } finally {
      setBusyKey(null);
    }
  }

  function openFile(item: ReviewItem) {
    if (!item.fileUrl) return;
    const url = `${getBaseUrl()}/api/workforce/workers/${item.workerId}/certifications/${item.certId}/file`;
    Linking.openURL(url).catch(() => {});
  }

  if (queueQ.isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const items = queueQ.data ?? [];

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={queueQ.isRefetching}
            onRefresh={() => queueQ.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={32} color={colors.success} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Nothing pending review.
            </Text>
          </View>
        ) : (
          items.map((item) => {
            const key = `${item.workerId}-${item.certId}`;
            const busy = busyKey === key;
            return (
              <View
                key={key}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.workerName, { color: colors.foreground }]}>
                    {item.workerName}
                  </Text>
                  {item.fileUrl ? (
                    <TouchableOpacity onPress={() => openFile(item)} hitSlop={6}>
                      <Feather name="file-text" size={18} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={[styles.certName, { color: colors.mutedForeground }]}>
                  {item.certName}
                  {item.certCategory ? ` · ${item.certCategory}` : ""}
                </Text>
                {item.expiryDate ? (
                  <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                    Expires {item.expiryDate}
                  </Text>
                ) : null}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.successLight }]}
                    onPress={() => approve(item)}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator size="small" color={colors.success} />
                    ) : (
                      <>
                        <Feather name="check" size={14} color={colors.success} />
                        <Text style={[styles.actionText, { color: colors.success }]}>
                          Approve
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.errorLight }]}
                    onPress={() => {
                      setRejectTarget(item);
                      setRejectComment("");
                    }}
                    disabled={busy}
                  >
                    <Feather name="x" size={14} color={colors.error} />
                    <Text style={[styles.actionText, { color: colors.error }]}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!rejectTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Reject {rejectTarget?.certName}
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: colors.foreground, borderColor: colors.border },
              ]}
              placeholder="Reason (optional)"
              placeholderTextColor={colors.mutedForeground}
              value={rejectComment}
              onChangeText={setRejectComment}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.secondary }]}
                onPress={() => setRejectTarget(null)}
              >
                <Text style={{ color: colors.foreground }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.destructive }]}
                onPress={submitReject}
              >
                <Text style={{ color: colors.destructiveForeground }}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { padding: 16, gap: 12 },
  emptyState: { alignItems: "center", gap: 10, paddingVertical: 48 },
  emptyText: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  workerName: { fontSize: 15, fontWeight: "600" },
  certName: { fontSize: 13 },
  meta: { fontSize: 12 },
  actions: { flexDirection: "row", gap: 8, marginTop: 6 },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionText: { fontSize: 13, fontWeight: "600" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: { width: "100%", borderRadius: 16, padding: 20, gap: 12 },
  modalTitle: { fontSize: 16, fontWeight: "700" },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
});
