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
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { apiFetch, apiDelete, apiUpload } from "@/lib/api";

interface CertType {
  id: number;
  name: string;
  category: string | null;
  validityMonths: number | null;
}

interface WorkerCert {
  id: number;
  certificationId: number;
  dateAchieved: string | null;
  expiryDate: string | null;
  verified: boolean;
  rejected: boolean;
  rejectionComment: string | null;
  fileUrl: string | null;
  notes: string | null;
  certification: CertType;
}

interface ComplianceItem {
  certId: number;
  certName: string;
  status: string;
  expiryDate: string | null;
  daysUntilExpiry: number | null;
}

interface SiteCompliance {
  siteId: number;
  siteName: string;
  overallStatus: string;
  validCount: number;
  requiredCount: number;
  missingCount: number;
  items: ComplianceItem[];
}

interface ComplianceResponse {
  sites: SiteCompliance[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type CertStatus = "valid" | "expiring" | "expired" | "pending" | "action";

function getCertStatus(c: WorkerCert): CertStatus {
  if (c.rejected || !c.fileUrl || !c.dateAchieved) return "action";
  if (c.expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30 = new Date(today);
    in30.setDate(in30.getDate() + 30);
    const exp = new Date(c.expiryDate + "T00:00:00");
    if (exp < today) return "expired";
    if (exp <= in30) return "expiring";
  }
  if (!c.verified) return "pending";
  return "valid";
}

function CertStatusBadge({ status, colors }: { status: CertStatus; colors: ReturnType<typeof useColors> }) {
  const config = {
    valid: { label: "Valid", bg: colors.successLight, border: colors.successBorder, text: colors.success, icon: "check-circle" },
    expiring: { label: "Expiring soon", bg: colors.warningLight, border: colors.warningBorder, text: colors.warning, icon: "clock" },
    expired: { label: "Expired", bg: colors.errorLight, border: colors.errorBorder, text: colors.error, icon: "x-circle" },
    pending: { label: "Pending review", bg: "#fff7ed", border: "#fed7aa", text: "#f97316", icon: "help-circle" },
    action: { label: "Action needed", bg: colors.errorLight, border: colors.errorBorder, text: colors.error, icon: "alert-triangle" },
  }[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Feather name={config.icon as any} size={10} color={config.text} />
      <Text style={[styles.badgeText, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const STATUS_ORDER: Record<CertStatus, number> = {
  action: 0, expired: 1, expiring: 2, pending: 3, valid: 4,
};

export default function CertificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [addCertId, setAddCertId] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addExpiry, setAddExpiry] = useState("");
  const [addNotes, setAddNotes] = useState("");
  const [addFile, setAddFile] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [showCertPicker, setShowCertPicker] = useState(false);

  const [selectedCert, setSelectedCert] = useState<WorkerCert | null>(null);

  const certsQ = useQuery<WorkerCert[]>({
    queryKey: ["worker-certs"],
    queryFn: () => apiFetch("/api/worker-portal/certifications"),
  });

  const typesQ = useQuery<CertType[]>({
    queryKey: ["cert-types"],
    queryFn: () => apiFetch("/api/worker-portal/cert-types"),
    staleTime: 5 * 60_000,
  });

  const complianceQ = useQuery<ComplianceResponse>({
    queryKey: ["worker-compliance"],
    queryFn: () => apiFetch("/api/worker-portal/compliance"),
  });

  const addMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("certificationId", addCertId);
      if (addDate) fd.append("dateAchieved", addDate);
      if (addExpiry) fd.append("expiryDate", addExpiry);
      if (addNotes.trim()) fd.append("notes", addNotes.trim());
      if (addFile) {
        fd.append("file", {
          uri: addFile.uri,
          name: addFile.name,
          type: addFile.type,
        } as any);
      }
      return apiUpload("/api/worker-portal/certifications", fd);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-certs"] });
      qc.invalidateQueries({ queryKey: ["worker-compliance"] });
      setShowAdd(false);
      setAddCertId("");
      setAddDate("");
      setAddExpiry("");
      setAddNotes("");
      setAddFile(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/worker-portal/certifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-certs"] });
      qc.invalidateQueries({ queryKey: ["worker-compliance"] });
      setSelectedCert(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const name = uri.split("/").pop() ?? "cert.jpg";
      const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
      const type =
        ext === "pdf"
          ? "application/pdf"
          : ext === "png"
          ? "image/png"
          : "image/jpeg";
      setAddFile({ uri, name, type });
    }
  }

  function confirmDelete(cert: WorkerCert) {
    Alert.alert(
      "Remove Certification",
      `Remove "${cert.certification.name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => deleteMut.mutate(cert.id),
        },
      ]
    );
  }

  const certs = useMemo(() => {
    const list = certsQ.data ?? [];
    return [...list].sort(
      (a, b) =>
        STATUS_ORDER[getCertStatus(a)] - STATUS_ORDER[getCertStatus(b)]
    );
  }, [certsQ.data]);

  const certTypes = typesQ.data ?? [];
  const complianceSites = complianceQ.data?.sites ?? [];

  const selectedCertType = certTypes.find((t) => String(t.id) === addCertId);

  const sitesWithIssues = complianceSites.filter(
    (s) => s.overallStatus === "NOT_COMPLIANT" || s.overallStatus === "EXPIRING_SOON"
  );
  const allReady =
    complianceSites.length > 0 &&
    complianceSites.every(
      (s) => s.overallStatus === "READY" || s.overallStatus === "NO_REQUIREMENTS"
    );

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

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
            refreshing={!!(certsQ.isFetching || complianceQ.isFetching)}
            onRefresh={() => {
              qc.invalidateQueries({ queryKey: ["worker-certs"] });
              qc.invalidateQueries({ queryKey: ["worker-compliance"] });
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.titleRow}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            Certifications
          </Text>
          <TouchableOpacity
            onPress={() => setShowAdd(true)}
            style={[styles.addBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="plus" size={16} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Compliance banner */}
        {!complianceQ.isLoading && complianceSites.length > 0 && (
          <View
            style={[
              styles.complianceBanner,
              {
                backgroundColor: allReady ? colors.successLight : sitesWithIssues.length > 0 ? colors.errorLight : "#fff7ed",
                borderColor: allReady ? colors.successBorder : sitesWithIssues.length > 0 ? colors.errorBorder : "#fed7aa",
              },
            ]}
          >
            <Feather
              name={allReady ? "check-circle" : "alert-triangle"}
              size={16}
              color={allReady ? colors.success : sitesWithIssues.length > 0 ? colors.error : "#f97316"}
            />
            <Text
              style={[
                styles.complianceText,
                { color: allReady ? colors.success : sitesWithIssues.length > 0 ? colors.error : "#f97316" },
              ]}
            >
              {allReady
                ? "All certifications up to date"
                : `${sitesWithIssues.length} site${sitesWithIssues.length !== 1 ? "s" : ""} need attention`}
            </Text>
          </View>
        )}

        {certsQ.isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : certs.length === 0 ? (
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="award" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No certifications
            </Text>
            <Text style={[styles.emptyMsg, { color: colors.mutedForeground }]}>
              Tap + to add your first certification
            </Text>
          </View>
        ) : (
          certs.map((cert) => {
            const status = getCertStatus(cert);
            return (
              <TouchableOpacity
                key={cert.id}
                onPress={() => setSelectedCert(cert)}
                style={[
                  styles.certCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                activeOpacity={0.7}
              >
                <View style={styles.certRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.certName, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {cert.certification.name}
                    </Text>
                    {cert.certification.category && (
                      <Text
                        style={[
                          styles.certCat,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {cert.certification.category}
                      </Text>
                    )}
                  </View>
                  <CertStatusBadge status={status} colors={colors} />
                </View>
                <View style={styles.certMeta}>
                  {cert.dateAchieved && (
                    <Text
                      style={[styles.certMetaText, { color: colors.mutedForeground }]}
                    >
                      Achieved: {fmtDate(cert.dateAchieved)}
                    </Text>
                  )}
                  {cert.expiryDate && (
                    <Text
                      style={[
                        styles.certMetaText,
                        {
                          color:
                            status === "expired" || status === "expiring"
                              ? colors.warning
                              : colors.mutedForeground,
                        },
                      ]}
                    >
                      Expires: {fmtDate(cert.expiryDate)}
                    </Text>
                  )}
                </View>
                {cert.rejected && cert.rejectionComment && (
                  <Text
                    style={[styles.rejectedNote, { color: colors.error }]}
                    numberOfLines={2}
                  >
                    Rejected: {cert.rejectionComment}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Cert detail modal */}
      <Modal
        visible={!!selectedCert}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedCert(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalBox,
              { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 24 },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Certification Details
              </Text>
              <TouchableOpacity onPress={() => setSelectedCert(null)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {selectedCert && (
              <>
                <Text style={[styles.detailName, { color: colors.foreground }]}>
                  {selectedCert.certification.name}
                </Text>
                {selectedCert.certification.category && (
                  <Text style={[styles.detailCat, { color: colors.mutedForeground }]}>
                    {selectedCert.certification.category}
                  </Text>
                )}
                <CertStatusBadge status={getCertStatus(selectedCert)} colors={colors} />

                <View style={[styles.detailSection, { borderTopColor: colors.border }]}>
                  {[
                    ["Date achieved", fmtDate(selectedCert.dateAchieved)],
                    ["Expiry date", fmtDate(selectedCert.expiryDate)],
                    ["Certificate file", selectedCert.fileUrl ? "Uploaded" : "Not uploaded"],
                    ["Verified", selectedCert.verified ? "Yes" : "No"],
                  ].map(([label, val]) => (
                    <View key={label} style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                        {label}
                      </Text>
                      <Text style={[styles.detailVal, { color: colors.foreground }]}>
                        {val}
                      </Text>
                    </View>
                  ))}
                </View>

                {selectedCert.notes && (
                  <Text style={[styles.detailNotes, { color: colors.mutedForeground }]}>
                    {selectedCert.notes}
                  </Text>
                )}

                {selectedCert.rejected && selectedCert.rejectionComment && (
                  <View style={[styles.rejectedBox, { backgroundColor: colors.errorLight, borderColor: colors.errorBorder }]}>
                    <Feather name="alert-circle" size={14} color={colors.error} />
                    <Text style={[styles.rejectedText, { color: colors.error }]}>
                      {selectedCert.rejectionComment}
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => confirmDelete(selectedCert)}
                  style={[styles.deleteBtn, { borderColor: colors.errorBorder }]}
                >
                  <Feather name="trash-2" size={14} color={colors.error} />
                  <Text style={[styles.deleteBtnText, { color: colors.error }]}>
                    Remove certification
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Add cert modal */}
      <Modal
        visible={showAdd}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAdd(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.modalScrollBox, { backgroundColor: colors.card, borderColor: colors.border }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Add Certification
              </Text>
              <TouchableOpacity onPress={() => setShowAdd(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              Certification type *
            </Text>
            <TouchableOpacity
              onPress={() => setShowCertPicker(true)}
              style={[
                styles.pickerBtn,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}
            >
              <Text
                style={[
                  styles.pickerBtnText,
                  {
                    color: selectedCertType ? colors.foreground : colors.mutedForeground,
                  },
                ]}
              >
                {selectedCertType?.name ?? "Select certification type…"}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              Date achieved
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
              ]}
              value={addDate}
              onChangeText={setAddDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              Expiry date
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
              ]}
              value={addExpiry}
              onChangeText={setAddExpiry}
              placeholder="YYYY-MM-DD (leave blank if none)"
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              Notes
            </Text>
            <TextInput
              style={[
                styles.modalTextarea,
                { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
              ]}
              value={addNotes}
              onChangeText={setAddNotes}
              placeholder="Optional notes…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />

            <Text style={[styles.modalLabel, { color: colors.foreground }]}>
              Certificate file
            </Text>
            <TouchableOpacity
              onPress={pickImage}
              style={[
                styles.filePickerBtn,
                {
                  borderColor: addFile ? colors.primary : colors.border,
                  backgroundColor: addFile ? colors.accent : colors.background,
                },
              ]}
            >
              <Feather
                name={addFile ? "file" : "upload"}
                size={16}
                color={addFile ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.filePickerText,
                  { color: addFile ? colors.primary : colors.mutedForeground },
                ]}
                numberOfLines={1}
              >
                {addFile ? addFile.name : "Upload photo or PDF"}
              </Text>
              {addFile && (
                <TouchableOpacity onPress={() => setAddFile(null)}>
                  <Feather name="x" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            <View style={[styles.modalFooter, { marginTop: 16, marginBottom: insets.bottom + 24 }]}>
              <TouchableOpacity
                onPress={() => setShowAdd(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => addMut.mutate()}
                disabled={addMut.isPending || !addCertId}
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.primary },
                  (!addCertId || addMut.isPending) && { opacity: 0.6 },
                ]}
              >
                {addMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Add</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Cert type picker modal */}
      <Modal
        visible={showCertPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCertPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.pickerModal,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Select Certification
              </Text>
              <TouchableOpacity onPress={() => setShowCertPicker(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {certTypes.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setAddCertId(String(t.id));
                    setShowCertPicker(false);
                  }}
                  style={[
                    styles.certTypeRow,
                    {
                      backgroundColor:
                        String(t.id) === addCertId ? colors.accent : "transparent",
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.certTypeName, { color: colors.foreground }]}>
                      {t.name}
                    </Text>
                    {t.category && (
                      <Text style={[styles.certTypeCat, { color: colors.mutedForeground }]}>
                        {t.category}
                      </Text>
                    )}
                  </View>
                  {String(t.id) === addCertId && (
                    <Feather name="check" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 10 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  pageTitle: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  complianceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  complianceText: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  loader: { paddingTop: 40, alignItems: "center" },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 32,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyMsg: { fontSize: 13, fontFamily: "Inter_400Regular" },
  certCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  certRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  certName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  certCat: { fontSize: 11, fontFamily: "Inter_400Regular" },
  certMeta: { flexDirection: "row", gap: 12 },
  certMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rejectedNote: { fontSize: 11, fontFamily: "Inter_400Regular" },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
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
    maxHeight: "85%",
  },
  modalScrollBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "90%",
  },
  pickerModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 16,
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold" },
  modalLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
    marginTop: 8,
  },
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
    minHeight: 60,
  },
  pickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 40,
  },
  pickerBtnText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  filePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    borderStyle: "dashed",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filePickerText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  modalFooter: { flexDirection: "row", gap: 10 },
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
  modalSubmitText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  detailName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  detailCat: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailSection: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  detailVal: { fontSize: 13, fontFamily: "Inter_500Medium" },
  detailNotes: { fontSize: 13, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  rejectedBox: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  rejectedText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  deleteBtnText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  certTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  certTypeName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  certTypeCat: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
