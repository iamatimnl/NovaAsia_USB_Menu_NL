from pathlib import Path
from html.parser import HTMLParser

class MenuParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sections = []
        self.current_section = None
        self.current_item = None
        self.buffer = ''
        self.in_h2 = self.in_h3 = self.in_strong = False

    def handle_starttag(self, tag, attrs):
        if tag == 'h2':
            self.buffer = ''
            self.in_h2 = True
        elif tag == 'h3':
            self.buffer = ''
            self.in_h3 = True
            self.current_item = {'name': '', 'price': ''}
        elif tag == 'strong':
            self.buffer = ''
            self.in_strong = True

    def handle_data(self, data):
        if self.in_h2 or self.in_h3 or self.in_strong:
            self.buffer += data

    def handle_endtag(self, tag):
        if tag == 'h2' and self.in_h2:
            name = self.buffer.strip()
            self.current_section = {'name': name, 'items': []}
            self.sections.append(self.current_section)
            self.in_h2 = False
        elif tag == 'h3' and self.in_h3:
            self.current_item['name'] = self.buffer.strip()
            self.in_h3 = False
        elif tag == 'strong' and self.in_strong:
            self.current_item['price'] = self.buffer.strip()
            if self.current_section is not None:
                self.current_section['items'].append(self.current_item)
            self.current_item = None
            self.in_strong = False

html = Path('index.html').read_text(encoding='utf-8')
parser = MenuParser()
parser.feed(html)

def normalize(text: str) -> str:
    return text.replace('€', 'EUR').replace('–', '-').encode('latin-1', 'ignore').decode('latin-1')

sections = []
for sec in parser.sections:
    items = [(normalize(item['name']), normalize(item['price'])) for item in sec['items']]
    sections.append((sec['name'], items))

lines = ["Nova Asia - Digitale Menukaart"]
for section_name, items in sections:
    lines.append('')
    lines.append(section_name)
    for name, price in items:
        lines.append(f"  - {name} {price}")

def pdf_escape(text: str) -> str:
    return text.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')

leading = 14
content_lines = ["BT /F1 12 Tf {leading} TL 72 800 Td".format(leading=leading)]
for i, line in enumerate(lines):
    content_lines.append(f"({pdf_escape(line)}) Tj")
    if i != len(lines) - 1:
        content_lines.append('T*')
content_lines.append('ET')
content_stream = '\n'.join(content_lines)

objects = []
objects.append("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
objects.append("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
objects.append("3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n")
objects.append(f"4 0 obj << /Length {len(content_stream.encode('latin-1'))} >> stream\n{content_stream}\nendstream endobj\n")
objects.append("5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")

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

Path('google-menu.pdf').write_bytes(pdf.encode('latin-1'))
