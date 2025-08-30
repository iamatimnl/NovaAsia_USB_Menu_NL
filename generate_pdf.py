import re
from pathlib import Path

# Read HTML file
html = Path('google-menu.html').read_text(encoding='utf-8')

# Regex to extract sections and items
section_pattern = re.compile(r'<h2>(.*?)</h2>(.*?)</div>\s*</div>', re.DOTALL)
item_pattern = re.compile(r'<h3>(.*?)</h3>\s*<p>.*?</p>\s*<strong>(.*?)</strong>', re.DOTALL)

sections = []
for sec_match in section_pattern.finditer(html):
    section_name = re.sub(r'<.*?>', '', sec_match.group(1)).strip()
    section_body = sec_match.group(2)
    items = []
    for item_match in item_pattern.finditer(section_body):
        item_name = re.sub(r'<.*?>', '', item_match.group(1)).strip()
        item_price = re.sub(r'<.*?>', '', item_match.group(2)).strip()

        def normalize(text: str) -> str:
            return (
                text.replace('€', 'EUR').replace('–', '-').encode('latin-1', 'ignore').decode('latin-1')
            )

        items.append((normalize(item_name), normalize(item_price)))
    sections.append((section_name, items))

# Prepare text lines for PDF
lines = ["Nova Asia - Digitale Menukaart"]
for section_name, items in sections:
    lines.append('')
    lines.append(section_name)
    for name, price in items:
        lines.append(f"  - {name} {price}")

# Function to escape parentheses in PDF text
def pdf_escape(text: str) -> str:
    return text.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')

# Build PDF content
leading = 14
content_lines = ["BT /F1 12 Tf {leading} TL 72 800 Td".format(leading=leading)]
for i, line in enumerate(lines):
    content_lines.append(f"({pdf_escape(line)}) Tj")
    if i != len(lines) - 1:
        content_lines.append('T*')
content_lines.append('ET')
content_stream = '\n'.join(content_lines)

# PDF objects
objects = []
objects.append("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
objects.append("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
objects.append("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n")
objects.append(f"4 0 obj << /Length {len(content_stream.encode('latin-1'))} >> stream\n{content_stream}\nendstream endobj\n")
objects.append("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")

# Assemble PDF
pdf = "%PDF-1.4\n"
offsets = [0]
for obj in objects:
    offsets.append(len(pdf.encode('latin-1')))
    pdf += obj
xref_pos = len(pdf.encode('latin-1'))

pdf += f"xref\n0 {len(objects)+1}\n0000000000 65535 f \n"
for off in offsets[1:]:
    pdf += f"{off:010d} 00000 n \n"

pdf += f"trailer << /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF"

# Write PDF
Path('google-menu.pdf').write_bytes(pdf.encode('latin-1'))
