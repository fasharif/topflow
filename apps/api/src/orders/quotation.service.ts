import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

const NAVY = '#0A192F';
const TEAL = '#0284C7';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';

interface QuotationItem {
  sku: string;
  productName: string;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
}

interface QuotationOrder {
  orderNumber: string;
  createdAt: Date;
  projectReference: string | null;
  shippingAddress: string;
  totalAmount: number | string;
  currency: string;
  notes: string | null;
  items: QuotationItem[];
  user: {
    fullName: string;
    email: string;
    companyName: string | null;
    phoneNumber: string;
  } | null;
}

function money(value: number | string): string {
  return Number(value).toFixed(2);
}

@Injectable()
export class QuotationService {
  generatePdf(order: QuotationOrder): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.drawHeader(doc, order);
      this.drawPartyDetails(doc, order);
      this.drawItemsTable(doc, order);
      this.drawTotals(doc, order);
      this.drawFooter(doc);

      doc.end();
    });
  }

  private drawHeader(doc: PDFKit.PDFDocument, order: QuotationOrder) {
    doc.rect(0, 0, doc.page.width, 100).fill(NAVY);

    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text('TOP FLOW', 50, 32);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#CBD5E1')
      .text('Irrigation & Flow-Control Supplies  ·  United Arab Emirates', 50, 62);

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .fillColor(TEAL)
      .text('QUOTATION', 0, 32, { align: 'right', width: doc.page.width - 50 });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#FFFFFF')
      .text(order.orderNumber, 0, 55, { align: 'right', width: doc.page.width - 50 });
    doc
      .fontSize(9)
      .fillColor('#CBD5E1')
      .text(
        new Date(order.createdAt).toLocaleDateString('en-AE', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        0,
        70,
        { align: 'right', width: doc.page.width - 50 },
      );

    doc.fillColor('#000000');
    doc.y = 130;
  }

  private drawPartyDetails(doc: PDFKit.PDFDocument, order: QuotationOrder) {
    const startY = doc.y;

    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('QUOTED TO', 50, startY);
    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    doc.text(order.user?.fullName ?? 'N/A', 50, startY + 14);
    if (order.user?.companyName) {
      doc.text(order.user.companyName, 50, doc.y);
    }
    doc.text(order.user?.email ?? '', 50, doc.y);
    doc.text(order.user?.phoneNumber ?? '', 50, doc.y);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('PROJECT / DELIVERY', 320, startY);
    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    doc.text(order.projectReference ?? 'Not specified', 320, startY + 14, { width: 225 });
    doc.text(order.shippingAddress, 320, doc.y, { width: 225 });

    doc.y = Math.max(doc.y, startY + 90);
    doc.moveDown(1);
  }

  private drawItemsTable(doc: PDFKit.PDFDocument, order: QuotationOrder) {
    const tableTop = doc.y;
    const col = { sku: 50, desc: 146, qty: 350, unit: 400, total: 470 };

    doc.rect(50, tableTop, doc.page.width - 100, 22).fill(NAVY);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
    doc.text('SKU', col.sku + 6, tableTop + 6);
    doc.text('DESCRIPTION', col.desc, tableTop + 6);
    doc.text('QTY', col.qty, tableTop + 6, { width: 40, align: 'right' });
    doc.text('UNIT PRICE', col.unit, tableTop + 6, { width: 65, align: 'right' });
    doc.text('TOTAL', col.total, tableTop + 6, { width: 65, align: 'right' });

    let y = tableTop + 22;
    doc.font('Helvetica').fontSize(9);

    order.items.forEach((item, i) => {
      if (y > doc.page.height - 150) {
        doc.addPage();
        y = 50;
      }
      const rowHeight = 24;
      if (i % 2 === 1) {
        doc.rect(50, y, doc.page.width - 100, rowHeight).fill('#F8FAFC');
      }
      doc.fillColor('#000000');
      doc.text(item.sku, col.sku + 6, y + 7, { width: 85 });
      doc.text(item.productName, col.desc, y + 7, { width: 195 });
      doc.text(String(item.quantity), col.qty, y + 7, { width: 40, align: 'right' });
      doc.text(money(item.unitPrice), col.unit, y + 7, { width: 65, align: 'right' });
      doc.text(money(item.totalPrice), col.total, y + 7, { width: 65, align: 'right' });
      y += rowHeight;
    });

    doc.rect(50, tableTop, doc.page.width - 100, y - tableTop).stroke(BORDER);
    doc.y = y + 10;
  }

  private drawTotals(doc: PDFKit.PDFDocument, order: QuotationOrder) {
    const y = doc.y + 10;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY);
    doc.text('TOTAL', 350, y, { width: 120, align: 'right' });
    doc.text(`${order.currency} ${money(order.totalAmount)}`, 350, y, { width: 185, align: 'right' });
    doc.fillColor('#000000');
    doc.y = y + 30;

    if (order.notes) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTES', 50, doc.y);
      doc.font('Helvetica').fontSize(9).fillColor('#000000').text(order.notes, 50, doc.y + 12, { width: 495 });
    }
  }

  private drawFooter(doc: PDFKit.PDFDocument) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        'This is a formal quotation, not a tax invoice. Prices valid for 14 days from issue date unless otherwise agreed.',
        50,
        doc.page.height - 60,
        { width: doc.page.width - 100, align: 'center' },
      );
  }
}