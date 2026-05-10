'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nanoid } from 'nanoid'
import { useUser } from '@clerk/nextjs'

type LineItem = { description: string; quantity: number; rate: number }
type Client = { id: string; name: string }

export function InvoiceBuilder() {
    const { user } = useUser()
    const userId = user?.id
    const [clients, setClients] = useState<Client[]>([])
    const [clientId, setClientId] = useState<string>('')
    const [items, setItems] = useState<LineItem[]>([
        { description: '', quantity: 1, rate: 0 }
    ])
    const [gst, setGst] = useState(18)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const subtotal = items.reduce((s, i) => s + i.quantity * i.rate, 0)
    const gstAmount = (subtotal * gst) / 100
    const total = subtotal + gstAmount

    // Load clients for the dropdown
    useEffect(() => {
        if (!userId) return
        supabase
            .from('clients')
            .select('id, name')
            .eq('user_id', userId)
            .order('name', { ascending: true })
            .then(({ data }) => {
                setClients(data || [])
                // Don't pre-select anything — user must explicitly choose
            })
    }, [userId])

    function updateItem(index: number, field: keyof LineItem, value: string | number) {
        setItems(prev => prev.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        ))
    }

    function addLine() {
        setItems(prev => [...prev, { description: '', quantity: 1, rate: 0 }])
    }

    function removeLine(index: number) {
        setItems(prev => prev.filter((_, i) => i !== index))
    }

    async function saveInvoice() {
        setError(null)

        if (!clientId) {
            setError('Please select a client before saving.')
            return
        }

        const validItems = items.filter(item => item.description && item.rate > 0)
        if (validItems.length === 0) {
            setError('Add at least one line item with a description and rate.')
            return
        }

        setSaving(true)
        const invoiceNumber = `INV-${nanoid(6).toUpperCase()}`

        const { data: invoice, error: insertError } = await supabase
            .from('invoices')
            .insert({
                user_id: '00000000-0000-0000-0000-000000000000',
                client_id: clientId,
                invoice_number: invoiceNumber,
                status: 'draft',
                subtotal,
                gst_rate: gst,
                gst_amount: gstAmount,
                total,
            })
            .select()
            .single()

        if (insertError || !invoice) {
            setError('Failed to save invoice. Please try again.')
            setSaving(false)
            return
        }

        await supabase.from('invoice_items').insert(
            validItems.map(item => ({
                invoice_id: invoice.id,
                description: item.description,
                quantity: item.quantity,
                rate: item.rate,
                amount: item.quantity * item.rate,
            }))
        )

        setSaving(false)
        setSaved(true)
        // Reset form
        setClientId('')
        setItems([{ description: '', quantity: 1, rate: 0 }])
        setTimeout(() => setSaved(false), 3000)
    }

    return (
        <motion.div
            layoutId="InvoiceBuilder"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5"
        >
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">New invoice</p>
                {saved && <span className="text-xs text-emerald-600 font-medium">✓ Saved!</span>}
            </div>

            {/* Client selector */}
            <div className="mb-4">
                <label className="text-xs text-zinc-500 dark:text-zinc-400 block mb-1.5">
                    Client <span className="text-red-400">*</span>
                </label>
                <select
                    value={clientId}
                    onChange={e => { setClientId(e.target.value); setError(null) }}
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                >
                    <option value="">— Select a client —</option>
                    {clients.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
            </div>

            {/* Line items */}
            <div className="space-y-2 mb-4">
                <div className="grid grid-cols-[1fr_70px_90px_30px] gap-2">
                    <span className="text-xs text-zinc-400">Description</span>
                    <span className="text-xs text-zinc-400 text-center">Qty</span>
                    <span className="text-xs text-zinc-400">Rate ₹</span>
                    <span />
                </div>
                {items.map((item, i) => (
                    <div key={i} className="grid grid-cols-[1fr_70px_90px_30px] gap-2 items-center">
                        <Input
                            placeholder="Logo design, dev work…"
                            value={item.description}
                            onChange={e => updateItem(i, 'description', e.target.value)}
                            className="text-sm"
                        />
                        <Input
                            type="number"
                            min={1}
                            placeholder="1"
                            value={item.quantity}
                            onChange={e => updateItem(i, 'quantity', Number(e.target.value))}
                            className="text-sm text-center"
                        />
                        <Input
                            type="number"
                            min={0}
                            placeholder="0"
                            value={item.rate || ''}
                            onChange={e => updateItem(i, 'rate', Number(e.target.value))}
                            className="text-sm"
                        />
                        {items.length > 1 && (
                            <button
                                onClick={() => removeLine(i)}
                                className="text-zinc-400 hover:text-red-500 text-base leading-none transition-colors"
                                title="Remove line"
                            >
                                ×
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <button onClick={addLine} className="text-xs text-violet-600 hover:text-violet-700 mb-4 transition-colors">
                + Add line item
            </button>

            {/* Totals */}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 space-y-1.5 text-sm mb-4">
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-zinc-600 dark:text-zinc-400 items-center">
                    <div className="flex items-center gap-2">
                        <span>GST</span>
                        <select
                            value={gst}
                            onChange={e => setGst(Number(e.target.value))}
                            className="text-xs border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5 bg-white dark:bg-zinc-800 outline-none"
                        >
                            {[0, 5, 12, 18, 28].map(r => (
                                <option key={r} value={r}>{r}%</option>
                            ))}
                        </select>
                    </div>
                    <span>₹{gstAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between font-semibold text-zinc-800 dark:text-zinc-200 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <span>Total</span>
                    <span>₹{total.toLocaleString('en-IN')}</span>
                </div>
            </div>

            {/* Error message */}
            {error && (
                <p className="text-xs text-red-500 mb-3">{error}</p>
            )}

            <Button
                onClick={saveInvoice}
                disabled={saving}
                className="w-full"
            >
                {saving ? 'Saving…' : 'Save invoice'}
            </Button>
        </motion.div>
    )
}