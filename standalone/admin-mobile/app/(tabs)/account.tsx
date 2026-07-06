import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AccountScreen() {
  const { admin, logout } = useAuth();
  const colors = useColors();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.container}
    >
      <View
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Feather name="user" size={28} color="#fff" />
        </View>
        <Text style={[styles.name, { color: colors.foreground }]}>
          {admin?.displayName ?? admin?.username}
        </Text>
        {admin?.title ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {admin.title}
          </Text>
        ) : null}
        {admin?.email ? (
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {admin.email}
          </Text>
        ) : null}
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={[styles.badgeText, { color: colors.accentForeground }]}>
            {admin?.accessLevel}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.logoutBtn, { backgroundColor: colors.errorLight, borderColor: colors.errorBorder }]}
        onPress={() => logout()}
        activeOpacity={0.8}
      >
        <Feather name="log-out" size={16} color={colors.error} />
        <Text style={[styles.logoutText, { color: colors.error }]}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  name: { fontSize: 18, fontWeight: "700" },
  subtitle: { fontSize: 13 },
  badge: { marginTop: 12, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    height: 48,
  },
  logoutText: { fontSize: 15, fontWeight: "600" },
});
