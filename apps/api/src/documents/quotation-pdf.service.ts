import { Injectable } from '@nestjs/common';
import {
  QuotationStatus,
  UOM_LABELS,
  bpsToPercent,
  formatMoney,
  percentToBps,
  type QuotationDto,
} from '@topflow/shared';
import PDFDocument from 'pdfkit';
import { InjectConfig } from '../config/config.module';
import type { AppConfig } from '../config/env';

const NAVY = '#0A192F';
const TEAL = '#0284C7';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';
const ZEBRA = '#F8FAFC';
const MARGIN = 40;

type Doc = PDFKit.PDFDocument;

const COLUMNS = [
  { key: 'index', label: '#', width: 22, align: 'left' },
  { key: 'sku', label: 'SKU', width: 70, align: 'left' },
  { key: 'description', label: 'DESCRIPTION', width: 150, align: 'left' },
  { key: 'qty', label: 'QTY', width: 40, align: 'right' },
  { key: 'unit', label: 'UNIT PRICE', width: 58, align: 'right' },
  { key: 'discount', label: 'DISC.', width: 34, align: 'right' },
  { key: 'net', label: 'NET', width: 56, align: 'right' },
  { key: 'vat', label: 'VAT', width: 42, align: 'right' },
  { key: 'total', label: 'TOTAL', width: 43, align: 'right' },
] as const;

/**
 * Renders a formal, VAT-aware quotation: supplier and customer TRNs, per-line VAT,
 * revision and validity, and a watermark for anything that is not a live offer.
 */
@Injectable()
export class QuotationPdfService {
  constructor(@InjectConfig() private readonly config: AppConfig) {}

  render(quotation: QuotationDto): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGIN,
        bufferPages: true,
        info: {
          Title: `Quotation ${quotation.displayNumber}`,
          Author: this.config.company.legalName,
        },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.header(doc, quotation);
      this.parties(doc, quotation);
      this.table(doc, quotation);
      this.totals(doc, quotation);
      this.terms(doc, quotation);
      this.decorateAllPages(doc, quotation);
      doc.end();
    });
  }

  private header(doc: Doc, q: QuotationDto): void {
    const { company } = this.config;
    const width = doc.page.width;
    doc.rect(0, 0, width, 110).fill(NAVY);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text('TOP FLOW', MARGIN, 30);
    doc.font('Helvetica').fontSize(8.5).fillColor('#CBD5E1');
    doc.text(company.legalName, MARGIN, 58);
    doc.text(
      `${company.address} · ${company.phone} · ${company.email}`,
      MARGIN,
      70,
    );
    if (company.trn) doc.text(`TRN ${company.trn}`, MARGIN, 82);

    const right = { width: width - MARGIN * 2, align: 'right' as const };
    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(TEAL)
      .text('QUOTATION', MARGIN, 28, right);
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#FFFFFF')
      .text(q.displayNumber, MARGIN, 50, right);
    doc.fontSize(8.5).fillColor('#CBD5E1');
    doc.text(`Issued ${this.date(q.sentAt ?? q.createdAt)}`, MARGIN, 66, right);
    doc.text(`Valid until ${this.date(q.validUntil)}`, MARGIN, 78, right);
    if (q.quoteRequest)
      doc.text(`Ref. ${q.quoteRequest.number}`, MARGIN, 90, right);
    doc.fillColor('#000000');
    doc.y = 132;
  }

  private parties(doc: Doc, q: QuotationDto): void {
    const top = doc.y;
    const label = (text: string, x: number, y: number) =>
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(text, x, y);

    label('QUOTED TO', MARGIN, top);
    doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
    const lines = [
      q.organization?.name,
      q.organization?.trn ? `TRN ${q.organization.trn}` : null,
      q.customer ? `Attn: ${q.customer.fullName}` : null,
      q.customer?.email,
    ].filter((line): line is string => Boolean(line));
    let y = top + 13;
    for (const line of lines) {
      doc.text(line, MARGIN, y, { width: 250 });
      y = doc.y;
    }

    label('PREPARED BY', 320, top);
    doc.font('Helvetica').fontSize(9.5).fillColor('#000000');
    doc.text(q.createdBy?.fullName ?? 'Top Flow Sales', 320, top + 13, {
      width: 235,
    });
    doc.text(
      `Currency: ${q.currency} · VAT ${bpsToPercent(q.vatRateBps).replace(/\.00$/, '')}%`,
      320,
      doc.y,
      { width: 235 },
    );
    if (q.purchaseOrderNumber)
      doc.text(`Customer PO: ${q.purchaseOrderNumber}`, 320, doc.y, {
        width: 235,
      });

    doc.y = Math.max(y, doc.y) + 18;
  }

  private table(doc: Doc, q: QuotationDto): void {
    const drawHeader = () => {
      const top = doc.y;
      doc.rect(MARGIN, top, doc.page.width - MARGIN * 2, 20).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
      let x = MARGIN + 4;
      for (const col of COLUMNS) {
        doc.text(col.label, x, top + 6.5, {
          width: col.width - 6,
          align: col.align,
        });
        x += col.width;
      }
      doc.y = top + 20;
    };

    drawHeader();
    q.items.forEach((item, index) => {
      const description = `${item.productName} (${UOM_LABELS[item.uom]})`;
      doc.font('Helvetica').fontSize(8);
      const rowHeight = Math.max(
        20,
        doc.heightOfString(description, { width: 144 }) + 10,
      );
      if (doc.y + rowHeight > doc.page.height - 120) {
        doc.addPage();
        doc.y = MARGIN + 10;
        drawHeader();
      }
      const top = doc.y;
      if (index % 2 === 1)
        doc
          .rect(MARGIN, top, doc.page.width - MARGIN * 2, rowHeight)
          .fill(ZEBRA);
      const discount =
        percentToBps(item.discountRate) > 0
          ? `${item.discountRate.replace(/\.00$/, '')}%`
          : '—';
      const values: Record<(typeof COLUMNS)[number]['key'], string> = {
        index: String(index + 1),
        sku: item.sku,
        description,
        qty: String(item.quantity),
        unit: item.listPrice ?? item.unitPrice,
        discount,
        net: item.lineSubtotal,
        vat: item.vatAmount,
        total: item.lineTotal,
      };
      doc.fillColor('#0F172A').font('Helvetica').fontSize(8);
      let x = MARGIN + 4;
      for (const col of COLUMNS) {
        doc.text(values[col.key], x, top + 6, {
          width: col.width - 6,
          align: col.align,
        });
        x += col.width;
      }
      doc
        .moveTo(MARGIN, top + rowHeight)
        .lineTo(doc.page.width - MARGIN, top + rowHeight)
        .lineWidth(0.5)
        .stroke(BORDER);
      doc.y = top + rowHeight;
    });
    doc.y += 12;
  }

  private totals(doc: Doc, q: QuotationDto): void {
    if (doc.y > doc.page.height - 190) {
      doc.addPage();
      doc.y = MARGIN + 10;
    }
    const rows: Array<[string, string, boolean?]> = [
      ['Subtotal (excl. VAT)', formatMoney(q.subtotal)],
      ...(percentToBps(q.discountTotal) > 0
        ? ([
            ['Discounts applied', `− ${formatMoney(q.discountTotal)}`],
          ] as Array<[string, string]>)
        : []),
      ...(percentToBps(q.deliveryFee) > 0
        ? ([['Delivery', formatMoney(q.deliveryFee)]] as Array<
            [string, string]
          >)
        : []),
      [
        `VAT (${bpsToPercent(q.vatRateBps).replace(/\.00$/, '')}%)`,
        formatMoney(q.vatAmount),
      ],
      ['TOTAL', formatMoney(q.total), true],
    ];
    const x = 330;
    const width = doc.page.width - MARGIN - x;
    for (const [label, value, strong] of rows) {
      const top = doc.y;
      if (strong) {
        doc.rect(x, top - 3, width, 22).fill(NAVY);
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10.5);
      } else {
        doc.fillColor('#0F172A').font('Helvetica').fontSize(9);
      }
      doc.text(label, x + 8, top + (strong ? 3 : 0), { width: width / 2 });
      doc.text(value, x, top + (strong ? 3 : 0), {
        width: width - 8,
        align: 'right',
      });
      doc.y = top + (strong ? 26 : 16);
    }
    doc.fillColor('#000000');
    doc.y += 10;
  }

  private terms(doc: Doc, q: QuotationDto): void {
    const section = (title: string, body: string) => {
      if (doc.y > doc.page.height - 130) {
        doc.addPage();
        doc.y = MARGIN + 10;
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(MUTED)
        .text(title, MARGIN, doc.y);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor('#0F172A')
        .text(body, MARGIN, doc.y + 3, { width: doc.page.width - MARGIN * 2 });
      doc.y += 10;
    };
    if (q.notes) section('NOTES', q.notes);
    section(
      'TERMS & CONDITIONS',
      q.terms ??
        `Prices are quoted in ${q.currency} and exclude VAT unless stated. This quotation is valid until ${this.date(q.validUntil)}. ` +
          'Delivery lead times are confirmed at order acceptance and subject to stock availability. ' +
          'This document is a commercial offer and not a tax invoice.',
    );
    if (this.config.company.bankDetails)
      section('BANK DETAILS', this.config.company.bankDetails);
  }

  private decorateAllPages(doc: Doc, q: QuotationDto): void {
    const range = doc.bufferedPageRange();
    const watermark = this.watermark(q);
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      if (watermark) {
        doc.save();
        doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
        doc
          .font('Helvetica-Bold')
          .fontSize(80)
          .fillColor('#94A3B8')
          .opacity(0.18);
        doc.text(watermark, 0, doc.page.height / 2 - 40, {
          width: doc.page.width,
          align: 'center',
        });
        doc.restore();
        doc.opacity(1);
      }
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED);
      doc.text(
        `${this.config.company.website} · Quotation ${q.displayNumber} · Page ${i - range.start + 1} of ${range.count}`,
        MARGIN,
        doc.page.height - 30,
        {
          width: doc.page.width - MARGIN * 2,
          align: 'center',
          lineBreak: false,
        },
      );
    }
  }

  private watermark(q: QuotationDto): string | null {
    if (q.status === QuotationStatus.DRAFT) return 'DRAFT';
    if (q.status === QuotationStatus.SUPERSEDED) return 'SUPERSEDED';
    if (q.isExpired) return 'EXPIRED';
    if (q.status === QuotationStatus.REJECTED) return 'REJECTED';
    return null;
  }

  private date(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Dubai',
    });
  }
}
