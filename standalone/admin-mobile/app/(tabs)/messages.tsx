import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
} from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiFetch, apiPost } from "@/lib/api";

interface Worker {
  id: number;
  name: string;
  email: string | null;
}

interface ChannelResult {
  channel: "email" | "push";
  status: string;
  error: string | null;
}

interface MessageLog {
  id: string;
  workerId: number | null;
  workerName: string | null;
  toEmail: string | null;
  subject: string;
  messageType: string;
  sentAt: string;
  channels: ChannelResult[];
}

export default function MessagesScreen() {
  const colors = useColors();
  const qc = useQueryClient();
  const [composeOpen, setComposeOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<number[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [useEmail, setUseEmail] = useState(true);
  const [usePush, setUsePush] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const logsQ = useQuery<MessageLog[]>({
    queryKey: ["message-logs"],
    queryFn: () => apiFetch("/api/workforce/emails/logs?limit=50"),
  });

  const workersQ = useQuery<Worker[]>({
    queryKey: ["workers-for-messages", search],
    queryFn: () =>
      apiFetch(`/api/workforce/workers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    enabled: composeOpen,
  });

  function toggleWorker(id: number) {
    setSelectedWorkerIds((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  }

  async function send() {
    if (selectedWorkerIds.length === 0) {
      setSendError("Select at least one worker");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      setSendError("Subject and message are required");
      return;
    }
    const channels: string[] = [];
    if (useEmail) channels.push("email");
    if (usePush) channels.push("push");
    if (channels.length === 0) {
      setSendError("Select at least one channel");
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      await apiPost("/api/workforce/emails/send", {
        emailType: "custom",
        workerIds: selectedWorkerIds,
        subject: subject.trim(),
        bodyHtml: `<p>${body.trim().replace(/\n/g, "</p><p>")}</p>`,
        channels,
      });
      setComposeOpen(false);
      setSelectedWorkerIds([]);
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["message-logs"] });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  const logs = logsQ.data ?? [];

  return (
    <>
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={logsQ.isRefetching}
            onRefresh={() => logsQ.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        <TouchableOpacity
          style={[styles.composeBtn, { backgroundColor: colors.primary }]}
          onPress={() => setComposeOpen(true)}
          activeOpacity={0.8}
        >
          <Feather name="edit-3" size={16} color="#fff" />
          <Text style={styles.composeText}>Compose Message</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent</Text>

        {logsQ.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : logs.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No messages sent yet.
          </Text>
        ) : (
          logs.map((log) => (
            <View
              key={log.id}
              style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.logHeader}>
                <Text style={[styles.logSubject, { color: colors.foreground }]} numberOfLines={1}>
                  {log.subject}
                </Text>
                <Text style={[styles.logDate, { color: colors.mutedForeground }]}>
                  {new Date(log.sentAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={[styles.logWorker, { color: colors.mutedForeground }]}>
                To: {log.workerName ?? "Unknown worker"}
              </Text>
              <View style={styles.channelRow}>
                {log.channels.map((c, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.channelBadge,
                      {
                        backgroundColor:
                          c.status === "sent" ? colors.successLight : colors.errorLight,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "600",
                        color: c.status === "sent" ? colors.success : colors.error,
                      }}
                    >
                      {c.channel} · {c.status}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={composeOpen} animationType="slide">
        <ScrollView
          style={{ flex: 1, backgroundColor: colors.background }}
          contentContainerStyle={styles.modalContainer}
        >
          <View style={styles.modalHeaderRow}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Message</Text>
            <TouchableOpacity onPress={() => setComposeOpen(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {sendError ? (
            <View style={[styles.errorBox, { backgroundColor: colors.errorLight, borderColor: colors.errorBorder }]}>
              <Text style={{ color: colors.error, fontSize: 13 }}>{sendError}</Text>
            </View>
          ) : null}

          <Text style={[styles.label, { color: colors.foreground }]}>Recipients</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            placeholder="Search workers by name"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          <View style={styles.workerList}>
            {(workersQ.data ?? []).map((w) => {
              const selected = selectedWorkerIds.includes(w.id);
              return (
                <TouchableOpacity
                  key={w.id}
                  onPress={() => toggleWorker(w.id)}
                  style={[
                    styles.workerChip,
                    {
                      backgroundColor: selected ? colors.primary : colors.secondary,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? "#fff" : colors.foreground, fontSize: 13 }}>
                    {w.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>Channels</Text>
          <View style={styles.channelToggleRow}>
            <TouchableOpacity
              onPress={() => setUseEmail((v) => !v)}
              style={[
                styles.channelToggle,
                { backgroundColor: useEmail ? colors.primary : colors.secondary },
              ]}
            >
              <Text style={{ color: useEmail ? "#fff" : colors.foreground }}>Email</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setUsePush((v) => !v)}
              style={[
                styles.channelToggle,
                { backgroundColor: usePush ? colors.primary : colors.secondary },
              ]}
            >
              <Text style={{ color: usePush ? "#fff" : colors.foreground }}>Push</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>Subject</Text>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.border }]}
            placeholder="Subject"
            placeholderTextColor={colors.mutedForeground}
            value={subject}
            onChangeText={setSubject}
          />

          <Text style={[styles.label, { color: colors.foreground }]}>Message</Text>
          <TextInput
            style={[
              styles.input,
              styles.textarea,
              { color: colors.foreground, borderColor: colors.border },
            ]}
            placeholder="Write your message..."
            placeholderTextColor={colors.mutedForeground}
            value={body}
            onChangeText={setBody}
            multiline
          />

          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
            onPress={send}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  composeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 10,
    marginBottom: 10,
  },
  composeText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  emptyText: { fontSize: 13, textAlign: "center", paddingVertical: 24 },
  logCard: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  logSubject: { fontSize: 14, fontWeight: "600", flex: 1 },
  logDate: { fontSize: 11 },
  logWorker: { fontSize: 12 },
  channelRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  channelBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  modalContainer: { padding: 20, gap: 8, paddingBottom: 60 },
  modalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  errorBox: { borderWidth: 1, borderRadius: 8, padding: 10, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  workerList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  workerChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  channelToggleRow: { flexDirection: "row", gap: 10 },
  channelToggle: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendBtn: {
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
