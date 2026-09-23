import { Printer, X } from 'lucide-react';
import PaymentQrCard from './PaymentQrCard';
import type { Invoice } from '@/types/db';

interface InvoiceViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  onPaymentConfirmed?: (paymentRef: string) => Promise<void>;
  readOnly?: boolean;
}

export default function InvoiceViewModal({
  isOpen,
  onClose,
  invoice,
  onPaymentConfirmed,
  readOnly = false,
}: InvoiceViewModalProps) {
  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const isPaid = invoice.status === 'PAID';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-900/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-zinc-200 flex flex-col my-8 max-h-[92vh]">
        {/* Modal Controls Bar */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/70 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">
              {invoice.invoiceNumber}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isPaid
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {invoice.status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="h-8 px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer size={13} /> Print / PDF
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full border border-zinc-200 hover:bg-zinc-100 flex items-center justify-center text-zinc-500 cursor-pointer transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Invoice Printable Document Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-zinc-800 print:p-0">
          {/* Header Brand */}
          <div className="flex justify-between items-start border-b border-zinc-200 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm">
                  FS
                </div>
                <h2 className="text-lg font-black text-zinc-900 tracking-tight">FieldSync</h2>
              </div>
              <p className="text-[11px] text-zinc-500 mt-1">Enterprise Field Service Automation</p>
              <p className="text-[10px] text-zinc-400">GSTIN: 33AAECF9012K1Z8 • Chennai, India</p>
            </div>

            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-zinc-400 block tracking-wider">
                TAX INVOICE
              </span>
              <h3 className="text-base font-black font-mono text-zinc-900">{invoice.invoiceNumber}</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Date: {new Date(invoice.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Customer & Technician Meta */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80">
            <div>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Billed To:
              </span>
              <h4 className="font-bold text-sm text-zinc-900">{invoice.customerName}</h4>
              {invoice.customerEmail && <p className="text-zinc-500 text-[11px]">{invoice.customerEmail}</p>}
              {invoice.customerPhone && <p className="text-zinc-500 text-[11px]">{invoice.customerPhone}</p>}
            </div>

            <div className="text-right">
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                Serviced By:
              </span>
              <h4 className="font-bold text-sm text-zinc-900">{invoice.technicianName}</h4>
              <p className="text-zinc-500 text-[11px]">Field Technical Specialist</p>
              <p className="text-indigo-600 font-mono text-[10px] font-semibold mt-0.5">
                Ticket: {invoice.inspectionTitle}
              </p>
            </div>
          </div>

          {/* Itemized Charges Table */}
          <div className="border border-zinc-200 rounded-2xl overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-zinc-100/70 border-b border-zinc-200 text-zinc-500 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3 text-right">Category</th>
                  <th className="py-2.5 px-3 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <tr>
                  <td className="py-2.5 px-3 font-medium">Field Diagnostic & Specialized Labour</td>
                  <td className="py-2.5 px-3 text-right text-zinc-500">Service</td>
                  <td className="py-2.5 px-3 text-right font-mono font-semibold">
                    ₹{Number(invoice.labourCharges).toFixed(2)}
                  </td>
                </tr>
                {Number(invoice.partsCharges) > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Replaced Components / Materials</td>
                    <td className="py-2.5 px-3 text-right text-zinc-500">Hardware</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      ₹{Number(invoice.partsCharges).toFixed(2)}
                    </td>
                  </tr>
                )}
                {Number(invoice.travelCharges) > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Conveyance & Technical Travel</td>
                    <td className="py-2.5 px-3 text-right text-zinc-500">Logistics</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      ₹{Number(invoice.travelCharges).toFixed(2)}
                    </td>
                  </tr>
                )}
                {Number(invoice.otherCharges) > 0 && (
                  <tr>
                    <td className="py-2.5 px-3 font-medium">Sundry / Environmental Fee</td>
                    <td className="py-2.5 px-3 text-right text-zinc-500">Other</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      ₹{Number(invoice.otherCharges).toFixed(2)}
                    </td>
                  </tr>
                )}
                {Number(invoice.discount) > 0 && (
                  <tr className="text-emerald-700 bg-emerald-50/30">
                    <td className="py-2.5 px-3 font-medium">Special Privilege Discount</td>
                    <td className="py-2.5 px-3 text-right text-emerald-600">Credit</td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold">
                      -₹{Number(invoice.discount).toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-zinc-50/50 border-t border-zinc-200 font-semibold">
                <tr>
                  <td colSpan={2} className="py-2 px-3 text-right text-zinc-500">
                    Subtotal:
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-zinc-900">
                    ₹{Number(invoice.subtotal).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} className="py-2 px-3 text-right text-zinc-500">
                    Integrated GST ({invoice.taxPercent}%):
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-zinc-900">
                    ₹{Number(invoice.taxAmount).toFixed(2)}
                  </td>
                </tr>
                <tr className="border-t border-zinc-200 text-sm font-bold text-indigo-950 bg-indigo-50/30">
                  <td colSpan={2} className="py-2.5 px-3 text-right">
                    Grand Total:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-black text-indigo-600 text-base">
                    ₹{Number(invoice.grandTotal).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-zinc-600 text-[11px]">
              <span className="font-bold text-zinc-800 block mb-0.5">Notes:</span>
              {invoice.notes}
            </div>
          )}

          {/* Integrated QR Payment Section (Hidden during print if already settled) */}
          <div className="print:hidden">
            <PaymentQrCard
              invoice={invoice}
              onPaymentConfirmed={onPaymentConfirmed}
              readOnly={readOnly}
            />
          </div>

          {/* Legal Footer */}
          <div className="pt-4 border-t border-zinc-200 text-[10px] text-zinc-400 text-center space-y-0.5">
            <p>This is a computer-generated tax invoice verified under FieldSync Digital Audit trail.</p>
            <p>Payment terms: Immediate on-site settlement via UPI or registered corporate account.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
