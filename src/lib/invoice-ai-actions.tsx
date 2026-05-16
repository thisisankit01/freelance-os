import { pdf } from "@react-pdf/renderer";
import { InvoicePDF } from "@/components/registry/InvoicePDF";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import type { Client, Invoice, InvoiceItem } from "@/types";

type InvoiceAiResult =
  | { ok: true; message: string; invoiceId?: string; invoiceNumber?: string }
  | { ok: false; message: string };

type InvoiceEmailRow = Invoice & {
  clients: Client | null;
  invoice_items: InvoiceItem[];
};

function formatAmount(value: number) {
  return Number(value.toFixed(2));
}

async function blobToBase64(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function findClientId(userId: string, clientName: string) {
  const normalized = clientName.trim();
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email")
    .eq("user_id", userId)
    .ilike("name", `%${normalized}%`)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0];
}

function makeInvoiceNumber() {
  return `INV-${nanoid(6).toUpperCase()}`;
}

function renderInvoiceEmailMessage(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*(invoiceNumber|clientName|total|freelancerName)\s*\}\}/g, (_, key: string) => {
    return values[key] ?? "";
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export async function createInvoiceViaAi(params: {
  clientName: string;
  amount?: number;
  description?: string;
}): Promise<InvoiceAiResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, message: "Sign in again to create invoices." };
  }
  const userId = authData.user.id;
  const clientRow = await findClientId(userId, params.clientName);
  if (!clientRow) {
    return { ok: false, message: `Client “${params.clientName}” not found.` };
  }

  const amount =
    params.amount != null ? formatAmount(Number(params.amount)) : 0;
  const description = params.description?.trim() || "Services rendered";
  const subtotal = amount;
  const gstRate: number = 18;
  const gstAmount = formatAmount((subtotal * gstRate) / 100);
  const total = formatAmount(subtotal + gstAmount);
  const invoiceNumber = makeInvoiceNumber();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .insert({
      user_id: userId,
      client_id: clientRow.id,
      invoice_number: invoiceNumber,
      status: "draft",
      subtotal,
      gst_rate: gstRate,
      gst_amount: gstAmount,
      total,
    })
    .select()
    .single();

  if (invoiceError || !invoice) {
    return {
      ok: false,
      message: invoiceError?.message || "Could not create invoice.",
    };
  }

  const { error: itemError } = await supabase.from("invoice_items").insert([
    {
      invoice_id: invoice.id,
      description,
      quantity: 1,
      rate: subtotal,
      amount: subtotal,
    },
  ]);

  if (itemError) {
    return {
      ok: false,
      message: itemError.message || "Failed to save invoice line item.",
    };
  }

  return {
    ok: true,
    message: `Created invoice ${invoiceNumber} for ${clientRow.name}.`,
    invoiceId: invoice.id,
    invoiceNumber,
  };
}

export async function emailInvoiceViaAi(params: {
  invoiceNumber?: string;
  clientName?: string;
  freelancerName: string;
  freelancerEmail: string;
}): Promise<InvoiceAiResult> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, message: "Sign in again to email invoices." };
  }

  let invoiceQuery = supabase
    .from("invoices")
    .select("*, invoice_items(*), clients(* )")
    .order("created_at", { ascending: false })
    .limit(1);

  if (params.invoiceNumber) {
    invoiceQuery = invoiceQuery.eq("invoice_number", params.invoiceNumber);
  } else if (params.clientName) {
    const clientRow = await findClientId(authData.user.id, params.clientName);
    if (!clientRow) {
      return { ok: false, message: `Client “${params.clientName}” not found.` };
    }
    invoiceQuery = invoiceQuery.eq("client_id", clientRow.id);
  } else {
    return {
      ok: false,
      message: "Specify an invoice number or client name to email.",
    };
  }

  const { data: invoices, error: invoiceError } = await invoiceQuery;
  if (invoiceError || !Array.isArray(invoices) || invoices.length === 0) {
    return { ok: false, message: "Invoice not found." };
  }
  const invoice = invoices[0] as InvoiceEmailRow;
  const client = invoice.clients;
  if (!client?.email) {
    return { ok: false, message: "Client has no email address on file." };
  }

  const { data: templates } = await supabase
    .from("invoice_templates")
    .select("default_email_subject, default_email_message")
    .eq("user_id", authData.user.id)
    .eq("is_default", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  const template = Array.isArray(templates) ? templates[0] : null;
  const values = {
    invoiceNumber: String(invoice.invoice_number || ""),
    clientName: String(client.name || ""),
    total: String(invoice.total || ""),
    freelancerName: params.freelancerName || "SoloOS",
  };
  const subject = renderInvoiceEmailMessage(
    template?.default_email_subject || "Invoice {{invoiceNumber}} from {{freelancerName}}",
    values,
  );
  const message = renderInvoiceEmailMessage(
    template?.default_email_message || "Hi {{clientName}}, please find your invoice attached.",
    values,
  );

  const blob = await pdf(
    <InvoicePDF
      invoice={invoice}
      client={client}
      freelancerName={params.freelancerName || "SoloOS"}
      freelancerEmail={params.freelancerEmail || "billing@soloos.app"}
    />,
  ).toBlob();

  const base64 = await blobToBase64(blob);
  const res = await fetch("/api/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: client.email,
      subject,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">Invoice ${invoice.invoice_number}</h2>
          <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Sent via SoloOS</p>
        </div>
      `,
      pdfBase64: base64,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, message: json.error || "Could not email invoice." };
  }

  return {
    ok: true,
    message: `Emailed ${invoice.invoice_number} to ${client.email}.`,
  };
}
