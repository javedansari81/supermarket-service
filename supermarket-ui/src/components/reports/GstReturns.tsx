/**
 * GST return reports (GSTR-1 and GSTR-3B) for a return period
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert, Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import api from '../../services/api';
import { API_ENDPOINTS } from '../../config/api';
import toast from 'react-hot-toast';

interface TaxAmounts { taxable_value: number; igst: number; cgst: number; sgst: number; }
interface RateRow extends TaxAmounts { rate: number; }
interface GstDocument {
  invoice_no?: string; invoice_date?: string; invoice_value?: number;
  note_no?: string; note_date?: string; note_value?: number;
  gstin?: string; receiver_name?: string; place_of_supply: string; rates: RateRow[];
}
interface HsnRow extends TaxAmounts { hsn_code: string; uqc: string; rate: number; quantity: number; total_value: number; }
interface DocumentsRow { nature: string; from_no: string; to_no: string; total: number; cancelled: number; net_issued: number; }
interface Gstr1 {
  b2b: GstDocument[]; b2cl: GstDocument[]; b2cs: (RateRow & { place_of_supply: string })[];
  nil_exempt: { description: string; nil_rated_exempt: number }[];
  cdnr: GstDocument[]; cdnur: GstDocument[]; hsn_b2b: HsnRow[]; hsn_b2c: HsnRow[];
  documents: DocumentsRow[]; totals: TaxAmounts & { total_tax: number }; warnings: string[];
}
type Heads = { igst: number; cgst: number; sgst: number };
interface PaymentRow { head: keyof Heads; liability: number; paid_by_igst_credit: number; paid_by_cgst_credit: number; paid_by_sgst_credit: number; cash: number; }
interface Gstr3b {
  outward_taxable: TaxAmounts; outward_nil_exempt: number;
  interstate_unregistered: { place_of_supply: string; taxable_value: number; igst: number }[];
  itc_available: Heads; inward_exempt: { inter_state: number; intra_state: number };
  tax_payment: PaymentRow[]; itc_balance: Heads; warnings: string[];
}

interface Column<T> { label: string; value: (row: T) => React.ReactNode; money?: boolean; }

const rupees = (n: number) => `₹${Number(n || 0).toFixed(2)}`;
const HEAD_LABELS: Record<keyof Heads, string> = { igst: 'IGST', cgst: 'CGST', sgst: 'SGST' };
const TAX_COLUMNS: Column<TaxAmounts>[] = [
  { label: 'Taxable Value', value: (r) => r.taxable_value, money: true },
  { label: 'IGST', value: (r) => r.igst, money: true },
  { label: 'CGST', value: (r) => r.cgst, money: true },
  { label: 'SGST', value: (r) => r.sgst, money: true },
];

function Section<T>({ title, rows, columns }: { title: string; rows: T[]; columns: Column<T>[] }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>{title}</Typography>
      {rows.length === 0 ? <Typography variant="body2" color="text.secondary">Nothing to report</Typography> : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow>{columns.map((c) => <TableCell key={c.label} align={c.money ? 'right' : 'left'}>{c.label}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {columns.map((c) => {
                    const v = c.value(row);
                    return <TableCell key={c.label} align={c.money ? 'right' : 'left'}>{c.money ? rupees(Number(v)) : v}</TableCell>;
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

// One row per GST rate of each invoice / credit note, as the GST portal lists them
type DocRateRow = RateRow & { doc: GstDocument };
const byRate = (docs: GstDocument[]): DocRateRow[] => docs.flatMap((doc) => doc.rates.map((r) => ({ ...r, doc })));
const docColumns = (kind: 'invoice' | 'note', registered: boolean): Column<DocRateRow>[] => [
  ...(registered ? [{ label: 'GSTIN', value: (r: DocRateRow) => r.doc.gstin }, { label: 'Buyer', value: (r: DocRateRow) => r.doc.receiver_name }] : []),
  { label: kind === 'invoice' ? 'Invoice No' : 'Note No', value: (r) => (kind === 'invoice' ? r.doc.invoice_no : r.doc.note_no) },
  { label: 'Date', value: (r) => (kind === 'invoice' ? r.doc.invoice_date : r.doc.note_date) },
  { label: 'Value', value: (r) => (kind === 'invoice' ? r.doc.invoice_value : r.doc.note_value) ?? 0, money: true },
  { label: 'Place of Supply', value: (r) => r.doc.place_of_supply || '-' },
  { label: 'Rate %', value: (r) => r.rate },
  ...TAX_COLUMNS,
];

const hsnColumns: Column<HsnRow>[] = [
  { label: 'HSN', value: (r) => r.hsn_code || '(none)' }, { label: 'UQC', value: (r) => r.uqc },
  { label: 'Quantity', value: (r) => r.quantity }, { label: 'Rate %', value: (r) => r.rate },
  ...TAX_COLUMNS, { label: 'Total Value', value: (r) => r.total_value, money: true },
];

interface Props { fromDate?: string; toDate?: string; }

const GstReturns: React.FC<Props> = ({ fromDate, toDate }) => {
  const [form, setForm] = useState<'gstr1' | 'gstr3b'>('gstr1');
  const [gstr1, setGstr1] = useState<Gstr1 | null>(null);
  const [gstr3b, setGstr3b] = useState<Gstr3b | null>(null);

  const fetchReport = useCallback(async () => {
    if (!fromDate || !toDate) return;
    const params = { from_date: fromDate, to_date: toDate };
    try {
      if (form === 'gstr1') setGstr1((await api.get<Gstr1>(API_ENDPOINTS.REPORTS_GSTR1, { params })).data);
      else setGstr3b((await api.get<Gstr3b>(API_ENDPOINTS.REPORTS_GSTR3B, { params })).data);
    } catch (error) { toast.error('Failed to fetch GST report'); }
  }, [form, fromDate, toDate]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const warnings = (form === 'gstr1' ? gstr1?.warnings : gstr3b?.warnings) || [];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <ToggleButtonGroup size="small" exclusive value={form} onChange={(_, v) => v && setForm(v)}>
          <ToggleButton value="gstr1">GSTR-1</ToggleButton>
          <ToggleButton value="gstr3b">GSTR-3B</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Prepared from bills, credit notes and purchases in the selected period. Check with your CA before filing.
        </Typography>
      </Box>
      {warnings.map((w) => <Alert key={w} severity="warning" sx={{ mb: 1 }}>{w}</Alert>)}
      {form === 'gstr1' && gstr1 && (
        <>
          <Section title="Net Totals (all tables)" rows={[gstr1.totals]}
            columns={[...TAX_COLUMNS, { label: 'Total Tax', value: (r) => r.total_tax, money: true }]} />
          <Section title="4A - B2B Invoices (buyer with GSTIN)" rows={byRate(gstr1.b2b)} columns={docColumns('invoice', true)} />
          <Section title="5 - B2C Large (inter-state, invoice above ₹1,00,000)" rows={byRate(gstr1.b2cl)} columns={docColumns('invoice', false)} />
          <Section title="7 - B2C Small (net of credit notes)" rows={gstr1.b2cs}
            columns={[{ label: 'Place of Supply', value: (r) => r.place_of_supply || '-' }, { label: 'Rate %', value: (r) => r.rate }, ...TAX_COLUMNS]} />
          <Section title="8 - Nil Rated / Exempt (0% items)" rows={gstr1.nil_exempt}
            columns={[{ label: 'Description', value: (r) => r.description }, { label: 'Nil Rated / Exempt', value: (r) => r.nil_rated_exempt, money: true }]} />
          <Section title="9B - Credit Notes to Registered Buyers (CDNR)" rows={byRate(gstr1.cdnr)} columns={docColumns('note', true)} />
          <Section title="9B - Credit Notes on B2C Large Invoices (CDNUR)" rows={byRate(gstr1.cdnur)} columns={docColumns('note', false)} />
          <Section title="12 - HSN Summary: B2B" rows={gstr1.hsn_b2b} columns={hsnColumns} />
          <Section title="12 - HSN Summary: B2C" rows={gstr1.hsn_b2c} columns={hsnColumns} />
          <Section title="13 - Documents Issued" rows={gstr1.documents} columns={[
            { label: 'Nature', value: (r) => r.nature }, { label: 'From', value: (r) => r.from_no }, { label: 'To', value: (r) => r.to_no },
            { label: 'Total', value: (r) => r.total }, { label: 'Cancelled', value: (r) => r.cancelled }, { label: 'Net Issued', value: (r) => r.net_issued },
          ]} />
        </>
      )}
      {form === 'gstr3b' && gstr3b && (
        <>
          <Section title="3.1 - Outward Supplies (net of credit notes)" rows={[
            { label: '(a) Taxable supplies (other than zero, nil rated and exempt)', ...gstr3b.outward_taxable },
            { label: '(c) Nil rated and exempt', taxable_value: gstr3b.outward_nil_exempt, igst: 0, cgst: 0, sgst: 0 },
          ]} columns={[{ label: 'Nature of Supplies', value: (r) => r.label }, ...TAX_COLUMNS]} />
          <Section title="3.2 - Inter-state Supplies to Unregistered Persons" rows={gstr3b.interstate_unregistered} columns={[
            { label: 'Place of Supply', value: (r) => r.place_of_supply || '-' },
            { label: 'Taxable Value', value: (r) => r.taxable_value, money: true }, { label: 'IGST', value: (r) => r.igst, money: true },
          ]} />
          <Section title="4 - Eligible ITC: (A)(5) All other ITC = (C) Net ITC" rows={[gstr3b.itc_available]} columns={[
            { label: 'IGST', value: (r) => r.igst, money: true }, { label: 'CGST', value: (r) => r.cgst, money: true }, { label: 'SGST', value: (r) => r.sgst, money: true },
          ]} />
          <Section title="5 - Exempt, Nil Rated and No-GST Purchases" rows={[gstr3b.inward_exempt]} columns={[
            { label: 'Inter-state', value: (r) => r.inter_state, money: true }, { label: 'Intra-state', value: (r) => r.intra_state, money: true },
          ]} />
          <Section title="6.1 - Payment of Tax (estimate; the GST portal does the final set-off)" rows={gstr3b.tax_payment} columns={[
            { label: 'Tax', value: (r) => HEAD_LABELS[r.head] }, { label: 'Tax Payable', value: (r) => r.liability, money: true },
            { label: 'Paid by IGST Credit', value: (r) => r.paid_by_igst_credit, money: true },
            { label: 'Paid by CGST Credit', value: (r) => r.paid_by_cgst_credit, money: true },
            { label: 'Paid by SGST Credit', value: (r) => r.paid_by_sgst_credit, money: true },
            { label: 'Paid in Cash', value: (r) => r.cash, money: true },
          ]} />
          <Section title="ITC Left to Carry Forward" rows={[gstr3b.itc_balance]} columns={[
            { label: 'IGST', value: (r) => r.igst, money: true }, { label: 'CGST', value: (r) => r.cgst, money: true }, { label: 'SGST', value: (r) => r.sgst, money: true },
          ]} />
        </>
      )}
    </Box>
  );
};

export default GstReturns;
