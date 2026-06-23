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
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, apiPatch, apiPost, apiUpload } from "@/lib/api";

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

interface PassportExtracted {
  passportNo?: string;
  passportIssueDate?: string;
  passportExpiryDate?: string;
  passportPlaceOfBirth?: string;
  name?: string;
}

interface CvExtracted {
  qualifications?: string;
  notes?: string;
  roles?: { project?: string; role?: string; dateFrom?: string; dateTo?: string }[];
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SectionCard({
  title,
  icon,
  children,
  onEdit,
  rightElement,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
  onEdit?: () => void;
  rightElement?: React.ReactNode;
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
        <Feather name={icon as any} size={15} color={colors.mutedForeground} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
          {title}
        </Text>
        {rightElement}
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

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { worker, logout } = useAuth();

  const [editPersonal, setEditPersonal] = useState(false);
  const [editPassport, setEditPassport] = useState(false);
  const [editNok, setEditNok] = useState(false);
  const [editPassword, setEditPassword] = useState(false);
  const [pFormError, setPFormError] = useState<string | null>(null);

  const [pForm, setPForm] = useState({ name: "", email: "", phone: "", company: "" });
  const [passForm, setPassForm] = useState({
    passportNo: "",
    passportIssueDate: "",
    passportExpiryDate: "",
  });
  const [nokForm, setNokForm] = useState({
    nokName: "",
    nokRelationship: "",
    nokPhone: "",
  });
  const [pwForm, setPwForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [passportScanning, setPassportScanning] = useState(false);
  const [passportExtracted, setPassportExtracted] = useState<PassportExtracted | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvExtracted, setCvExtracted] = useState<CvExtracted | null>(null);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

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
      setPFormError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert("Error", e.message),
  });

  function handleSavePersonal() {
    if (!pForm.name.trim()) {
      setPFormError("Full name is required");
      return;
    }
    if (!pForm.company.trim()) {
      setPFormError("Company is required");
      return;
    }
    setPFormError(null);
    savePMut.mutate();
  }

  const savePassMut = useMutation({
    mutationFn: () => apiPatch("/api/worker-portal/profile", passForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
      setEditPassport(false);
      setPassportExtracted(null);
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
      { text: "Sign Out", style: "destructive", onPress: () => logout() },
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

  async function uploadPassportFile(
    uri: string,
    name: string,
    type: string
  ) {
    setPassportScanning(true);
    setPassportExtracted(null);
    try {
      const fd = new FormData();
      fd.append("file", { uri, name, type } as any);
      const res = await apiUpload<{
        passportWasabiKey: string;
        filename: string;
        extracted: PassportExtracted;
      }>("/api/worker-portal/passport-upload", fd);

      const ex = res.extracted ?? {};
      setPassportExtracted(ex);
      setPassForm((f) => ({
        passportNo: ex.passportNo ?? f.passportNo,
        passportIssueDate: ex.passportIssueDate ?? f.passportIssueDate,
        passportExpiryDate: ex.passportExpiryDate ?? f.passportExpiryDate,
      }));
      qc.invalidateQueries({ queryKey: ["worker-profile"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown error");
    } finally {
      setPassportScanning(false);
    }
  }

  async function handlePassportCamera() {
    setShowSourcePicker(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera access is needed to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const ext = uri.split(".").pop()?.toLowerCase() ?? "jpg";
      const name = `passport.${ext}`;
      const type = ext === "png" ? "image/png" : "image/jpeg";
      await uploadPassportFile(uri, name, type);
    }
  }

  async function handlePassportLibrary() {
    setShowSourcePicker(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Photo library access is needed.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const uri = asset.uri;
      const filename = uri.split("/").pop() ?? "passport.jpg";
      const ext = filename.split(".").pop()?.toLowerCase() ?? "jpg";
      const type = ext === "png" ? "image/png" : "image/jpeg";
      await uploadPassportFile(uri, filename, type);
    }
  }

  async function handlePassportFile() {
    setShowSourcePicker(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/*", "application/pdf"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await uploadPassportFile(
        asset.uri,
        asset.name,
        asset.mimeType ?? "application/octet-stream"
      );
    }
  }

  async function handleCvUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "text/plain",
        "text/rtf",
      ],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setCvUploading(true);
      setCvExtracted(null);
      try {
        const fd = new FormData();
        fd.append("file", {
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType ?? "application/octet-stream",
        } as any);
        const res = await apiUpload<{
          cvWasabiKey: string;
          filename: string;
          extracted: CvExtracted;
        }>("/api/worker-portal/profile/cv", fd);

        setCvExtracted(res.extracted ?? {});
        qc.invalidateQueries({ queryKey: ["worker-profile"] });
        qc.invalidateQueries({ queryKey: ["worker-portal-role-history"] });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        Alert.alert("Upload failed", e instanceof Error ? e.message : "Unknown error");
      } finally {
        setCvUploading(false);
      }
    }
  }

  function openPassportUpload() {
    if (Platform.OS === "web") {
      handlePassportFile();
    } else {
      setShowSourcePicker(true);
    }
  }

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);

  return (
    <>
      <ScrollView
        style={[styles.root, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={!!profileQ.isFetching}
            onRefresh={() => qc.invalidateQueries({ queryKey: ["worker-profile"] })}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.avatarSection}>
          <View
            style={[styles.avatarCircle, { backgroundColor: colors.primary + "22" }]}
          >
            <Text style={[styles.avatarInitial, { color: colors.primary }]}>
              {(worker?.name ?? "W")[0].toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.workerName, { color: colors.foreground }]}>
            {worker?.name ?? "Worker"}
          </Text>
          {profile?.roleName ? (
            <Text style={[styles.workerRole, { color: colors.mutedForeground }]}>
              {profile.roleName}
            </Text>
          ) : null}
          {profile?.company ? (
            <Text style={[styles.workerCompany, { color: colors.mutedForeground }]}>
              {profile.company}
            </Text>
          ) : null}
        </View>

        {profileQ.isLoading ? (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <SectionCard title="Personal Info" icon="user" onEdit={() => setEditPersonal(true)}>
              <InfoRow label="Name" value={profile?.name ?? null} />
              <InfoRow label="Email" value={profile?.email ?? null} />
              <InfoRow label="Phone" value={profile?.phone ?? null} />
              <InfoRow label="Company" value={profile?.company ?? null} />
              <InfoRow label="Username" value={profile?.portalUsername ?? null} />
              {profile?.windaId ? (
                <InfoRow label="WINDA ID" value={profile.windaId} />
              ) : null}
            </SectionCard>

            {/* Passport section with upload */}
            <SectionCard
              title="Passport"
              icon="shield"
              rightElement={
                <TouchableOpacity
                  onPress={openPassportUpload}
                  style={[
                    styles.scanBtn,
                    { backgroundColor: colors.primary + "14", borderColor: colors.primary + "40" },
                  ]}
                >
                  <Feather name="camera" size={12} color={colors.primary} />
                  <Text style={[styles.scanBtnText, { color: colors.primary }]}>
                    {profile?.passportWasabiKey ? "Re-scan" : "Scan"}
                  </Text>
                </TouchableOpacity>
              }
              onEdit={() => {
                setPassportExtracted(null);
                setEditPassport(true);
              }}
            >
              {profile?.passportWasabiKey ? (
                <View
                  style={[
                    styles.uploadedBadge,
                    {
                      backgroundColor: colors.successLight,
                      borderColor: colors.successBorder,
                    },
                  ]}
                >
                  <Feather name="check-circle" size={13} color={colors.success} />
                  <Text style={[styles.uploadedText, { color: colors.success }]}>
                    Passport scan on file
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={openPassportUpload}
                  style={[
                    styles.uploadPrompt,
                    {
                      backgroundColor: colors.accent,
                      borderColor: colors.primary + "30",
                    },
                  ]}
                >
                  <Feather name="upload" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.uploadPromptTitle, { color: colors.primary }]}>
                      Upload passport scan
                    </Text>
                    <Text style={[styles.uploadPromptSub, { color: colors.mutedForeground }]}>
                      AI will extract your details automatically
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.primary} />
                </TouchableOpacity>
              )}
              <InfoRow label="Passport No." value={profile?.passportNo ?? null} />
              <InfoRow label="Issue date" value={fmtDate(profile?.passportIssueDate ?? null)} />
              <InfoRow label="Expiry date" value={fmtDate(profile?.passportExpiryDate ?? null)} />
            </SectionCard>

            <SectionCard title="Next of Kin" icon="heart" onEdit={() => setEditNok(true)}>
              <InfoRow label="Name" value={profile?.nokName ?? null} />
              <InfoRow label="Relationship" value={profile?.nokRelationship ?? null} />
              <InfoRow label="Phone" value={profile?.nokPhone ?? null} />
            </SectionCard>

            {/* Documents — CV upload */}
            <SectionCard title="Documents" icon="file-text">
              <View style={styles.docRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docLabel, { color: colors.foreground }]}>CV</Text>
                  <Text style={[styles.docSub, { color: colors.mutedForeground }]}>
                    {profile?.cvWasabiKey
                      ? `Uploaded ${profile.cvUploadedAt ? fmtDate(profile.cvUploadedAt) : ""}`
                      : "Not uploaded"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleCvUpload}
                  disabled={cvUploading}
                  style={[
                    styles.docUploadBtn,
                    {
                      backgroundColor: profile?.cvWasabiKey
                        ? colors.muted
                        : colors.primary,
                    },
                  ]}
                >
                  {cvUploading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Feather
                        name={profile?.cvWasabiKey ? "refresh-cw" : "upload"}
                        size={13}
                        color={profile?.cvWasabiKey ? colors.foreground : "#fff"}
                      />
                      <Text
                        style={[
                          styles.docUploadBtnText,
                          {
                            color: profile?.cvWasabiKey ? colors.foreground : "#fff",
                          },
                        ]}
                      >
                        {profile?.cvWasabiKey ? "Replace" : "Upload"}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {cvUploading && (
                <View
                  style={[
                    styles.extractingBox,
                    { backgroundColor: colors.accent, borderColor: colors.primary + "30" },
                  ]}
                >
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.extractingText, { color: colors.primary }]}>
                    AI is extracting your CV data…
                  </Text>
                </View>
              )}

              {cvExtracted && !cvUploading && (
                <View
                  style={[
                    styles.extractedBox,
                    { backgroundColor: colors.successLight, borderColor: colors.successBorder },
                  ]}
                >
                  <View style={styles.extractedHeader}>
                    <Feather name="check-circle" size={14} color={colors.success} />
                    <Text style={[styles.extractedTitle, { color: colors.success }]}>
                      CV uploaded & analysed
                    </Text>
                  </View>
                  {cvExtracted.roles && cvExtracted.roles.length > 0 && (
                    <Text style={[styles.extractedDetail, { color: colors.success + "cc" }]}>
                      {cvExtracted.roles.length} role{cvExtracted.roles.length !== 1 ? "s" : ""} extracted
                    </Text>
                  )}
                  {cvExtracted.qualifications && (
                    <Text
                      style={[styles.extractedDetail, { color: colors.success + "cc" }]}
                      numberOfLines={2}
                    >
                      {cvExtracted.qualifications}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.docRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.docLabel, { color: colors.foreground }]}>
                    Passport scan
                  </Text>
                  <Text style={[styles.docSub, { color: colors.mutedForeground }]}>
                    {profile?.passportWasabiKey ? "On file" : "Not uploaded"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openPassportUpload}
                  style={[
                    styles.docUploadBtn,
                    {
                      backgroundColor: profile?.passportWasabiKey
                        ? colors.muted
                        : colors.primary,
                    },
                  ]}
                >
                  <Feather
                    name={profile?.passportWasabiKey ? "refresh-cw" : "camera"}
                    size={13}
                    color={profile?.passportWasabiKey ? colors.foreground : "#fff"}
                  />
                  <Text
                    style={[
                      styles.docUploadBtnText,
                      {
                        color: profile?.passportWasabiKey ? colors.foreground : "#fff",
                      },
                    ]}
                  >
                    {profile?.passportWasabiKey ? "Re-scan" : "Scan"}
                  </Text>
                </TouchableOpacity>
              </View>
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
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleLogout}
              style={[
                styles.logoutBtn,
                { backgroundColor: colors.errorLight, borderColor: colors.errorBorder },
              ]}
            >
              <Feather name="log-out" size={16} color={colors.error} />
              <Text style={[styles.logoutText, { color: colors.error }]}>Sign Out</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Source Picker Bottom Sheet */}
      <Modal
        visible={showSourcePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSourcePicker(false)}
      >
        <TouchableOpacity
          style={styles.sheetOverlay}
          activeOpacity={1}
          onPress={() => setShowSourcePicker(false)}
        >
          <View
            style={[
              styles.sheetBox,
              { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 20 },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
              Upload Passport
            </Text>
            <Text style={[styles.sheetSub, { color: colors.mutedForeground }]}>
              AI will scan it and extract your details
            </Text>

            <TouchableOpacity
              onPress={handlePassportCamera}
              style={[styles.sheetOption, { borderColor: colors.border }]}
            >
              <View
                style={[styles.sheetIconBox, { backgroundColor: colors.primary + "14" }]}
              >
                <Feather name="camera" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: colors.foreground }]}>
                  Take Photo
                </Text>
                <Text style={[styles.sheetOptionSub, { color: colors.mutedForeground }]}>
                  Use your camera
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePassportLibrary}
              style={[styles.sheetOption, { borderColor: colors.border }]}
            >
              <View
                style={[styles.sheetIconBox, { backgroundColor: colors.primary + "14" }]}
              >
                <Feather name="image" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: colors.foreground }]}>
                  Choose from Library
                </Text>
                <Text style={[styles.sheetOptionSub, { color: colors.mutedForeground }]}>
                  Pick an existing photo
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePassportFile}
              style={[styles.sheetOption, { borderColor: colors.border }]}
            >
              <View
                style={[styles.sheetIconBox, { backgroundColor: colors.primary + "14" }]}
              >
                <Feather name="file" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sheetOptionTitle, { color: colors.foreground }]}>
                  Upload File
                </Text>
                <Text style={[styles.sheetOptionSub, { color: colors.mutedForeground }]}>
                  PDF or image
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowSourcePicker(false)}
              style={[styles.sheetCancel, { borderColor: colors.border }]}
            >
              <Text style={[styles.sheetCancelText, { color: colors.mutedForeground }]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Passport scanning overlay */}
      <Modal
        visible={passportScanning}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.scanOverlay}>
          <View
            style={[
              styles.scanBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.scanTitle, { color: colors.foreground }]}>
              Scanning passport…
            </Text>
            <Text style={[styles.scanSub, { color: colors.mutedForeground }]}>
              AI is extracting your details
            </Text>
          </View>
        </View>
      </Modal>

      {/* Passport Details Modal */}
      <Modal
        visible={editPassport}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setEditPassport(false);
          setPassportExtracted(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[
              styles.modalScrollBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Passport Details
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditPassport(false);
                  setPassportExtracted(null);
                }}
              >
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Upload options inside passport modal */}
            {!passportExtracted && (
              <>
                <Text style={[styles.modalSectionLabel, { color: colors.mutedForeground }]}>
                  Scan to autofill
                </Text>
                <View style={styles.uploadBtnRow}>
                  <TouchableOpacity
                    onPress={handlePassportCamera}
                    style={[
                      styles.uploadMethodBtn,
                      { borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                  >
                    <Feather name="camera" size={18} color={colors.primary} />
                    <Text style={[styles.uploadMethodText, { color: colors.foreground }]}>
                      Camera
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handlePassportLibrary}
                    style={[
                      styles.uploadMethodBtn,
                      { borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                  >
                    <Feather name="image" size={18} color={colors.primary} />
                    <Text style={[styles.uploadMethodText, { color: colors.foreground }]}>
                      Library
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handlePassportFile}
                    style={[
                      styles.uploadMethodBtn,
                      { borderColor: colors.border, backgroundColor: colors.background },
                    ]}
                  >
                    <Feather name="file" size={18} color={colors.primary} />
                    <Text style={[styles.uploadMethodText, { color: colors.foreground }]}>
                      File
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Extracted success card */}
            {passportExtracted && (
              <View
                style={[
                  styles.extractedBox,
                  { backgroundColor: colors.successLight, borderColor: colors.successBorder },
                ]}
              >
                <View style={styles.extractedHeader}>
                  <Feather name="check-circle" size={15} color={colors.success} />
                  <Text style={[styles.extractedTitle, { color: colors.success }]}>
                    Passport scanned — details pre-filled below
                  </Text>
                </View>
                {passportExtracted.name ? (
                  <Text style={[styles.extractedDetail, { color: colors.success + "cc" }]}>
                    Name: {passportExtracted.name}
                  </Text>
                ) : null}
                {passportExtracted.passportPlaceOfBirth ? (
                  <Text style={[styles.extractedDetail, { color: colors.success + "cc" }]}>
                    Place of birth: {passportExtracted.passportPlaceOfBirth}
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => openPassportUpload()}
                  style={styles.rescanLink}
                >
                  <Feather name="refresh-cw" size={11} color={colors.success} />
                  <Text style={[styles.rescanLinkText, { color: colors.success }]}>
                    Re-scan
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View
              style={[
                styles.divider,
                { borderTopColor: colors.border, marginVertical: 12 },
              ]}
            />

            <Text style={[styles.modalSectionLabel, { color: colors.mutedForeground }]}>
              {passportExtracted ? "Review & edit extracted data" : "Enter manually"}
            </Text>

            {[
              {
                key: "passportNo",
                label: "Passport number",
                placeholder: "e.g. AB1234567",
                caps: "characters" as const,
              },
              {
                key: "passportIssueDate",
                label: "Issue date",
                placeholder: "YYYY-MM-DD",
                caps: "none" as const,
              },
              {
                key: "passportExpiryDate",
                label: "Expiry date",
                placeholder: "YYYY-MM-DD",
                caps: "none" as const,
              },
            ].map(({ key, label, placeholder, caps }) => (
              <View key={key}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                  {label}
                </Text>
                <TextInput
                  style={[
                    styles.modalInput,
                    {
                      borderColor: passportExtracted && (passForm as any)[key]
                        ? colors.successBorder
                        : colors.border,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                    },
                  ]}
                  value={(passForm as any)[key]}
                  onChangeText={(v) => setPassForm((f) => ({ ...f, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize={caps}
                />
              </View>
            ))}

            <View
              style={[
                styles.modalFooter,
                { marginTop: 16, marginBottom: insets.bottom + 24 },
              ]}
            >
              <TouchableOpacity
                onPress={() => {
                  setEditPassport(false);
                  setPassportExtracted(null);
                }}
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

      {/* Personal Info Modal */}
      <Modal
        visible={editPersonal}
        transparent
        animationType="slide"
        onRequestClose={() => { setEditPersonal(false); setPFormError(null); }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={[
              styles.modalScrollBox,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
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
              { key: "name", label: "Full name", placeholder: "Your full legal name", required: true },
              { key: "email", label: "Email", placeholder: "your@email.com", required: false },
              { key: "phone", label: "Phone", placeholder: "+44 ...", required: false },
              { key: "company", label: "Company / Employer", placeholder: "Company name", required: true },
            ].map(({ key, label, placeholder, required }) => {
              const isNameError = key === "name" && pFormError === "Full name is required";
              const isCompanyError = key === "company" && pFormError === "Company is required";
              const hasFieldError = isNameError || isCompanyError;
              return (
                <View key={key}>
                  <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                    {label}
                    {required ? (
                      <Text style={{ color: colors.destructive }}> *</Text>
                    ) : null}
                  </Text>
                  <TextInput
                    style={[
                      styles.modalInput,
                      {
                        borderColor: hasFieldError ? colors.destructive : colors.border,
                        backgroundColor: colors.background,
                        color: colors.foreground,
                      },
                    ]}
                    value={(pForm as any)[key]}
                    onChangeText={(v) => {
                      setPForm((f) => ({ ...f, [key]: v }));
                      if (pFormError) setPFormError(null);
                    }}
                    placeholder={placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize={key === "email" ? "none" : "words"}
                  />
                  {hasFieldError ? (
                    <Text style={{ color: colors.destructive, fontSize: 12, marginTop: 3 }}>
                      {pFormError}
                    </Text>
                  ) : null}
                </View>
              );
            })}
            <View
              style={[
                styles.modalFooter,
                { marginTop: 16, marginBottom: insets.bottom + 24 },
              ]}
            >
              <TouchableOpacity
                onPress={() => { setEditPersonal(false); setPFormError(null); }}
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
              >
                <Text style={[styles.modalCancelText, { color: colors.foreground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSavePersonal}
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
              { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 24 },
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
              {
                key: "nokRelationship",
                label: "Relationship",
                placeholder: "e.g. Spouse, Parent",
              },
              { key: "nokPhone", label: "Phone number", placeholder: "+44 ..." },
            ].map(({ key, label, placeholder }) => (
              <View key={key}>
                <Text style={[styles.modalLabel, { color: colors.foreground }]}>
                  {label}
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
              { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 24 },
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
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                    },
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
  workerName: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
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
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 4,
  },
  scanBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  sectionBody: { padding: 14, gap: 10 },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  infoVal: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 2,
    textAlign: "right",
  },
  uploadedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  uploadedText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  uploadPrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  uploadPromptTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  uploadPromptSub: { fontSize: 11, fontFamily: "Inter_400Regular" },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  docLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  docSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  docUploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  docUploadBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  extractingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  extractingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  extractedBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  extractedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  extractedTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  extractedDetail: { fontSize: 12, fontFamily: "Inter_400Regular" },
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
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheetBox: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    padding: 20,
    paddingBottom: 36,
    gap: 4,
  },
  sheetTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sheetSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 8 },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetOptionTitle: { fontSize: 15, fontFamily: "Inter_500Medium" },
  sheetOptionSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  sheetCancel: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  sheetCancelText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  scanOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanBox: {
    width: 200,
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
  },
  scanTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  scanSub: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
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
  modalSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  uploadBtnRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  uploadMethodBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  uploadMethodText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  divider: { borderTopWidth: 1 },
  rescanLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
    alignSelf: "flex-start",
  },
  rescanLinkText: { fontSize: 11, fontFamily: "Inter_500Medium" },
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
