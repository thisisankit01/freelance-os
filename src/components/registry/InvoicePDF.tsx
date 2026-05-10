import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
    page: { padding: 40, fontFamily: 'Helvetica' },
    header: { fontSize: 28, marginBottom: 30, color: '#7c3aed', fontWeight: 'bold' },
    section: { marginBottom: 20 },
    row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    label: { fontSize: 11, color: '#666', marginBottom: 2 },
    value: { fontSize: 12, color: '#333' },
    bold: { fontWeight: 'bold' },
    tableHeader: { flexDirection: 'row', borderBottom: '1 solid #ddd', paddingBottom: 8, marginBottom: 8 },
    tableRow: { flexDirection: 'row', paddingVertical: 6 },
    tableCell: { flex: 1, fontSize: 11 },
    totalSection: { marginTop: 20, borderTop: '2 solid #7c3aed', paddingTop: 15 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    grandTotal: { fontSize: 16, fontWeight: 'bold', color: '#7c3aed', marginTop: 10 },
    footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 10, color: '#999', textAlign: 'center' }
})

export function InvoicePDF({ invoice, client, user }: { invoice: any, client: any, user: any }) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Text style={styles.header}>INVOICE</Text>

                {/* Invoice meta */}
                <View style={styles.section}>
                    <View style={styles.row}>
                        <View>
                            <Text style={styles.label}>Invoice Number</Text>
                            <Text style={[styles.value, styles.bold]}>{invoice.invoice_number}</Text>
                        </View>
                        <View style={{ textAlign: 'right' }}>
                            <Text style={styles.label}>Date</Text>
                            <Text style={styles.value}>{new Date(invoice.created_at).toLocaleDateString('en-IN')}</Text>
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View>
                            <Text style={styles.label}>Due Date</Text>
                            <Text style={styles.value}>{invoice.due_date || '—'}</Text>
                        </View>
                        <View style={{ textAlign: 'right' }}>
                            <Text style={styles.label}>Status</Text>
                            <Text style={[styles.value, styles.bold]}>{invoice.status.toUpperCase()}</Text>
                        </View>
                    </View>
                </View>

                {/* From / To */}
                <View style={styles.section}>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>From</Text>
                            <Text style={[styles.value, styles.bold]}>{user?.business_name || user?.name || 'Freelancer'}</Text>
                            <Text style={styles.value}>{user?.email}</Text>
                            {user?.gstin && <Text style={styles.value}>GSTIN: {user.gstin}</Text>}
                        </View>
                        <View style={{ flex: 1, textAlign: 'right' }}>
                            <Text style={styles.label}>Bill To</Text>
                            <Text style={[styles.value, styles.bold]}>{client?.name}</Text>
                            <Text style={styles.value}>{client?.company}</Text>
                            <Text style={styles.value}>{client?.email}</Text>
                            <Text style={styles.value}>{client?.city}</Text>
                        </View>
                    </View>
                </View>

                {/* Line items */}
                <View style={styles.section}>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableCell, { flex: 3 }]}>Description</Text>
                        <Text style={[styles.tableCell, { textAlign: 'center' }]}>Qty</Text>
                        <Text style={[styles.tableCell, { textAlign: 'right' }]}>Rate</Text>
                        <Text style={[styles.tableCell, { textAlign: 'right' }]}>Amount</Text>
                    </View>
                    {invoice.items?.map((item: any, i: number) => (
                        <View key={i} style={styles.tableRow}>
                            <Text style={[styles.tableCell, { flex: 3 }]}>{item.description}</Text>
                            <Text style={[styles.tableCell, { textAlign: 'center' }]}>{item.quantity}</Text>
                            <Text style={[styles.tableCell, { textAlign: 'right' }]}>₹{item.rate}</Text>
                            <Text style={[styles.tableCell, { textAlign: 'right' }]}>₹{item.amount}</Text>
                        </View>
                    ))}
                </View>

                {/* Totals */}
                <View style={styles.totalSection}>
                    <View style={styles.totalRow}>
                        <Text style={styles.label}>Subtotal</Text>
                        <Text style={styles.value}>₹{invoice.subtotal?.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={styles.totalRow}>
                        <Text style={styles.label}>GST ({invoice.gst_rate}%)</Text>
                        <Text style={styles.value}>₹{invoice.gst_amount?.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={[styles.totalRow, styles.grandTotal]}>
                        <Text>Total</Text>
                        <Text>₹{invoice.total?.toLocaleString('en-IN')}</Text>
                    </View>
                </View>

                <Text style={styles.footer}>Generated by FreelanceOS</Text>
            </Page>
        </Document>
    )
}