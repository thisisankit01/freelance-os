"use client";

import { Client, Invoice, InvoiceItem } from "@/types";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Line,
  Svg,
} from "@react-pdf/renderer";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  violet: "#6d28d9",
  violetLight: "#ede9fe",
  violetMid: "#8b5cf6",
  ink: "#0f0a1e",
  inkMid: "#3d3557",
  muted: "#7c7490",
  border: "#e5e0f5",
  bg: "#faf9ff",
  white: "#ffffff",
  green: "#059669",
  amber: "#b45309",
  red: "#dc2626",
};

// ─── Status helpers ─────────────────────────────────────────────────────────────
function statusColor(status: string) {
  switch (status.toLowerCase()) {
    case "paid":
      return { bg: "#d1fae5", text: "#065f46" };
    case "overdue":
      return { bg: "#fee2e2", text: "#991b1b" };
    case "sent":
      return { bg: "#ede9fe", text: "#5b21b6" };
    default:
      return { bg: "#f3f4f6", text: "#374151" }; // draft / etc.
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    backgroundColor: C.bg,
    fontFamily: "Helvetica",
    paddingBottom: 60,
  },

  // ── Accent bar ────────────────────────────────────────────────────────────────
  accentBar: {
    backgroundColor: C.violet,
    height: 6,
    width: "100%",
  },

  // ── Header strip ─────────────────────────────────────────────────────────────
  headerStrip: {
    backgroundColor: C.white,
    paddingHorizontal: 44,
    paddingTop: 32,
    paddingBottom: 28,
    borderBottom: `1 solid ${C.border}`,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  wordmark: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: C.violet,
    letterSpacing: 1,
  },
  wordmarkSub: {
    fontSize: 8,
    color: C.muted,
    letterSpacing: 2,
    marginTop: 2,
  },
  invoiceTitle: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    letterSpacing: -1,
    lineHeight: 1,
  },
  invoiceNumber: {
    fontSize: 11,
    color: C.muted,
    marginTop: 4,
    letterSpacing: 0.5,
  },

  // ── Meta row ─────────────────────────────────────────────────────────────────
  metaStrip: {
    backgroundColor: C.violetLight,
    paddingHorizontal: 44,
    paddingVertical: 14,
    flexDirection: "row",
    gap: 32,
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metaLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  metaValue: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.inkMid,
  },
  metaDivider: {
    width: 1,
    height: 20,
    backgroundColor: C.border,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.2,
  },

  // ── Body ─────────────────────────────────────────────────────────────────────
  body: {
    paddingHorizontal: 44,
    paddingTop: 28,
  },

  // ── Parties ──────────────────────────────────────────────────────────────────
  partiesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  partyBlock: {
    flex: 1,
  },
  partyBlockRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  partyTag: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1.8,
    color: C.violet,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: C.ink,
    marginBottom: 2,
  },
  partyLine: {
    fontSize: 10,
    color: C.muted,
    lineHeight: 1.5,
  },
  partyEmail: {
    fontSize: 10,
    color: C.violetMid,
  },

  // ── Table ────────────────────────────────────────────────────────────────────
  table: {
    marginBottom: 0,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: C.ink,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 4,
    marginBottom: 4,
  },
  thCell: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: C.border,
    letterSpacing: 1.2,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottom: `1 solid ${C.border}`,
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: `${C.violetLight}55`,
  },
  tdDesc: {
    flex: 3,
    fontSize: 10,
    color: C.inkMid,
  },
  tdQty: {
    flex: 1,
    fontSize: 10,
    color: C.muted,
    textAlign: "center",
  },
  tdRate: {
    flex: 1,
    fontSize: 10,
    color: C.muted,
    textAlign: "right",
  },
  tdAmount: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: C.inkMid,
    textAlign: "right",
  },

  // ── Totals ───────────────────────────────────────────────────────────────────
  totalsWrapper: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 20,
  },
  totalsBox: {
    width: 220,
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  totalLabel: {
    fontSize: 10,
    color: C.muted,
  },
  totalValue: {
    fontSize: 10,
    color: C.inkMid,
  },
  grandTotalBox: {
    backgroundColor: C.violet,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: C.violetLight,
    letterSpacing: 1,
  },
  grandTotalValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: C.white,
  },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.ink,
    paddingHorizontal: 44,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 9,
    color: C.muted,
    letterSpacing: 0.5,
  },
  footerBrand: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.violetMid,
    letterSpacing: 1,
  },
});

// ─── Component ──────────────────────────────────────────────────────────────────
export function InvoicePDF({
  invoice,
  client,
  freelancerName,
  freelancerEmail,
}: {
  invoice: Invoice;
  client: Client;
  freelancerName: string;
  freelancerEmail: string;
}) {
  const badge = statusColor(invoice.status);

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Top accent bar ── */}
        <View style={s.accentBar} />

        {/* ── Header strip ── */}
        <View style={s.headerStrip}>
          <View style={s.headerRow}>
            {/* Left: branding */}
            <View>
              <Text style={s.wordmark}>FreelanceOS</Text>
              <Text style={s.wordmarkSub}>PROFESSIONAL INVOICE</Text>
            </View>
            {/* Right: INVOICE + number */}
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.invoiceTitle}>INVOICE</Text>
              <Text style={s.invoiceNumber}>{invoice.invoice_number}</Text>
            </View>
          </View>
        </View>

        {/* ── Meta strip ── */}
        <View style={s.metaStrip}>
          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Date</Text>
            <Text style={s.metaValue}>
              {new Date(invoice.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>

          <View style={s.metaDivider} />

          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Due</Text>
            <Text style={s.metaValue}>{invoice.due_date || "—"}</Text>
          </View>

          <View style={s.metaDivider} />

          <View style={s.metaItem}>
            <Text style={s.metaLabel}>Status</Text>
            <View style={[s.statusBadge, { backgroundColor: badge.bg }]}>
              <Text style={[s.statusText, { color: badge.text }]}>
                {invoice.status.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Body ── */}
        <View style={s.body}>
          {/* ── Parties ── */}
          <View style={s.partiesRow}>
            <View style={s.partyBlock}>
              <Text style={s.partyTag}>FROM</Text>
              <Text style={s.partyName}>{freelancerName}</Text>
              <Text style={s.partyEmail}>{freelancerEmail}</Text>
            </View>
            <View style={s.partyBlockRight}>
              <Text style={s.partyTag}>BILL TO</Text>
              <Text style={s.partyName}>{client?.name}</Text>
              {client?.company ? (
                <Text style={s.partyLine}>{client.company}</Text>
              ) : null}
              <Text style={[s.partyLine, { color: C.violetMid }]}>
                {client?.email}
              </Text>
              {client?.city ? (
                <Text style={s.partyLine}>{client.city}</Text>
              ) : null}
            </View>
          </View>

          {/* ── Line items table ── */}
          <View style={s.table}>
            {/* Head */}
            <View style={s.tableHead}>
              <Text style={[s.thCell, { flex: 3 }]}>DESCRIPTION</Text>
              <Text style={[s.thCell, { flex: 1, textAlign: "center" }]}>
                QTY
              </Text>
              <Text style={[s.thCell, { flex: 1, textAlign: "right" }]}>
                RATE
              </Text>
              <Text style={[s.thCell, { flex: 1, textAlign: "right" }]}>
                AMOUNT
              </Text>
            </View>

            {Array.isArray(invoice.invoice_items) &&
              invoice.invoice_items.map((item: InvoiceItem, i: number) => (
                <View
                  key={i}
                  style={[s.tableRow, i % 2 === 1 ? s.tableRowAlt : {}]}
                >
                  <Text style={s.tdDesc}>{item.description}</Text>
                  <Text style={s.tdQty}>{item.quantity}</Text>
                  <Text style={s.tdRate}>
                    ₹{Number(item.rate).toLocaleString("en-IN")}
                  </Text>
                  <Text style={s.tdAmount}>
                    ₹{Number(item.amount).toLocaleString("en-IN")}
                  </Text>
                </View>
              ))}
          </View>

          {/* ── Totals ── */}
          <View style={s.totalsWrapper}>
            <View style={s.totalsBox}>
              <View style={s.totalLine}>
                <Text style={s.totalLabel}>Subtotal</Text>
                <Text style={s.totalValue}>
                  ₹{invoice.subtotal?.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={s.totalLine}>
                <Text style={s.totalLabel}>GST ({invoice.gst_rate}%)</Text>
                <Text style={s.totalValue}>
                  ₹{invoice.gst_amount?.toLocaleString("en-IN")}
                </Text>
              </View>
              <View style={s.grandTotalBox}>
                <Text style={s.grandTotalLabel}>TOTAL DUE</Text>
                <Text style={s.grandTotalValue}>
                  ₹{invoice.total?.toLocaleString("en-IN")}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            Thank you for your business. Payment within the due date is
            appreciated.
          </Text>
          <Text style={s.footerBrand}>FreelanceOS</Text>
        </View>
      </Page>
    </Document>
  );
}
