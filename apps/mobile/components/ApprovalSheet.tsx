/**
 * Tool approvals as a bottom sheet over whichever screen is open — the ask
 * rides along with the user instead of stealing a screen. Dismissing only
 * hides it (the request stays pending; the tab-list button reopens it);
 * Reject is the only way to deny, so an accidental dismiss never kills a
 * tool call.
 */
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useToolApproval } from "@kotys/core";
import type { ApprovalRequest } from "@kotys/contracts";
import { theme, useThemeMode } from "../lib/theme";
import { Sheet } from "./kit/Sheet";

const useApprovalSheet = create<{
  open: boolean;
  dismissedFor: number | null;
  setOpen: (open: boolean) => void;
  dismiss: (requestId: number) => void;
}>((set) => ({
  open: false,
  dismissedFor: null,
  setOpen: (open) => set({ open }),
  dismiss: (requestId) => set({ open: false, dismissedFor: requestId }),
}));

export function ApprovalSheet() {
  const { pending, accept, reject } = useToolApproval();
  const open = useApprovalSheet((s) => s.open);
  const dismissedFor = useApprovalSheet((s) => s.dismissedFor);
  const setOpen = useApprovalSheet((s) => s.setOpen);
  const dismiss = useApprovalSheet((s) => s.dismiss);

  // Dismissal is per-request, not a global mute.
  useEffect(() => {
    if (pending && dismissedFor !== pending.id) setOpen(true);
  }, [pending, dismissedFor, setOpen]);

  const close = useCallback(
    () => dismiss(pending?.id ?? -1),
    [pending, dismiss],
  );

  const act = useCallback(
    (kind: "accept" | "reject") => {
      if (kind === "accept") accept();
      else reject();
    },
    [accept, reject],
  );

  if (!pending) return null;

  return (
    <Sheet isVisible={open} onClose={close} title="Approval request">
      <ApprovalCard
        request={pending}
        onAccept={() => act("accept")}
        onReject={() => act("reject")}
      />
    </Sheet>
  );
}

function ApprovalCard({
  request,
  onAccept,
  onReject,
}: {
  request: ApprovalRequest;
  onAccept: () => void;
  onReject: () => void;
}) {
  const mode = useThemeMode();
  const t = theme(mode);
  const [confirming, setConfirming] = useState(false);

  const approve = useCallback(() => {
    if (request.destructive && !confirming) {
      setConfirming(true);
      return;
    }
    onAccept();
  }, [request.destructive, confirming, onAccept]);

  return (
    <View style={s.card}>
      <View
        style={[
          s.hostBox,
          { backgroundColor: t.surface2, borderColor: t.border },
        ]}
      >
        <Ionicons name="desktop-outline" size={13} color={t.textMuted} />
        <Text style={{ color: t.textMuted, fontSize: 12 }}>Runs on</Text>
        <Text
          style={{ color: t.text, fontSize: 15, fontWeight: "700" }}
          numberOfLines={1}
        >
          {request.host ?? "your Mac"}
        </Text>
      </View>

      <View style={s.toolRow}>
        <Ionicons
          name={request.destructive ? "warning-outline" : "flash-outline"}
          size={16}
          color={request.destructive ? t.danger : t.accent}
        />
        <Text style={{ color: t.text, fontSize: 15, fontWeight: "600" }}>
          {request.tool}
        </Text>
        {request.destructive ? (
          <Text style={{ color: t.danger, fontSize: 12, fontWeight: "600" }}>
            destructive
          </Text>
        ) : null}
      </View>

      {request.command ? (
        <View style={[s.preview, { backgroundColor: t.surface2 }]}>
          <Text
            style={{ color: t.text, fontFamily: "Menlo", fontSize: 13 }}
            selectable
          >
            {request.command}
          </Text>
        </View>
      ) : null}

      {request.preview ? (
        <View style={[s.preview, { backgroundColor: t.surface2 }]}>
          <Text style={{ color: t.text, fontSize: 13 }}>{request.preview}</Text>
        </View>
      ) : null}

      {request.cwd ? (
        <Text style={{ color: t.textMuted, fontSize: 12 }} numberOfLines={1}>
          in {request.cwd}
        </Text>
      ) : null}

      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onReject}
          style={[s.button, { backgroundColor: t.surface2 }]}
        >
          <Text style={{ color: t.text, fontWeight: "600" }}>Reject</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={approve}
          style={[
            s.button,
            { backgroundColor: request.destructive ? t.danger : t.accent },
          ]}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            {request.destructive && !confirming ? "Approve…" : "Approve"}
          </Text>
        </Pressable>
      </View>
      {request.destructive ? (
        <Text style={{ color: t.textMuted, fontSize: 11, textAlign: "center" }}>
          Destructive tools need a second tap to approve.
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 12 },
  hostBox: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 2,
  },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  preview: { borderRadius: 8, padding: 10 },
  actions: { flexDirection: "row", gap: 10, marginTop: 4 },
  button: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
});
