import React, { useState, useEffect } from "react";
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
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, apiPatch, apiPost } from "@/lib/api";

interface WorkerProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  passportNo: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  passportWasabiKey: string | null;
  nokName: string | null;
  nokRelationship: string | null;
  nokPhone: string | null;
  portalUsername: string | null;
  windaId: string | null;
  roleName: string | null;
  cvWasabiKey: string | null;
  cvUploadedAt: string | null;
  qualifications: string | null;
}

function SectionCard({
  title,
  icon,
  children,
  onEdit,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  onEdit?: () => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.sectionHeader}>
        <Feather
          name={icon as any}
          size={15}
          color={colors.mutedForeground}
        />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        {onEdit && (
          <TouchableOpacity onPress={onEdit} style={styles.editBtn}>
            <Feather name="edit-2" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null }) {
  const colors = useColors();
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.infoVal,
          { color: value ? colors.foreground : colors.mutedForeground },
        ]}
      >
        {value ?? "—"}
      </Text>
    </View>
  );
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { worker, logout } = useAuth();

  const [editPersonal, setEditPersonal] = useState(false);
  const [editPassport, setEditPassport] = useState(false);
  const [editNok, setEditNok] = useState(false);
  const [editPassword, setEditPassword] = useState(false);

  const [pForm, setPForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [passForm, setPassForm] = useState({ passportNo: "", passportIssueDate: "", passportExpiryDate: "" });
  const [nokForm, setNokForm] = useState({ nokName: "", nokRelationship: "", nokPhone: "" });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const profileQ = useQuery<WorkerProfile>({
    queryKey: ["worker-profile"],
    queryFn: () => apiFetch("/api/worker-portal/profile"),
  });

  const profile = profileQ.data;

  useEffect(() => {
    if (profile) {
      setPForm({
        name: profile.name ?? "",
        email: profile.email ?? "",
        phone: profile.phone ?? "",
        company: profile.company ?? "",
      });
      setPassForm({
        passportNo: profile.passportNo ?? "",
        passportIssueDate: profile.passportIssueDate ?? "",
        passportExpiryDate: profile.passportExpiryDate ?? "",
      });
      setNokForm({
        nokName: profile.nokName ?? "",
        nokRelationship: profile.nokRelationship ?? "",
        nokPhone: profile.nokPhone ?? "",
      });
    }
  }, [profile]);

  const savePMut = useMutation({
    mutationFn: () => apiPatch("/api/worker-portal/profile", pForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
      setEditPersonal(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const savePassMut = useMutation({
    mutationFn: () => apiPatch("/api/worker-portal/profile", passForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
      setEditPassport(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const saveNokMut = useMutation({
    mutationFn: () => apiPatch("/api/worker-portal/profile", nokForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
      setEditNok(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  const pwMut = useMutation({
    mutationFn: () =>
      apiPost("/api/worker-portal/change-password", {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      }),
    onSuccess: () => {
      setPwForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setEditPassword(false);
      Alert.alert("Success", "Password changed successfully");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  function handleLogout() {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: () => logout(),
      },
    ]);
  }

  function submitPassword() {
    if (!pwForm.currentPassword || !pwForm.newPassword) {
      Alert.alert("Error", "Please fill in all password fields");
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }
    if (pwForm.newPassword.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    pwMut.mutate();
  }

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
            refreshing={!!profileQ.isFetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["worker-profile"] })}
            tintColor={colors.primary}
          />
        }
      >
        {/* Avatar header */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarCircle, { backgroundColor: colors.primary + "22" }]}>
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(worker?.name ?? "W")[0].toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.workerName, { color: colors.foreground }]}>
            {worker?.name ?? "Worker"}
          </Text>
          {profile?.roleName && (
            <Text style={[styles.workerRole, { color: colors.mutedForeground }]}>
              {profile.roleName}
            </Text>
          )}
          {profile?.company && (
            <Text style={[styles.workerCompany, { color: colors.mutedForeground }]}>
              {profile.company}
            </Text>
          )}
        </View>

        {profileQ.isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <SectionCard
              title="Personal Info"
              icon="user"
              onEdit={() => setEditPersonal(true)}
            >
              <InfoRow label="Name" value={profile?.name ?? null} />
              <InfoRow label="Email" value={profile?.email ?? null} />
              <InfoRow label="Phone" value={profile?.phone ?? null} />
              <InfoRow label="Company" value={profile?.company ?? null} />
              <InfoRow label="Username" value={profile?.portalUsername ?? null} />
              {profile?.windaId && (
                <InfoRow label="WINDA ID" value={profile.windaId} />
              )}
            </SectionCard>

            <SectionCard
              title="Passport"
              icon="shield"
              onEdit={() => setEditPassport(true)}
            >
              <InfoRow label="Passport No." value={profile?.passportNo ?? null} />
              <InfoRow label="Issue date" value={fmtDate(profile?.passportIssueDate ?? null)} />
              <InfoRow label="Expiry date" value={fmtDate(profile?.passportExpiryDate ?? null)} />
              <InfoRow
                label="Scan uploaded"
                value={profile?.passportWasabiKey ? "Yes" : "No"}
              />
            </SectionCard>

            <SectionCard
              title="Next of Kin"
              icon="heart"
              onEdit={() => setEditNok(true)}
            >
              <InfoRow label="Name" value={profile?.nokName ?? null} />
              <InfoRow label="Relationship" value={profile?.nokRelationship ?? null} />
              <InfoRow label="Phone" value={profile?.nokPhone ?? null} />
            </SectionCard>

            <SectionCard title="Documents" icon="file-text">
              <InfoRow
                label="Passport scan"
                value={profile?.passportWasabiKey ? "Uploaded" : "Not uploaded"}
              />
              <InfoRow
                label="CV"
                value={
                  profile?.cvWasabiKey
                    ? `Uploaded ${profile.cvUploadedAt ? fmtDate(profile.cvUploadedAt) : ""}`
                    : "Not uploaded"
                }
              />
              <Text style={[styles.uploadNote, { color: colors.mutedForeground }]}>
                Use the web portal to upload documents
              </Text>
            </SectionCard>

            <TouchableOpacity
              onPress={() => setEditPassword(true)}
              style={[
                styles.actionRow,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.actionLeft}>
                <Feather name="lock" size={16} color={colors.primary} />
                <Text style={[styles.actionText, { color: colors.foreground }]}>
                  Change Password
                </Text>
              </View>
              <Feather
                name="chevron-right"
                size={16}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              style={[
                styles.logoutBtn,
                { backgroundColor: colors.errorLight, borderColor: colors.errorBorder },
              ]}
            >
              <Feather name="log-out" size={16} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>
                Sign Out
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Personal Info Modal */}
      <Modal
        visible={editPersonal}
        transparent
        animationType="slide"
        onRequestClose={() => setEditPersonal(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.modalScrollBox, { backgroundColor: colors.card, borderColor: colors.border }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Edit Personal Info
              </Text>
              <TouchableOpacity onPress={() => setEditPersonal(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {[
              { key: "name", label: "Full name", placeholder: "Your full name" },
              { key: "email", label: "Email", placeholder: "your@email.com" },
              { key: "phone", label: "Phone", placeholder: "+44 ..." },
              { key: "company", label: "Company", placeholder: "Company name" },
            ].map(({ key, label, placeholder }) => (
              <View key={key}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                  {label}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
                  ]}
                  value={(pForm as any)[key]}
                  onChangeText={(v) => setPForm((f) => ({ ...f, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize={key === "email" ? "none" : "words"}
                />
              </View>
            ))}
            <View style={[styles.modalFooter, { marginTop: 16, marginBottom: insets.bottom + 24 }]}>
              <TouchableOpacity
                onPress={() => setEditPersonal(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => savePMut.mutate()}
                disabled={savePMut.isPending}
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.primary },
                  savePMut.isPending && { opacity: 0.7 },
                ]}
              >
                {savePMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Passport Modal */}
      <Modal
        visible={editPassport}
        transparent
        animationType="slide"
        onRequestClose={() => setEditPassport(false)}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[styles.modalScrollBox, { backgroundColor: colors.card, borderColor: colors.border }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Passport Details
              </Text>
              <TouchableOpacity onPress={() => setEditPassport(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {[
              { key: "passportNo", label: "Passport number", placeholder: "e.g. AB1234567" },
              { key: "passportIssueDate", label: "Issue date", placeholder: "YYYY-MM-DD" },
              { key: "passportExpiryDate", label: "Expiry date", placeholder: "YYYY-MM-DD" },
            ].map(({ key, label, placeholder }) => (
              <View key={key}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                  {label}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
                  ]}
                  value={(passForm as any)[key]}
                  onChangeText={(v) => setPassForm((f) => ({ ...f, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="characters"
                />
              </View>
            ))}
            <Text style={[styles.uploadNote, { color: colors.mutedForeground, marginTop: 8 }]}>
              To upload a passport scan, use the web portal
            </Text>
            <View style={[styles.modalFooter, { marginTop: 16, marginBottom: insets.bottom + 24 }]}>
              <TouchableOpacity
                onPress={() => setEditPassport(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => savePassMut.mutate()}
                disabled={savePassMut.isPending}
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.primary },
                  savePassMut.isPending && { opacity: 0.7 },
                ]}
              >
                {savePassMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* NOK Modal */}
      <Modal
        visible={editNok}
        transparent
        animationType="slide"
        onRequestClose={() => setEditNok(false)}
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
                Next of Kin
              </Text>
              <TouchableOpacity onPress={() => setEditNok(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {[
              { key: "nokName", label: "Full name", placeholder: "Name" },
              { key: "nokRelationship", label: "Relationship", placeholder: "e.g. Spouse, Parent" },
              { key: "nokPhone", label: "Phone number", placeholder: "+44 ..." },
            ].map(({ key, label, placeholder }) => (
              <View key={key}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                  {label}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
                  ]}
                  value={(nokForm as any)[key]}
                  onChangeText={(v) => setNokForm((f) => ({ ...f, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <View style={[styles.modalFooter, { marginTop: 4 }]}>
              <TouchableOpacity
                onPress={() => setEditNok(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => saveNokMut.mutate()}
                disabled={saveNokMut.isPending}
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.primary },
                  saveNokMut.isPending && { opacity: 0.7 },
                ]}
              >
                {saveNokMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        visible={editPassword}
        transparent
        animationType="slide"
        onRequestClose={() => setEditPassword(false)}
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
                Change Password
              </Text>
              <TouchableOpacity onPress={() => setEditPassword(false)}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {[
              { key: "currentPassword", label: "Current password" },
              { key: "newPassword", label: "New password" },
              { key: "confirmPassword", label: "Confirm new password" },
            ].map(({ key, label }) => (
              <View key={key}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                  {label}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    { borderColor: colors.border, backgroundColor: colors.background, color: colors.foreground },
                  ]}
                  value={(pwForm as any)[key]}
                  onChangeText={(v) => setPwForm((f) => ({ ...f, [key]: v }))}
                  secureTextEntry
                  autoCapitalize="none"
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                />
              </View>
            ))}
            <View style={[styles.modalFooter, { marginTop: 4 }]}>
              <TouchableOpacity
                onPress={() => setEditPassword(false)}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submitPassword}
                disabled={pwMut.isPending}
                style={[
                  styles.modalSubmitBtn,
                  { backgroundColor: colors.primary },
                  pwMut.isPending && { opacity: 0.7 },
                ]}
              >
                {pwMut.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalSubmitText}>Update</Text>
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
  avatarSection: { alignItems: "center", paddingBottom: 8 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  avatarInitial: { fontSize: 32, fontFamily: "Inter_700Bold" },
  workerName: { fontSize: 20, fontFamily: "Inter_700Bold", letterSpacing: -0.3 },
  workerRole: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 2 },
  workerCompany: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  loader: { paddingTop: 40, alignItems: "center" },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  sectionTitle: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  editBtn: { padding: 4 },
  sectionBody: { padding: 14, gap: 10 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  infoVal: { fontSize: 13, fontFamily: "Inter_500Medium", flex: 2, textAlign: "right" },
  uploadNote: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  actionLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logoutText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
  modalScrollBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: "90%",
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
    height: 42,
    fontSize: 14,
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
});
