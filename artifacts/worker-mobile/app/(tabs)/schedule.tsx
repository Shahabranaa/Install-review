import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { apiFetch, apiPost, apiDelete } from "@/lib/api";

interface RotationPeriod {
  id: number;
  plannedStart: string;
  plannedEnd: string | null;
  status: string;
  siteName: string;
  siteLocation: string | null;
  notes: string | null;
}

interface ScheduleResponse {
  rotations: RotationPeriod[];
}

interface ChangeRequest {
  id: number;
  rotationPeriodId: number;
  requestedStart: string | null;
  requestedEnd: string | null;
  reason: string | null;
  status: string;
  adminNotes: string | null;
  siteName: string;
  originalStart: string;
  originalEnd: string | null;
}

interface ChangeRequestsResponse {
  requests: ChangeRequest[];
}

interface UnavailabilityPeriod {
  id: number;
  label: string | null;
  startDate: string;
  endDate: string;
}

interface UnavailabilityResponse {
  periods: UnavailabilityPeriod[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toLocal(s: string): Date {
  return new Date(s + "T00:00:00");
}

function dateInRange(day: Date, start: string, end: string | null): boolean {
  const s = toLocal(start);
  const e = end ? toLocal(end) : null;
  if (e) return day >= s && day <= e;
  return day >= s;
}

function statusColor(
  status: string,
  colors: ReturnType<typeof useColors>
): string {
  switch (status) {
    case "active":
      return colors.success;
    case "completed":
      return colors.mutedForeground;
    case "cancelled":
      return colors.error;
    default:
      return colors.primary;
  }
}

function reqStatusColor(
  status: string,
  colors: ReturnType<typeof useColors>
): string {
  switch (status) {
    case "approved":
      return colors.success;
    case "rejected":
      return colors.error;
    case "withdrawn":
      return colors.mutedForeground;
    default:
      return colors.warning;
  }
}

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const start = new Date(firstDay);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const days: Date[] = [];
  const d = new Date(start);
  while (d <= end) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function ScheduleScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const [changeTarget, setChangeTarget] = useState<RotationPeriod | null>(null);
  const [crStart, setCrStart] = useState("");
  const [crEnd, setCrEnd] = useState("");
  const [crReason, setCrReason] = useState("");

  const [showAddUnavail, setShowAddUnavail] = useState(false);
  const [uStart, setUStart] = useState("");
  const [uEnd, setUEnd] = useState("");
  const [uLabel, setULabel] = useState("");

  const scheduleQ = useQuery<ScheduleResponse>({
    queryKey: ["worker-schedule"],
    queryFn: () => apiFetch("/api/worker-portal/schedule"),
  });

  const requestsQ = useQuery<ChangeRequestsResponse>({
    queryKey: ["worker-change-requests"],
    queryFn: () => apiFetch("/api/worker-portal/change-requests"),
  });

  const unavailQ = useQuery<UnavailabilityResponse>({
    queryKey: ["worker-unavailability"],
    queryFn: () => apiFetch("/api/worker-portal/unavailability"),
  });

  const crMut = useMutation({
    mutationFn: () =>
      apiPost("/api/worker-portal/change-requests", {
        rotationPeriodId: changeTarget!.id,
        requestedStart: crStart || null,
        requestedEnd: crEnd || null,
        reason: crReason.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-change-requests"] });
      setChangeTarget(null);
      setCrStart("");
      setCrEnd("");
      setCrReason("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) =>
      Alert.alert("Error", e.message),
  });

  const withdrawMut = useMutation({
    mutationFn: (id: number) =>
      apiDelete(`/api/worker-portal/change-requests/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-change-requests"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const addUnavailMut = useMutation({
    mutationFn: () =>
      apiPost("/api/worker-portal/unavailability", {
        startDate: uStart,
        endDate: uEnd,
        label: uLabel.trim() || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-unavailability"] });
      setShowAddUnavail(false);
      setUStart("");
      setUEnd("");
      setULabel("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteUnavailMut = useMutation({
    mutationFn: (id: number) =>
      apiDelete(`/api/worker-portal/unavailability/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-unavailability"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const rotations = scheduleQ.data?.rotations ?? [];
  const requests = requestsQ.data?.requests ?? [];
  const unavailPeriods = unavailQ.data?.periods ?? [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingRotations = rotations
    .filter((r) => {
      if (r.status === "cancelled") return false;
      const end = r.plannedEnd ? toLocal(r.plannedEnd) : null;
      return end === null || end >= today;
    })
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));

  const calDays = useMemo(
    () => getCalendarDays(calYear, calMonth),
    [calYear, calMonth]
  );

  function prevMonth() {
    if (calMonth === 0) {
      setCalYear((y) => y - 1);
      setCalMonth(11);
    } else {
      setCalMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (calMonth === 11) {
      setCalYear((y) => y + 1);
      setCalMonth(0);
    } else {
      setCalMonth((m) => m + 1);
    }
  }

  function getDayInfo(day: Date) {
    const inCurMonth = day.getMonth() === calMonth;
    const isToday =
      day.getFullYear() === today.getFullYear() &&
      day.getMonth() === today.getMonth() &&
      day.getDate() === today.getDate();
    const rotation = rotations.find(
      (r) =>
        r.status !== "cancelled" &&
        dateInRange(day, r.plannedStart, r.plannedEnd)
    );
    const unavail = unavailPeriods.find((u) =>
      dateInRange(day, u.startDate, u.endDate)
    );
    return { inCurMonth, isToday, rotation, unavail };
  }

  function handleCrOpen(r: RotationPeriod) {
    setChangeTarget(r);
    setCrStart(r.plannedStart);
    setCrEnd(r.plannedEnd ?? "");
    setCrReason("");
  }

  function confirmWithdraw(id: number) {
    Alert.alert("Withdraw Request", "Remove this change request?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Withdraw",
        style: "destructive",
        onPress: () => withdrawMut.mutate(id),
      },
    ]);
  }

  function confirmDeleteUnavail(id: number) {
    Alert.alert(
      "Remove Period",
      "Remove this unavailability period?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteUnavailMut.mutate(id),
        },
      ]
    );
  }

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <>
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
            refreshing={!!scheduleQ.isFetching}
            onRefresh={() => {
              qc.invalidateQueries({ queryKey: ["worker-schedule"] });
              qc.invalidateQueries({ queryKey: ["worker-change-requests"] });
              qc.invalidateQueries({ queryKey: ["worker-unavailability"] });
            }}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={[styles.pageTitle, { color: colors.foreground }]}>
          Schedule
        </Text>

        {scheduleQ.isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Calendar */}
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.calNav}>
                <TouchableOpacity onPress={prevMonth} style={styles.calNavBtn}>
                  <Feather
                    name="chevron-left"
                    size={20}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
                <Text
                  style={[styles.calMonthTitle, { color: colors.foreground }]}
                >
                  {MONTHS[calMonth]} {calYear}
                </Text>
                <TouchableOpacity onPress={nextMonth} style={styles.calNavBtn}>
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={colors.foreground}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.weekDays}>
                {WEEK_DAYS.map((d) => (
                  <Text
                    key={d}
                    style={[
                      styles.weekDay,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {d}
                  </Text>
                ))}
              </View>

              <View style={styles.calGrid}>
                {calDays.map((day, i) => {
                  const { inCurMonth, isToday, rotation, unavail } =
                    getDayInfo(day);
                  let bg = "transparent";
                  if (inCurMonth && unavail && rotation)
                    bg = "#fed7aa";
                  else if (inCurMonth && unavail) bg = "#fee2e2";
                  else if (
                    inCurMonth &&
                    rotation?.status === "active"
                  )
                    bg = "#d1fae5";
                  else if (inCurMonth && rotation) bg = "#dbeafe";

                  return (
                    <View
                      key={i}
                      style={[
                        styles.calDay,
                        { backgroundColor: inCurMonth ? bg : "transparent" },
                      ]}
                    >
                      <View
                        style={[
                          styles.calDayCircle,
                          isToday && inCurMonth
                            ? { backgroundColor: colors.primary }
                            : {},
                        ]}
                      >
                        <Text
                          style={[
                            styles.calDayText,
                            {
                              color: !inCurMonth
                                ? colors.mutedForeground + "44"
                                : isToday
                                ? "#fff"
                                : unavail
                                ? "#dc2626"
                                : rotation?.status === "active"
                                ? "#059669"
                                : rotation
                                ? "#2563eb"
                                : colors.foreground,
                            },
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              <View
                style={[
                  styles.calLegend,
                  { borderTopColor: colors.border },
                ]}
              >
                {[
                  { color: "#d1fae5", border: "#a7f3d0", label: "Active" },
                  { color: "#dbeafe", border: "#bfdbfe", label: "Planned" },
                  { color: "#fee2e2", border: "#fecaca", label: "Unavailable" },
                ].map((l) => (
                  <View key={l.label} style={styles.legendItem}>
                    <View
                      style={[
                        styles.legendDot,
                        {
                          backgroundColor: l.color,
                          borderColor: l.border,
                        },
                      ]}
                    />
                    <Text
                      style={[
                        styles.legendLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {l.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Rotations list */}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Upcoming Rotations
            </Text>

            {upcomingRotations.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather
                  name="calendar"
                  size={24}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  No upcoming rotations
                </Text>
              </View>
            ) : (
              upcomingRotations.map((r) => (
                <View
                  key={r.id}
                  style={[
                    styles.rotCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.rotHeader}>
                    <View
                      style={[
                        styles.rotDot,
                        { backgroundColor: statusColor(r.status, colors) },
                      ]}
                    />
                    <Text
                      style={[
                        styles.rotSite,
                        { color: colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {r.siteName}
                    </Text>
                    <View
                      style={[
                        styles.rotStatusBadge,
                        {
                          backgroundColor:
                            statusColor(r.status, colors) + "18",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.rotStatusText,
                          { color: statusColor(r.status, colors) },
                        ]}
                      >
                        {r.status}
                      </Text>
                    </View>
                  </View>
                  {r.siteLocation ? (
                    <Text
                      style={[
                        styles.rotLocation,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      📍 {r.siteLocation}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.rotDates,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {fmtDate(r.plannedStart)}
                    {r.plannedEnd ? ` → ${fmtDate(r.plannedEnd)}` : " onwards"}
                  </Text>
                  {r.status !== "completed" && r.status !== "cancelled" && (
                    <TouchableOpacity
                      onPress={() => handleCrOpen(r)}
                      style={[
                        styles.crBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.background,
                        },
                      ]}
                    >
                      <Feather
                        name="send"
                        size={13}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.crBtnText,
                          { color: colors.primary },
                        ]}
                      >
                        Request change
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {/* Pending change requests */}
            {requests.filter((r) => r.status === "pending").length > 0 && (
              <>
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  Pending Requests
                </Text>
                {requests
                  .filter((r) => r.status === "pending")
                  .map((req) => (
                    <View
                      key={req.id}
                      style={[
                        styles.crCard,
                        {
                          backgroundColor: colors.warningLight,
                          borderColor: colors.warningBorder,
                        },
                      ]}
                    >
                      <View style={styles.crCardRow}>
                        <Text
                          style={[
                            styles.crCardSite,
                            { color: colors.foreground },
                          ]}
                        >
                          {req.siteName}
                        </Text>
                        <View
                          style={[
                            styles.rotStatusBadge,
                            { backgroundColor: colors.warning + "22" },
                          ]}
                        >
                          <Text
                            style={[
                              styles.rotStatusText,
                              { color: colors.warning },
                            ]}
                          >
                            Pending
                          </Text>
                        </View>
                      </View>
                      {req.reason && (
                        <Text
                          style={[
                            styles.crReason,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          "{req.reason}"
                        </Text>
                      )}
                      <TouchableOpacity
                        onPress={() => confirmWithdraw(req.id)}
                        style={[
                          styles.crBtn,
                          {
                            borderColor: colors.warningBorder,
                            backgroundColor: "transparent",
                          },
                        ]}
                      >
                        <Feather
                          name="x"
                          size={13}
                          color={colors.warning}
                        />
                        <Text
                          style={[
                            styles.crBtnText,
                            { color: colors.warning },
                          ]}
                        >
                          Withdraw
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
              </>
            )}

            {/* Unavailability */}
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginBottom: 0 }]}>
                Unavailability
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setUStart(todayStr);
                  setUEnd(todayStr);
                  setULabel("");
                  setShowAddUnavail(true);
                }}
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={14} color="#fff" />
              </TouchableOpacity>
            </View>

            {unavailPeriods.length === 0 ? (
              <View
                style={[
                  styles.emptyCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.emptyText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  No unavailability periods set
                </Text>
              </View>
            ) : (
              unavailPeriods.map((p) => (
                <View
                  key={p.id}
                  style={[
                    styles.unavailCard,
                    {
                      backgroundColor: colors.errorLight,
                      borderColor: colors.errorBorder,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.unavailLabel,
                        { color: colors.foreground },
                      ]}
                    >
                      {p.label ?? "Unavailable"}
                    </Text>
                    <Text
                      style={[
                        styles.unavailDates,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {fmtDate(p.startDate)} → {fmtDate(p.endDate)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDeleteUnavail(p.id)}
                    style={styles.trashBtn}
                  >
                    <Feather
                      name="trash-2"
                      size={16}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Change Request Modal */}
      <Modal
        visible={!!changeTarget}
        transparent
        animationType="slide"
        onRequestClose={() => setChangeTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Request Schedule Change
              </Text>
              <TouchableOpacity onPress={() => setChangeTarget(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {changeTarget && (
              <View
                style={[
                  styles.modalInfo,
                  {
                    backgroundColor: colors.muted,
                    borderRadius: 8,
                    padding: 10,
                    marginBottom: 12,
                  },
                ]}
              >
                <Text
                  style={[styles.modalInfoSite, { color: colors.foreground }]}
                >
                  {changeTarget.siteName}
                </Text>
                <Text
                  style={[
                    styles.modalInfoDates,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {fmtDate(changeTarget.plannedStart)}
                  {changeTarget.plannedEnd
                    ? ` → ${fmtDate(changeTarget.plannedEnd)}`
                    : ""}
                </Text>
              </View>
            )}

            <View style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.modalLabel,
                    { color: colors.foreground },
                  ]}
                >
                  Requested start
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                    },
                  ]}
                  value={crStart}
                  onChangeText={setCrStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.modalLabel,
                    { color: colors.foreground },
                  ]}
                >
                  Requested end
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                    },
                  ]}
                  value={crEnd}
                  onChangeText={setCrEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>

            <Text
              style={[styles.modalLabel, { color: colors.foreground }]}
            >
              Reason *
            </Text>
            <TextInput
              style={[
                styles.modalTextarea,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.foreground,
                },
              ]}
              value={crReason}
              onChangeText={setCrReason}
              placeholder="e.g. personal commitment, medical appointment…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setChangeTarget(null)}
                style={[
                  styles.modalCancelBtn,
                  { borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.modalCancelText,
                    { color: colors.foreground },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => crMut.mutate()}
                disabled={crMut.isPending || !crReason.trim()}
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.primary },
                  (!crReason.trim() || crMut.isPending) && { opacity: 0.6 },
                ]}
              >
                {crMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Unavailability Modal */}
      <Modal
        visible={showAddUnavail}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddUnavail(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Mark Unavailable
              </Text>
              <TouchableOpacity onPress={() => setShowAddUnavail(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.modalLabel, { color: colors.foreground }]}
                >
                  From
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                    },
                  ]}
                  value={uStart}
                  onChangeText={setUStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.modalLabel, { color: colors.foreground }]}
                >
                  To
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                    },
                  ]}
                  value={uEnd}
                  onChangeText={setUEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            </View>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              Label (optional)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                  color: colors.foreground,
                },
              ]}
              value={uLabel}
              onChangeText={setULabel}
              placeholder="e.g. Holiday, Personal…"
              placeholderTextColor={colors.mutedForeground}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setShowAddUnavail(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text
                  style={[
                    styles.modalCancelText,
                    { color: colors.foreground },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => addUnavailMut.mutate()}
                disabled={
                  addUnavailMut.isPending ||
                  !uStart ||
                  !uEnd ||
                  uEnd < uStart
                }
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.error },
                  (addUnavailMut.isPending ||
                    !uStart ||
                    !uEnd ||
                    uEnd < uStart) && { opacity: 0.6 },
                ]}
              >
                {addUnavailMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 12 },
  pageTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  loader: { paddingTop: 40, alignItems: "center" },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  calNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
  },
  calNavBtn: { padding: 6 },
  calMonthTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  weekDays: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingVertical: 6,
  },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  calGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calDay: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  calDayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  calDayText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  calLegend: {
    flexDirection: "row",
    gap: 12,
    padding: 10,
    borderTopWidth: 1,
    flexWrap: "wrap",
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  legendLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
    marginBottom: 4,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 4,
  },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rotCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  rotHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  rotDot: { width: 8, height: 8, borderRadius: 4 },
  rotSite: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  rotStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  rotStatusText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  rotLocation: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rotDates: { fontSize: 12, fontFamily: "Inter_400Regular" },
  crBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  crBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  crCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  crCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  crCardSite: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  crReason: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  unavailCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  unavailLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  unavailDates: { fontSize: 12, fontFamily: "Inter_400Regular" },
  trashBtn: { padding: 6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 40,
    gap: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalInfo: {},
  modalInfoSite: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalInfoDates: { fontSize: 12, fontFamily: "Inter_400Regular" },
  modalRow: { flexDirection: "row", gap: 10 },
  modalLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 4 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  modalTextarea: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    minHeight: 80,
  },
  modalFooter: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  modalSubmitBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalSubmitText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
