import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface Worker {
  id: number;
  name: string;
  email: string | null;
  company: string | null;
  roleName: string | null;
  active: boolean;
}

export default function WorkersScreen() {
  const colors = useColors();
  const router = useRouter();
  const [search, setSearch] = useState("");

  const workersQ = useQuery<Worker[]>({
    queryKey: ["workers-list", search],
    queryFn: () =>
      apiFetch(`/api/workforce/workers${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  });

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.searchWrap}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search workers"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {workersQ.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={workersQ.data ?? []}
          keyExtractor={(w) => String(w.id)}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push(`/worker/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
                <Text style={{ color: colors.accentForeground, fontWeight: "700" }}>
                  {item.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.workerName, { color: colors.foreground }]}>
                  {item.name}
                </Text>
                <Text style={[styles.workerMeta, { color: colors.mutedForeground }]}>
                  {[item.roleName, item.company].filter(Boolean).join(" · ") || "No role assigned"}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No workers found.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: { padding: 16, paddingBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14 },
  listContainer: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  workerName: { fontSize: 14, fontWeight: "600" },
  workerMeta: { fontSize: 12 },
  emptyText: { fontSize: 13, textAlign: "center", marginTop: 24 },
});
