import re

# Read the file as raw bytes
d = open(r'C:\Users\bruno\.mavis\sessions\mvs_9b9468c29b384e81a594b685f6aace37\workspace\tactical.html', 'rb').read()
# Try to detect the encoding issue
# ??? typically = em-dash (0x97 in CP1252) or accented chars
# Let's find byte patterns
# 0x97 = em-dash in CP1252, appears as ??? in UTF-8 when file was saved as CP1252 but served as UTF-8
# But it could also be 0xE8 (è), 0xE9 (é), etc.

# Check for CP1252 high bytes that would be invalid UTF-8
utf8_issues = 0
for i, b in enumerate(d):
    if b > 127:
        # Check if this is a multi-byte UTF-8 sequence
        try:
            d[i:].decode('utf-8')
        except UnicodeDecodeError:
            utf8_issues += 1

print(f'Potential UTF-8 issues: {utf8_issues}')

# Let's just count the ? patterns more carefully
text = d.decode('latin-1')  # Try CP1252 equivalent
print('Latin-1 decode works')

# Count ? patterns in latin-1
issues = {}
for i in range(len(d)):
    if d[i] > 127:
        ctx = d[max(0,i-2):i+3]
        ch = d[i]
        print(f'  Byte {ch} (0x{ch:02X}) at {i}: context = {ctx}')
        if ch == 0x97:
            print('    -> em-dash (—)')
        elif ch == 0x93:
            print('    -> left double quote (")')
        elif ch == 0x94:
            print('    -> right double quote (")')
        elif ch == 0x92:
            print('    -> right single quote (\')')
        elif ch == 0x96:
            print('    -> en-dash (–)')